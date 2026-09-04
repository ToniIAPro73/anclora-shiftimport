# R1-M09 — Import History

## 1. Objetivo
Documentar y verificar el historial de importaciones como registro auditable.

## 2. Problema que resuelve
Los administradores necesitan ver qué se importó, cuándo, por quién y con qué resultado.

## 3. Estado actual del repositorio
STATUS: DONE. Migración 0010 extiende `imports` con `import_mode`, `period_kind`, `period_label`, `scope_type`, `area_name_snapshot`, `employee_count`, `shift_count`, `created_shift_count`, `existing_shift_count`.

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
- [ ] Confirmado con cita de código el filtro por organización en toda consulta de historial.
Tests: Test de integración de aislamiento cross-tenant (dos orgs, cada una ve solo su historial).
Evidencia esperada: Test en verde.

### T02 — Verificar que imports fallidos quedan visibles
Objetivo: Confirmar que un import con `status='failed'` aparece en el historial con su motivo.
Archivos / módulos probables: los mismos de T01.
Cambios: Ninguno si correcto; si no, añadir la visibilidad faltante.
No hacer: No ocultar fallos del historial.
Criterios de aceptación:
- [ ] Import fallido visible en historial con motivo legible.
Tests: Test de componente/integración.
Evidencia esperada: Test en verde.

## 19. Tests obligatorios
Test de aislamiento cross-tenant (T01), test de visibilidad de fallos (T02).

## 20. Evidencias
Resultados de T01/T02.

## 21. Gate
Gates obligatorios: G2 (Database/migrations), G10 (Unit/integration tests), G12 (Security — tenant isolation).

## 22. Rollback / remediación
Si T01 detecta fuga cross-tenant: FAIL bloqueante, remediar antes de continuar.

## 23. Criterio de DONE
Historial de importaciones verificado como completo, aislado por tenant, y visible incluso para imports fallidos.
