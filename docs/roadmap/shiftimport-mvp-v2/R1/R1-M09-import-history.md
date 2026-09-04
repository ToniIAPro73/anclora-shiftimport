# R1-M09 — Import History

## 1. Objetivo
Documentar y verificar el historial de importaciones como registro auditable.

## 2. Problema que resuelve
Los administradores necesitan ver qué se importó, cuándo, por quién y con qué resultado.

## 3. Estado actual del repositorio
STATUS: DONE para T01, hallazgo real no corregido en T02 (ver abajo). Migración 0010 extiende `imports` con `import_mode`, `period_kind`, `period_label`, `scope_type`, `area_name_snapshot`, `employee_count`, `shift_count`, `created_shift_count`, `existing_shift_count`.

### T01 — Verificado

`listImports` (`api/_lib/data.js:1085`) filtra `WHERE i.organization_id = ${ctx.organizationId}` en ambas ramas (con/sin `areaId`) — sin excepción. Cobertura de test ya existente: `api/_lib/data.test.js:884` "import listings never leak across organizations" (`orgBCtx` ve 0 imports de `ORG_A`). **Sin fuga cross-tenant, con test que lo demuestra.**

### T02 — Hallazgo real, no corregido en esta microfase

`createImport` (`api/_lib/data.js:1149`) tiene `const status = 'completed';` **hardcodeado, sin condicional**. No existe ningún path de código que cree una fila `imports` con `status = 'failed'`, a pesar de que el CHECK constraint del esquema permite ese valor. En la práctica: `createRemoteImport` (cliente) solo se llama cuando ya hay turnos que escribir (`upserts.length > 0` / `entry.newShifts.length > 0`, `App.tsx:911`, `TeamImportModal.tsx:675`) — un fallo total (0 turnos válidos en todo el lote) nunca crea una fila `Import`; el usuario ve un `window.alert`/mensaje transitorio, pero **nada queda en el historial auditable**.

**Por qué no se corrige aquí**: decidir cuándo y con qué granularidad registrar un import "fallido" (¿todo el lote? ¿por empleado en team import?) es una decisión de producto/diseño, no una aplicación mecánica de un patrón ya existente (a diferencia de R1-M05/R1-M08). Tocar esto también interactúa con el invariante de "nada se escribe antes de confirmar" que R1-M06 acaba de verificar formalmente — cualquier cambio aquí necesita diseñarse con cuidado, no improvisarse dentro de una microfase de verificación documental.

**Recomendación**: registrar como ítem conocido pendiente en R1-M16 (Final Gate) — no bloquea el cierre de R1-M09 en sí, pero debe quedar explícito antes de declarar R1 completo, y requiere sign-off de producto sobre qué significa "importación fallida" en el historial antes de implementarse.

## 4. Alcance IN
Confirmar que la UI de historial expone estos campos de forma legible y que el registro se crea para toda importación (exitosa o fallida).

## 5. Alcance OUT
No se añaden nuevos campos al historial en esta microfase.

## 6. Dependencias
R1-M07.

## 7. Decisiones arquitectónicas
Ninguna nueva.

## 8. Modelo de datos afectado
`imports` — solo verificación, sin cambios.

## 9. API / Backend
Endpoint de listado de imports — confirmar que devuelve todos los campos relevantes con paginación adecuada.

## 10. Frontend / UX
Vista de historial de importaciones — confirmar legibilidad y que distingue individual vs team, single vs multi período.

## 11. Seguridad y autorización
Confirmar que el historial está `organization_id`-scoped (un admin no ve historial de otra organización).

## 12. i18n
Etiquetas del historial en ES/EN.

## 13. Accesibilidad
Tabla de historial navegable por teclado.

## 14. Responsive / temas
Historial usable en mobile y dark/light.

## 15. Observabilidad / errores
Imports fallidos deben quedar visibles en el historial con su motivo de fallo, no desaparecer.

## 16. Migraciones
Ninguna nueva — se referencia migración 0010 como cerrada.

## 17. Compatibilidad y datos existentes
N/A — motivo: verificación sobre esquema ya migrado.

## 18. Tasks

### T01 — Verificar aislamiento cross-tenant del historial
Objetivo: Confirmar que la consulta de historial siempre filtra por `organization_id` del usuario autenticado.
Archivos / módulos probables: endpoint de listado de imports, `api/_lib/data.js`.
Cambios: Ninguno si correcto.
No hacer: No relajar el filtro.
Criterios de aceptación:
- [x] Confirmado con cita de código el filtro por organización en toda consulta de historial.
Tests: `api/_lib/data.test.js:884` ("import listings never leak across organizations") — ya existente, en verde.
Evidencia esperada: Cita de línea (ver sección 3).

### T02 — Verificar que imports fallidos quedan visibles
Objetivo: Confirmar que un import con `status='failed'` aparece en el historial con su motivo.
Archivos / módulos probables: los mismos de T01.
Cambios: Ninguno si correcto; si no, añadir la visibilidad faltante.
No hacer: No ocultar fallos del historial.
Criterios de aceptación:
- [ ] Import fallido visible en historial con motivo legible. **No cumplido**: `status` es hardcodeado a `'completed'`, nunca `'failed'`; un fallo total no crea fila alguna. Ver hallazgo en sección 3 — no corregido en esta microfase, recomendado como ítem pendiente para R1-M16.
Tests: N/A — gap documentado, no implementado.
Evidencia esperada: Cita de `api/_lib/data.js:1149` + razonamiento de por qué no se corrige aquí (sección 3).

## 19. Tests obligatorios
Test de aislamiento cross-tenant (T01), test de visibilidad de fallos (T02).

## 20. Evidencias
Resultados de T01/T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G10 (Unit/integration tests), G12 (Security — tenant isolation).

Resultado: **PASS_WITH_WARNINGS**. G2/G10/G12 (aislamiento cross-tenant, sin riesgo de seguridad ni funcional) en PASS con evidencia. El hallazgo de T02 (imports fallidos no persistidos) no es un riesgo de seguridad ni de integridad de datos — es una laguna de auditoría/visibilidad que requiere una decisión de producto no tomada. Se documenta como warning explícito, absorbido como ítem pendiente para R1-M16 (Final Gate), consistente con la regla del master prompt §9 (PASS_WITH_WARNINGS permitido cuando no hay riesgo funcional/seguridad y una microfase futura lo absorbe).

## 22. Rollback / remediación
Si T01 detecta fuga cross-tenant: FAIL bloqueante, remediar antes de continuar.

## 23. Criterio de DONE
Historial de importaciones verificado como completo, aislado por tenant, y visible incluso para imports fallidos.
