# R3-M06 — Overlap Validation

## 1. Objetivo
Impedir que un mismo empleado tenga dos `ShiftAssignment` con horario solapado el mismo día dentro de una `ScheduleVersion`.

## 2. Problema que resuelve
Sin esta validación, un planner podría crear asignaciones físicamente imposibles (mismo empleado en dos turnos simultáneos), lo que invalidaría la planificación publicada.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M05 (endpoints de edición ya existentes).

## 4. Alcance IN
- Validación en `POST`/`PATCH` de assignment: rechaza si el nuevo rango [start_time,end_time) del mismo `employee_id` y `date` solapa con otro assignment existente en la misma `ScheduleVersion`.
- Mensaje de error claro indicando qué assignment existente causa el conflicto.

## 5. Alcance OUT
Motor de reglas configurable por organización (prohibido, over-engineering — §32 del prompt maestro). Validación cross-schedule (dos schedules distintos de la misma semana no se cruzan en esta microfase — ver nota en sección 7).

## 6. Dependencias
R3-M05.

## 7. Decisiones arquitectónicas
Regla fija de solapamiento simple (no configurable): `new.start < existing.end AND new.end > existing.start` para el mismo employee_id+date+schedule_version_id. No se valida contra otros `Schedule` (p.ej. otra área) en esta microfase — un empleado planificado en dos áreas la misma semana en versiones DRAFT distintas es un caso de negocio real (áreas opcionales, un empleado puede pertenecer a una sola área hoy — `employees.area_id` es single-valued, así que este caso cruzado es en la práctica imposible con el modelo actual; se documenta como supuesto, no como gap).

## 8. Modelo de datos afectado
Ninguno — validación en capa de aplicación, no constraint de DB (un EXCLUDE constraint con rangos sería la alternativa DB-level, pero se descarta aquí para mantener el mensaje de error legible para el usuario, cosa que un constraint violation no permite fácilmente — trade-off documentado).

## 9. API / Backend
Los mismos endpoints de R3-M05 ahora devuelven 422 con `{ error: 'OVERLAP', conflictingAssignmentId }` cuando aplica.

## 10. Frontend / UX
N/A en esta microfase — el planner UI (R3-M08) consumirá este error para resaltar el conflicto.

## 11. Seguridad y autorización
N/A adicional — hereda el guard de R3-M05.

## 12. i18n
Mensaje de error de solapamiento con clave i18n ES/EN.

## 13. Accesibilidad
N/A — sin UI en esta microfase.

## 14. Responsive / temas
N/A.

## 15. Observabilidad / errores
Error 422 estructurado y distinguible de 409 (estado no editable) y 403 (permiso).

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A — no afecta `shift_assignments` ya creados sin validar (ninguno existe aún, feature nueva).

## 18. Tasks

### T01 — Validación de solapamiento en create/update
Objetivo: implementar el chequeo en la función de datos compartida por `POST`/`PATCH` de assignments.
Archivos / módulos probables: mismo módulo de datos usado en R3-M05.
Cambios: query de solapamiento antes de insert/update + respuesta 422 estructurada.
No hacer: no implementar como motor de reglas genérico; es una función fija.
Criterios de aceptación:
- [ ] Crear assignment solapado con uno existente es rechazado con 422 y referencia al conflicto.
- [ ] Editar un assignment para que solape con otro también es rechazado.
- [ ] Assignments no solapados (incluso contiguos, end==start) se aceptan.
Tests: unit test de la función de solapamiento (casos límite: contiguo, contenido, parcial) + integración sobre los endpoints.
Evidencia esperada: resultados de test adjuntos.

## 19. Tests obligatorios
`unit`, `API`, `integration`.

## 20. Evidencias
Función de validación commiteada, tests en PASS.

## 21. Gate
Gates requeridos: **G3** (Domain invariants), **G10** (Unit/integration tests).

## 22. Rollback / remediación
Si el Gate falla por falso positivo/negativo en casos límite: corregir la función de solapamiento antes de exponerla — un falso negativo permitiría datos físicamente imposibles en producción.

## 23. Criterio de DONE
Validación operativa, casos límite cubiertos por test, Gate G3+G10 PASS.
