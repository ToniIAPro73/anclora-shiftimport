# R3-M05 — Assignment Editing

## 1. Objetivo
API CRUD de `ShiftAssignment` dentro de una `ScheduleVersion` en estado DRAFT.

## 2. Problema que resuelve
Permite construir el contenido de un draft: añadir/editar/eliminar asignaciones antes de validarlas y publicarlas.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M04 (draft ya creado).

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
- `POST .../assignments` body `{ employeeId, date, startTime, endTime, location? }` → 201.
- `PATCH .../assignments/:id` body parcial → 200.
- `DELETE .../assignments/:id` → 204.
- Guard común: `schedule_versions.status = 'DRAFT'` y organización/área coincide con la sesión, si no → 409 / 403.

## 10. Frontend / UX
N/A en esta microfase — consumido por el planner UI en R3-M08.

## 11. Seguridad y autorización
Rol PLANNER+, scope ORGANIZATION/AREA verificado server-side vía join `shift_assignments → schedule_versions → schedules`.

## 12. i18n
Mensajes de error con claves i18n.

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
- [ ] Crear/editar/eliminar en DRAFT funciona.
- [ ] Cualquier mutación sobre versión no-DRAFT devuelve 409.
- [ ] Usuario sin scope sobre el área del schedule recibe 403.
Tests: integración cubriendo los 3 endpoints × (DRAFT ok / no-DRAFT rechazado / sin permiso rechazado).
Evidencia esperada: resultados de test adjuntos.

## 19. Tests obligatorios
`API`, `integration`.

## 20. Evidencias
Endpoints commiteados, tests en PASS.

## 21. Gate
Gates requeridos: **G4**, **G5**, **G10**.

## 22. Rollback / remediación
Si el guard de estado falla en test: no exponer el endpoint hasta corregirlo — una edición sobre versión publicada rompería la invariante de inmutabilidad (R3-M11), riesgo funcional real.

## 23. Criterio de DONE
3 endpoints operativos, guard de estado verificado por test, Gate G4+G5+G10 PASS.
