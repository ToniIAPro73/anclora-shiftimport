# R1-M09 — Import History

## 1. Objetivo
Documentar y verificar el historial de importaciones como registro auditable.

## 2. Problema que resuelve
Los administradores necesitan ver qué se importó, cuándo, por quién y con qué resultado.

## 3. Estado actual del repositorio
STATUS: DONE. T01 quedó verificado en esta microfase y T02 se cerró mediante P1-M01–P1-M09. La migración 0010 extiende `imports` con `import_mode`, `period_kind`, `period_label`, `scope_type`, `area_name_snapshot`, `employee_count`, `shift_count`, `created_shift_count`, `existing_shift_count`; P1 añade el resultado persistente y su motivo.

### T01 — Verificado

`listImports` (`api/_lib/data.js:1085`) filtra `WHERE i.organization_id = ${ctx.organizationId}` en ambas ramas (con/sin `areaId`) — sin excepción. Cobertura de test ya existente: `api/_lib/data.test.js:884` "import listings never leak across organizations" (`orgBCtx` ve 0 imports de `ORG_A`). **Sin fuga cross-tenant, con test que lo demuestra.**

### T02 — Cerrado por P1

La causa raíz documentada era que `createImport` fijaba `status='completed'` y que los fallos totales no dejaban fila. P1 introduce `ImportOutcome`, amplía el esquema con `0033_import_outcome.sql`, valida los estados en `createImport` y registra los bloqueos/fallos con motivo estructurado, entidad bloqueante y auditoría. Los reintentos bloqueados no consumen la clave de idempotencia.

Evidencia: `docs/product/IMPORT_OUTCOME_CONTRACT.md`, `api/_lib/data.test.js` (outcomes, bounded detail, idempotencia), `ImportResultModal.test.tsx` y `qa/e2e-acceptance/specs-gate/p1-import-outcome.spec.ts` (bloqueo→alta→reintento, sin diálogos nativos).

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
- [x] Un import bloqueado/fallido queda visible en historial con motivo legible; `blocking_employee_id` se valida dentro del tenant y se muestra su nombre cuando existe.
Tests: `api/_lib/data.test.js`, `db/migrations.test.mjs`, `qa/e2e-acceptance/specs-gate/p1-import-outcome.spec.ts`.
Evidencia esperada: estado `blocked`/`failed`, motivo, conteos y entidad bloqueante.

## 19. Tests obligatorios
Test de aislamiento cross-tenant (T01), test de visibilidad de fallos (T02).

## 20. Evidencias
Resultados de T01/T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G10 (Unit/integration tests), G12 (Security — tenant isolation).

Resultado: **PASS**. T01 y T02 están cerrados; la persistencia de outcomes se gobierna por P1 y conserva aislamiento, idempotencia y el contrato de no escritura previa a confirmación.

## 22. Rollback / remediación
Si T01 detecta fuga cross-tenant: FAIL bloqueante, remediar antes de continuar.

## 23. Criterio de DONE
Historial de importaciones verificado como completo, aislado por tenant, y visible incluso para imports bloqueados/fallidos.
