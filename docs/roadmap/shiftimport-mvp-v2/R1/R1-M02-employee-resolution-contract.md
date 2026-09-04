# R1-M02 — Employee Resolution Contract

## 1. Objetivo
Documentar y verificar el contrato de resolución de empleados durante importación: matching por `external_employee_id` y detección de team-roster.

## 2. Problema que resuelve
La lógica de qué fila de un archivo importado corresponde a qué `employee` existente (o crea uno nuevo) es crítica y no está documentada como contrato único.

## 3. Estado actual del repositorio
STATUS: DONE. `team-roster.ts` implementa detección multi-empleado; `employees` tiene unique `(organization_id, external_employee_id)` cuando presente; acceptance-corpus GS-01..10 cubre rosters multi-empleado.

### Contrato de resolución verificado (T01), `bulkCreateEmployees` en `api/_lib/data.js:325-441`

1. Carga todos los empleados existentes de la organización (`WHERE organization_id = ${ctx.organizationId}`, línea 330-332) en dos mapas en memoria: `byExternalId` y `byName` (lowercased) — incluye empleados de **cualquier** status, para que uno `inactive` se reporte como `existing_inactive` en vez de duplicarse.
2. Para cada fila del import: si trae `externalEmployeeId`, matchea por ese id; si no, matchea por nombre (case-insensitive). Sin `name` → `status: 'failed', reason: 'invalid'`.
3. Si hay match → `status: 'existing'` (o `'existing_inactive'`), no crea nada.
4. Si no hay match → valida límite de plan (`maxEmployees`) y resolución de área; si pasa, `INSERT ... status 'pending_access'` con `ON CONFLICT (organization_id, external_employee_id) WHERE external_employee_id IS NOT NULL DO NOTHING` (líneas 408-421) — protege contra una fila duplicada dentro del mismo batch o una carrera concurrente; si pierde la carrera, re-consulta y reporta `'existing'` en vez de fallar.
5. Nunca crea un `User` — `user_id` queda `NULL` (comentario explícito línea 321-322); vincular un usuario es responsabilidad de otro flujo (R2-M04, ya DONE).
6. Fallo parcial es el diseño: una fila mala (`'failed'`) nunca aborta el resto del batch (línea 323).

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
- [x] Toda consulta de resolución de empleado incluye `organization_id` en el WHERE.
Tests: Ninguno adicional — revisión de código.
Evidencia esperada: `api/_lib/data.js:330-332` — `SELECT * FROM employees WHERE organization_id = ${ctx.organizationId}` es la única fuente de los mapas `byExternalId`/`byName` usados para matching; ninguna fila de otra organización puede entrar en el índice en memoria. **Sin fuga cross-tenant.**

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
