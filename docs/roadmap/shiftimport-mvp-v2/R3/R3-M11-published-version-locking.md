# R3-M11 — Published Version Locking

## 1. Objetivo
Formalizar y verificar explícitamente que una `ScheduleVersion` en `PUBLISHED` (o superior) es inmutable: ninguna mutación de `shift_assignments` puede aplicarse sobre ella.

## 2. Problema que resuelve
R3-M05 ya rechaza mutaciones sobre versiones no-DRAFT como guard funcional; esta microfase cierra el ciclo con verificación explícita, tests dedicados, y el flujo de "nueva versión draft a partir de una publicada" para permitir cambios posteriores sin violar la inmutabilidad.

## 3. Estado actual del repositorio
MISSING. Depende de R3-M10 (publicación ya implementada).

## 4. Alcance IN
- Confirmar (con test dedicado, no solo inferido de R3-M05) que PUBLISHED/LOCKED/COMPLETED son 100% inmutables a nivel de `shift_assignments`.
- `POST /api/schedules/:scheduleId/versions/:versionId/new-draft` — crea una nueva `ScheduleVersion` DRAFT copiando los assignments de la versión publicada como punto de partida editable, sin modificar la versión origen.

## 5. Alcance OUT
Publicación de la nueva versión (reutiliza R3-M10). Historial de qué cambió entre versiones (R3-M12).

## 6. Dependencias
R3-M10.

## 7. Decisiones arquitectónicas
"Nueva versión desde publicada" es una copia explícita, no una referencia — cada `ScheduleVersion` tiene su propio conjunto de `shift_assignments` independientes, para que editar la versión N+1 nunca module implícitamente los datos de la versión N (que ya generó turnos reales en `shifts`).

## 8. Modelo de datos afectado
Ninguno nuevo — reutiliza `schedule_versions` y `shift_assignments`.

## 9. API / Backend
`POST /api/schedules/:scheduleId/versions/:versionId/new-draft` → 201 `{ newVersionId, versionNumber, copiedAssignmentCount }`. 409 si ya existe un DRAFT activo para el schedule (misma invariante de R3-M02).

## 10. Frontend / UX
Botón "Crear nueva versión" visible cuando la versión activa está PUBLISHED, en `WeeklyPlanner`.

## 11. Seguridad y autorización
Mismo guard PLANNER+ que el resto de R3.

## 12. i18n
Textos nuevos en ES/EN.

## 13. Accesibilidad
N/A adicional — reutiliza componentes ya verificados en R3-M08/M09.

## 14. Responsive / temas
N/A adicional.

## 15. Observabilidad / errores
409 claro si ya hay un DRAFT activo, indicando cuál.

## 16. Migraciones
N/A.

## 17. Compatibilidad y datos existentes
N/A.

## 18. Tasks

### T01 — Test dedicado de inmutabilidad
Objetivo: verificar explícitamente (no solo confiar en R3-M05) que PUBLISHED/LOCKED/COMPLETED rechazan toda mutación de assignments.
Archivos / módulos probables: test de integración sobre los endpoints de R3-M05.
Cambios: nuevos casos de test, sin cambios de código si R3-M05 ya lo cubre correctamente (si el test revela un gap, corregir el guard en R3-M05 como fix, referenciado desde aquí).
No hacer: no relajar el guard existente para "simplificar" el test.
Criterios de aceptación:
- [ ] create/update/delete de assignment sobre versión PUBLISHED/LOCKED/COMPLETED rechazados con 409 en los 3 casos.
Tests: integración, 3 estados × 3 operaciones = 9 casos mínimo.
Evidencia esperada: resultados de test adjuntos.

### T02 — Endpoint `new-draft`
Objetivo: crear versión DRAFT copiando assignments de una versión publicada.
Archivos / módulos probables: `api/schedules/[scheduleId]/versions/[versionId]/new-draft.js` (nuevo).
Cambios: nuevo handler + función de datos con copia transaccional.
No hacer: no mutar la versión origen durante la copia.
Criterios de aceptación:
- [ ] Nueva versión DRAFT contiene copia exacta de los assignments de la versión origen.
- [ ] Versión origen permanece inalterada (verificado por test).
- [ ] Conflicto si ya hay un DRAFT activo.
Tests: integración.
Evidencia esperada: resultados de test adjuntos.

### T03 — UI "Crear nueva versión"
Objetivo: botón en `WeeklyPlanner` visible cuando la versión activa está PUBLISHED.
Archivos / módulos probables: `src/components/scheduling/WeeklyPlanner.tsx`.
Cambios: nueva acción condicional al estado.
No hacer: N/A.
Criterios de aceptación:
- [ ] Botón visible solo cuando corresponde, deshabilitado si ya existe un DRAFT activo.
Tests: component test.
Evidencia esperada: test en PASS.

## 19. Tests obligatorios
`API`, `integration`, `unit/component`.

## 20. Evidencias
Tests de inmutabilidad y de new-draft en PASS, UI commiteada.

## 21. Gate
Gates requeridos: **G3**, **G5**, **G10**.

## 22. Rollback / remediación
Si el test de inmutabilidad revela un gap real en R3-M05: corregir ahí y volver a correr el Gate de R3-M05 también (regresión cross-microfase, documentar en ambas specs).

## 23. Criterio de DONE
Inmutabilidad verificada explícitamente, endpoint `new-draft` operativo, UI condicional funcionando, Gate G3+G5+G10 PASS.
