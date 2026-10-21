# Checklist de validación — reemplazo de turnos en publicación de planificación

**Alcance:** al publicar una nueva versión de un schedule, los turnos efectivos materializados desde versiones anteriores de ese mismo schedule pasan a `SUPERSEDED`. La nueva versión se materializa como efectiva, incluidos turnos que coincidan exactamente con los anteriores. No se tocan otros schedules ni filas que no provengan de versiones del schedule publicado. No requiere migración de esquema.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npx vitest run api/schedules/publish.test.js` | PASS — 6 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — aviso preexistente de chunks grandes |
| `git diff --check` | PASS |

## Verificación visual

No aplica: corrección del backend de publicación de planificación.

## Promoción

No solicitada en este cambio. Push a `development` según el contrato del repositorio.

---

# Checklist de validación — versiones publicadas vacías como autoridad

**Alcance:** calendario y estadísticas aplican la versión publicada más reciente del schedule completo, incluso si no contiene asignaciones. Esto evita contar turnos materializados de una versión anterior para días que la versión vigente dejó vacíos. Los borradores y las filas sin schedule asociado no cambian. La investigación de octubre se limitó a consultas `SELECT` de lectura; no se modificaron datos de producción.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Pruebas focalizadas de calendario y estadísticas | PASS — 118 tests |
| `npm test -- --reporter=dot` | PASS — 2.183 tests, 2 omitidos |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — aviso de chunks grandes |
| `git diff --check` | PASS |

## Verificación visual

No aplica: corrección de lecturas backend de calendario y estadísticas.

## Promoción

No solicitada en este cambio. Push a `development` según el contrato del repositorio.

---

# Checklist de validación — reemplazo por fecha en versiones de planificación

**Alcance:** una versión publicada sustituye turnos anteriores solo para las fechas y empleados que contiene. Fechas no incluidas conservan su turno efectivo previo. El mismo criterio se aplica a calendario y estadísticas; no se consultó ni modificó producción.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npx vitest run api/schedules/publish.test.js api/_lib/data.test.js api/_lib/calendar-version-authority.test.js api/_lib/effective-calendar.test.js` | PASS — 182 tests |
| ESLint focalizado sobre los seis archivos JavaScript modificados | PASS |
| `git diff --check` | PASS |

## Verificación visual

No aplica: corrección del versionado y las consultas backend.

## Promoción

No solicitada en este cambio. Push a `development` según el contrato del repositorio.

---

# Checklist de validación — autoridad de la última versión publicada

**Alcance:** las lecturas del calendario y de las estadísticas anual/mensual ignoran turnos materializados de versiones anteriores cuando existe una versión posterior publicada, bloqueada o completada del mismo schedule. Los borradores no sustituyen la versión publicada actual y los turnos no vinculados a schedules permanecen iguales. No se consultaron ni modificaron datos de producción.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `npx vitest run api/_lib/data.test.js api/_lib/calendar-version-authority.test.js api/_lib/effective-calendar.test.js` | PASS — 176 tests |
| `npx eslint api/_lib/data.js api/_lib/calendar.js api/_lib/data.test.js api/_lib/calendar-version-authority.test.js` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — aviso de chunks grandes |
| `git diff --check` | PASS |

## Verificación visual

No aplica: cambio en consultas backend de calendario y estadísticas.

## Promoción

No solicitada en este cambio. Push a `development` según el contrato del repositorio.
