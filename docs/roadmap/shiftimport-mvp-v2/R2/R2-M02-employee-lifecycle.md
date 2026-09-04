# R2-M02 — Employee Lifecycle

STATUS: DONE (verification spec)

## 1. Objetivo

Confirmar formalmente que el ciclo de vida de empleado (`pending_access` → `active` → `inactive`) está completo y correcto tras el fix reciente, y dejarlo documentado como contrato estable para R2-M06/M07.

## 2. Problema que resuelve

Evitar que microfases posteriores reintroduzcan el bug corregido en `3d866e0` (vinculación masiva no activaba al empleado) o asuman estados inexistentes.

## 3. Estado actual del repositorio

- `employees.status CHECK IN ('pending_access','active','inactive')` (migraciones 0001/0005/0006).
- `deactivated_at` columna (migración 0005).
- Bug corregido en `3d866e0`: bulk-link ahora transiciona a `active` igual que el link individual, en `api/_lib/data.js`.
- El selector de empleados del dashboard filtra por `status === 'active'` — motivo por el que el bug era visible (empleados invisibles hasta el fix).

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
- [ ] Test cubre link individual → `active`.
- [ ] Test cubre bulk-link → `active`.
- [ ] Test cubre transición a `inactive`.
Tests: suite existente + nuevo caso si falta.
Evidencia esperada: resultado de `npm test` para el archivo relevante.

### T02 — Reconciliación de datos preexistentes (si aplica)

Objetivo: Detectar empleados vinculados antes del fix que quedaron en `pending_access` incorrectamente.
Archivos / módulos probables: script puntual en `db/` o consulta de verificación.
Cambios: Query de solo lectura primero; si hay filas afectadas, proponer script de corrección para aprobación explícita antes de ejecutar sobre Neon de desarrollo.
No hacer: No ejecutar ningún UPDATE sin confirmación explícita del usuario (regla de base de datos del master prompt, sección 24).
Criterios de aceptación:
- [ ] Query de detección ejecutada y resultado documentado.
- [ ] Si hay filas afectadas, propuesta de corrección presentada para aprobación (no ejecutada automáticamente).
Tests: N/A — operación de datos, no de código.
Evidencia esperada: resultado de la query de detección.

## 19. Tests obligatorios

unit/integration sobre `data.js`.

## 20. Evidencias

Resultado de tests T01, resultado de query T02.

## 21. Gate

Gates requeridos: G3 (Domain invariants), G10 (Unit/integration tests).

## 22. Rollback / remediación

N/A — motivo: microfase de verificación; si se encuentra un defecto nuevo, se abre como tarea de remediación dentro de esta misma microfase antes de Gate.

## 23. Criterio de DONE

Ambos caminos de vinculación verificados con test explícito; datos preexistentes confirmados consistentes o corrección propuesta y aprobada.
