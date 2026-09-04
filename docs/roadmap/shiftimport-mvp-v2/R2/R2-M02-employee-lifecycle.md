# R2-M02 — Employee Lifecycle

STATUS: DONE (verification spec)

## 1. Objetivo

Confirmar formalmente que el ciclo de vida de empleado (`pending_access` → `active` → `inactive`) está completo y correcto tras el fix reciente, y dejarlo documentado como contrato estable para R2-M06/M07.

## 2. Problema que resuelve

Evitar que microfases posteriores reintroduzcan el bug corregido en `3d866e0` (vinculación masiva no activaba al empleado) o asuman estados inexistentes.

## 3. Estado actual del repositorio

STATUS: DONE, brecha de datos real encontrada y corregida (con aprobación explícita) en esta microfase.

- `employees.status CHECK IN ('pending_access','active','inactive')` (migraciones 0001/0005/0006).
- `deactivated_at` columna (migración 0005).
- Bug corregido en `3d866e0`: bulk-link ahora transiciona a `active` igual que el link individual, en `api/_lib/data.js`.
- El selector de empleados del dashboard filtra por `status === 'active'` — motivo por el que el bug era visible (empleados invisibles hasta el fix).

### T01 — Cobertura de test cerrada

Código confirmado con paridad exacta entre ambos caminos: `updateEmployee` (link individual, `api/_lib/data.js:537-540`) y el path bulk (mismo bloque de lógica, ya corregido en `3d866e0`) — ambos transicionan `pending_access → active` cuando se vincula un usuario. Cobertura de test:
- Bulk-link → `active`: ya existente (caso A2, `data.test.js:1264`).
- **Individual link → `active`: brecha real de cobertura encontrada** — el fixture de "links a free employee to a free member user" (`data.test.js:1157`) siempre partía de `status: 'active'` por defecto, así que la transición nunca se ejercitaba. Nuevo test añadido: "linking a pending_access employee auto-transitions it to active (individual path, parity with bulk case A2)".
- Transición a `inactive`: ya cubierta exhaustivamente (`data.test.js:537,556,566,597,606`).

### T02 — Reconciliación de datos preexistentes ejecutada (con aprobación explícita del usuario)

Query de detección (solo lectura) contra Neon dev: `SELECT ... FROM employees WHERE user_id IS NOT NULL AND status = 'pending_access'` → **16 filas afectadas** en 2 organizaciones, leftover real del bug pre-`3d866e0` (empleados vinculados a un usuario pero nunca activados).

Presentado al usuario antes de cualquier escritura (regla del master prompt §24). **Aprobado explícitamente.** Ejecutado: `UPDATE employees SET status = 'active', deactivated_at = NULL, updated_at = NOW() WHERE user_id IS NOT NULL AND status = 'pending_access'` — idempotente (una segunda ejecución no encontraría filas), acotado exactamente a la firma del bug (no toca ningún otro empleado). **16 filas reconciliadas**, confirmado por `RETURNING id, organization_id, name`.

## 4. Alcance IN

Verificación de que las tres transiciones de estado están cubiertas por tests y que ambos caminos (link individual y bulk) coinciden en comportamiento.

## 5. Alcance OUT

No se añaden nuevos estados. No se toca el mecanismo de desactivación (`deactivated_at`) salvo que la auditoría encuentre un defecto.

## 6. Dependencias

R2-M00.

## 7. Decisiones arquitectónicas

Ninguna nueva — se ratifica el modelo de 3 estados existente como suficiente para MVP.

## 8. Modelo de datos afectado

N/A — motivo: sin cambios de esquema, solo verificación.

## 9. API / Backend

Confirmar que todos los endpoints que cambian `employees.status` (individual link, bulk link, desactivación) usan la misma lógica de transición.

## 10. Frontend / UX

N/A — motivo: sin cambios de UI en esta microfase; el selector de empleados activos ya funciona correctamente tras el fix.

## 11. Seguridad y autorización

N/A — motivo: la autorización de quién puede cambiar el estado de un empleado se cubre en R2-M08.

## 12. i18n

N/A — motivo: sin nuevos textos.

## 13. Accesibilidad

N/A — motivo: sin cambios de UI.

## 14. Responsive / temas

N/A — motivo: sin cambios de UI.

## 15. Observabilidad / errores

N/A — motivo: verificación, no requiere nueva instrumentación.

## 16. Migraciones

N/A — motivo: ninguna migración nueva.

## 17. Compatibilidad y datos existentes

Confirmar que empleados ya vinculados antes del fix `3d866e0` no quedan en estado inconsistente (verificar si se requiere un script de reconciliación puntual para datos ya migrados en producción/desarrollo).

## 18. Tasks

### T01 — Test de regresión para ambos caminos de vinculación

Objetivo: Garantizar que link individual y bulk-link producen el mismo estado final.
Archivos / módulos probables: `api/_lib/data.js`, tests asociados en `api/**/*.test.js`.
Cambios: Añadir/confirmar test que cubra ambos caminos explícitamente.
No hacer: No modificar la lógica de transición si el test ya pasa — solo cerrar el gap de cobertura si existe.
Criterios de aceptación:
- [x] Test cubre link individual → `active` (nuevo, cerrado en esta microfase).
- [x] Test cubre bulk-link → `active` (ya existente, caso A2).
- [x] Test cubre transición a `inactive` (ya existente, exhaustivo).
Tests: `api/_lib/data.test.js` — 105/105 en verde (104 + 1 nuevo).
Evidencia esperada: resultado de `npm test` (sección 20).

### T02 — Reconciliación de datos preexistentes (si aplica)

Objetivo: Detectar empleados vinculados antes del fix que quedaron en `pending_access` incorrectamente.
Archivos / módulos probables: script puntual en `db/` o consulta de verificación.
Cambios: Query de solo lectura primero; si hay filas afectadas, proponer script de corrección para aprobación explícita antes de ejecutar sobre Neon de desarrollo.
No hacer: No ejecutar ningún UPDATE sin confirmación explícita del usuario (regla de base de datos del master prompt, sección 24).
Criterios de aceptación:
- [x] Query de detección ejecutada y resultado documentado — 16 filas afectadas (sección 3).
- [x] Corrección presentada para aprobación explícita ANTES de ejecutar (AskUserQuestion) — aprobada por el usuario, ejecutada después, no antes.
Tests: N/A — operación de datos, no de código.
Evidencia esperada: resultado de la query de detección y de la corrección (sección 3), ambos con `RETURNING` como evidencia verificable.

## 19. Tests obligatorios

unit/integration sobre `data.js`.

## 20. Evidencias

`npm test`: 96 archivos, 991 tests, todos en verde (990 + 1 nuevo). Query de detección: 16 filas. Corrección ejecutada tras aprobación: 16 filas reconciliadas (`RETURNING` confirmado).

## 21. Gate

Gates requeridos: G3 (Domain invariants), G10 (Unit/integration tests).

Resultado: **PASS**. Brecha de cobertura de test cerrada; brecha de datos real (16 filas en dev Neon) detectada, presentada para aprobación antes de escribir, aprobada, y corregida con un UPDATE acotado e idempotente.

## 22. Rollback / remediación

N/A — motivo: microfase de verificación; si se encuentra un defecto nuevo, se abre como tarea de remediación dentro de esta misma microfase antes de Gate.

## 23. Criterio de DONE

Ambos caminos de vinculación verificados con test explícito; datos preexistentes confirmados consistentes o corrección propuesta y aprobada.
