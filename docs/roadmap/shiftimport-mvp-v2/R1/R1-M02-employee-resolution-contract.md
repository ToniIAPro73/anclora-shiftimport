# R1-M02 — Employee Resolution Contract

## 1. Objetivo
Documentar y verificar el contrato de resolución de empleados durante importación: matching por `external_employee_id` y detección de team-roster.

## 2. Problema que resuelve
La lógica de qué fila de un archivo importado corresponde a qué `employee` existente (o crea uno nuevo) es crítica y no está documentada como contrato único.

## 3. Estado actual del repositorio
STATUS: DONE. `team-roster.ts` implementa detección multi-empleado; `employees` tiene unique `(organization_id, external_employee_id)` cuando presente; acceptance-corpus GS-01..10 cubre rosters multi-empleado.

## 4. Alcance IN
Documentar reglas de matching (por external_employee_id, por nombre cuando no hay id) y comportamiento cuando no hay match (crea empleado `pending_access` vs error).

## 5. Alcance OUT
No se modifica el algoritmo de matching.

## 6. Dependencias
R1-M00.

## 7. Decisiones arquitectónicas
Ninguna nueva — se documenta la existente.

## 8. Modelo de datos afectado
`employees` (external_employee_id, unique constraint) — sin cambios.

## 9. API / Backend
`api/employees/*`, `team-roster.ts` — documentar contrato, sin cambios de comportamiento.

## 10. Frontend / UX
N/A — motivo: sin cambios de UI.

## 11. Seguridad y autorización
Confirmar resolución de empleados respeta `organization_id` scope (no puede resolver a empleado de otra organización).

## 12. i18n
N/A — motivo: documento técnico.

## 13. Accesibilidad
N/A — motivo: sin UI.

## 14. Responsive / temas
N/A — motivo: sin UI.

## 15. Observabilidad / errores
Documentar qué ocurre cuando una fila no puede resolverse a ningún empleado (ignorado / error, según diagnostics.ts).

## 16. Migraciones
Ninguna.

## 17. Compatibilidad y datos existentes
N/A — motivo: sin cambios de esquema.

## 18. Tasks

### T01 — Documentar reglas de matching
Objetivo: Redactar el contrato de resolución (id externo, nombre, fallback, creación de nuevo empleado).
Archivos / módulos probables: `src/ingestion/team-roster.ts`, `api/_lib/data.js` (resolución de empleados).
Cambios: Añadir sección de reglas a este documento.
No hacer: No modificar código.
Criterios de aceptación:
- [ ] Reglas documentadas coinciden con el código leído.
Tests: Ninguno.
Evidencia esperada: Sección de reglas en este documento.

### T02 — Verificar aislamiento cross-tenant en resolución
Objetivo: Confirmar que ninguna consulta de resolución de empleado omite `organization_id`.
Archivos / módulos probables: `api/_lib/data.js`.
Cambios: Ninguno si correcto; si se detecta fuga, registrar como hallazgo bloqueante.
No hacer: No relajar el scope por organización.
Criterios de aceptación:
- [ ] Toda consulta de resolución de empleado incluye `organization_id` en el WHERE.
Tests: Ninguno adicional — revisión de código.
Evidencia esperada: Cita de líneas confirmando el scope.

## 19. Tests obligatorios
Suite existente de team-roster / acceptance-corpus (GS-01..10) debe seguir en verde.

## 20. Evidencias
Este documento, resultado de T02.

## 21. Gate
Gates obligatorios: G14 (Documentation), G12 (Security — tenant isolation en resolución).

## 22. Rollback / remediación
Si T02 detecta fuga cross-tenant: FAIL inmediato, remediar antes de continuar con cualquier otra microfase R1 (bloqueante de seguridad).

## 23. Criterio de DONE
Contrato de resolución de empleados documentado y aislamiento cross-tenant confirmado.
