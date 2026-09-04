# R3-M05 — Assignment Editing

STATUS: DONE — PASS

## 1. Objetivo
API CRUD de `ShiftAssignment` dentro de una `ScheduleVersion` en estado DRAFT.

## 2. Problema que resuelve
Permite construir el contenido de un draft: añadir/editar/eliminar asignaciones antes de validarlas y publicarlas.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M04 (draft ya creado). El esquema de assignments es `0019_shift_assignments.sql` y el endpoint de draft está operativo.

## 4. Alcance IN
- `POST /api/schedules/:scheduleId/versions/:versionId/assignments` — crear assignment.
- `PATCH /api/schedules/:scheduleId/versions/:versionId/assignments/:id` — editar.
- `DELETE /api/schedules/:scheduleId/versions/:versionId/assignments/:id` — eliminar.
- Todas las mutaciones rechazadas (409) si la versión no está en DRAFT.

## 5. Alcance OUT
Validación de solapamiento/descanso (R3-M06/M07 — se aplican como capa adicional sobre estos mismos endpoints, no reimplementadas aquí).

## 6. Dependencias
R3-M04.

## 7. Decisiones arquitectónicas
Edición directa fila a fila (no bulk-replace) para mantener el historial de `updated_at` y simplificar el guard de "solo si DRAFT" por operación. Bulk import futuro (R3-M14) usa estos mismos endpoints internamente o una función de datos compartida, no un camino paralelo.

## 8. Modelo de datos afectado
Ninguno nuevo — usa `shift_assignments` de R3-M03.

## 9. API / Backend
- `POST .../assignments` body `{ employeeId: string(UUID), date, startTime, endTime, location? }` → 201.
- `PATCH .../assignments/:id` body parcial → 200.
- `DELETE .../assignments/:id` → 204.
- Guard común: `schedule_versions.status = 'DRAFT'` y organización/área coincide con la sesión, si no → 409 / 403.

## 10. Frontend / UX
N/A en esta microfase — consumido por el planner UI en R3-M08.

## 11. Seguridad y autorización
Rol PLANNER+, scope ORGANIZATION/AREA verificado server-side vía join `shift_assignments → schedule_versions → schedules`.

## 12. i18n
Códigos de error estables (`VERSION_NOT_EDITABLE`, `SCOPE_FORBIDDEN`) para traducción posterior en UI; esta microfase no introduce copy ni componentes.

## 13. Accesibilidad
N/A — sin UI.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
Errores 409 (versión no editable) y 403 (sin permiso) diferenciados explícitamente, para que la UI (R3-M08) pueda mostrar mensajes distintos.

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A — funcionalidad nueva.

## 18. Tasks

### T01 — Crear/editar/eliminar assignment
Objetivo: implementar los 3 endpoints con el guard de estado DRAFT.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/[versionId]/assignments/index.js` y `[id].js` (o convención de rutas equivalente ya usada en el repo para sub-recursos — verificar patrón en `api/format-profiles/`).
Cambios: 3 handlers + función de datos compartida con el guard de estado.
No hacer: no permitir editar una versión PUBLISHED/LOCKED/COMPLETED (eso rompería la invariante de R3-M11).
Criterios de aceptación:
- [x] Crear/editar/eliminar en DRAFT funciona.
- [x] Cualquier mutación sobre versión no-DRAFT devuelve 409.
- [x] Usuario sin scope sobre el área del schedule recibe 403.
Tests: integración cubriendo los 3 endpoints × (DRAFT ok / no-DRAFT rechazado / sin permiso rechazado).
Evidencia esperada: resultados de test adjuntos.

## 19. Tests obligatorios
`API`, `integration`.

## 20. Evidencias
- `npx vitest run api/schedules/assignments.test.js`: **1 file passed, 4 tests passed**.
- `npx vitest run api/schedules/index.test.js api/schedules/assignments.test.js`: **2 files passed, 10 tests passed**.
- `npx playwright test --config playwright.local.config.ts specs-local/scheduling-draft.spec.ts` desde `qa/e2e-acceptance`: **3 passed (36.8s)** contra `vercel dev` + Neon dev; seed y teardown completados.
- `npm test`: **102 files passed, 1039 tests passed**.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Las pruebas E2E verifican POST 201, PATCH 200, DELETE 204, conflicto de draft 409 y rechazo de scope/rol.
- Cleanup E2E: no se dejaron assignments, versiones ni schedules de fixture.

## 21. Gate
Gates requeridos: **G4**, **G5**, **G10**.

Resultado ejecutado: **PASS**.

- G4 API/authorization: PASS — rol, organización, área del schedule y estado DRAFT se validan server-side.
- G5 Functional: PASS — CRUD completo en DRAFT y bloqueo de versiones publicadas.
- G10 Unit/integration: PASS — tests dirigidos, suite completa y E2E real en verde.

## 22. Rollback / remediación
Si el guard de estado falla en test: no exponer el endpoint hasta corregirlo — una edición sobre versión publicada rompería la invariante de inmutabilidad (R3-M11), riesgo funcional real.

## 23. Criterio de DONE
3 endpoints operativos, guard de estado verificado por test, Gate G4+G5+G10 PASS. Implementación: `38cde75`.
