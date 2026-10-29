# Checklist de validación — alineación contractual de ShiftImport

> Se sobrescribe en cada entrega; el historial queda en Git.

**Repositorio:** anclora-shiftimport
**Rama:** development
**Alcance:** runtime local production-backed, Neon `main`, QA mediante identidad dedicada y `ShiftImport — QA Mirror`, organización fuente `ShiftImport` de solo lectura, Preview opcional, Docker opcional y resolución canónica de migraciones. El Worktime Target Engine queda en un commit independiente.

## Validación contractual

| Comprobación | Resultado |
| --- | --- |
| `npm run db:migrate:status` | PASS — Neon Production `main`, `UP_TO_DATE`, 48/48 migraciones y cero pendientes. |
| `npm run qa:local:smoke` | PASS — login dedicado, sesión, QA Mirror, roster pseudonimizado, piloto y reconciliación. |
| `scripts/qa/db-migrate-runtime.test.mjs` | PASS — selecciona Neon `main`, rechaza Docker y endpoints ajenos, y elimina overrides locales. Validado dentro de `npm test`. |
| `npm test` | PASS — 2196 tests passed y 2 skips existentes; resultado reutilizado porque no hubo cambios posteriores de código que lo invaliden. |
| `npm run build` | PASS — incluye TypeScript (`tsc`) y Vite build; resultado reutilizado. |
| `npm run lint` | PASS — resultado reutilizado. |
| `git diff --cached --check` | PASS — sin errores de formato. |

## Runtime y QA

- `LOCAL_RUNTIME_MODEL=PRODUCTION_BACKED`; destino: Neon Production `main`.
- `QA_IDENTITY=qa.shiftimport@anclora.test`; `QA_TARGET=ShiftImport — QA Mirror`.
- La organización fuente `ShiftImport` permanece en solo lectura. La QA visual focal del Worktime Target Engine se valida en su commit independiente.
- `PREVIEW_REQUIRED_FOR_DEVELOPMENT=false`; `PREVIEW_REQUIRED_FOR_PROMOTION=false`; `DOCKER_REQUIRED_FOR_QA=false`.
- La suite E2E amplia de importación no se repitió por instrucción de Toni. Su timeout anterior queda fuera del scope contractual y de la aceptación del Worktime Target Engine.

## Worktime Target Engine

| Comprobación | Resultado |
| --- | --- |
| Migración | PASS — Neon `main`, 48/48, `UP_TO_DATE`. |
| DB integration | PASS — 12/12 casos sobre Neon `main`, fixtures sintéticos con `runId`, limpieza verificada y fingerprint fuente inmutable. |
| QA Mirror | PASS — refresco idempotente, target del piloto presente y fuente sin cambios. |
| Escenarios de targets | PASS — piloto, exact/range, central, semanal, mensual, personalizado, revisiones históricas/futuras, política Regular-only, Extras visibles, solapamiento y balance sin revisión nueva. |
| CURRENT/PROPOSED | PASS — datos actuales del mirror, proyección y balance; mirror restaurada después de los casos con escritura. |
| QA visual focal | PASS — resumen y editor de Sebastián; rango 1529–1540 h, Regular-only, Extras separados, historial; empleado sin objetivo; configuración operativa mensual; ES/EN; desktop y móvil claro/oscuro. No se guardaron cambios desde la UI. El contenido inferior y los botones del editor son alcanzables por scroll; overflow horizontal no observado en 390 px. |
| E2E focal de targets | PASS — cubierto por `npm run qa:current-proposed`; no quedó caso UI focal pendiente. |
| Suite completa | PASS — 2196 tests passed y 2 skips existentes. |
| TypeScript / lint / build | PASS — `npm run build` (incluye `tsc`), `npm run lint`; reusados sin cambios posteriores que los invaliden. |
| Diff check | PASS — `git diff --check`. |

`SOURCE_UNCHANGED=true`; `REAL_SHIFTIMPORT_WRITES=0`; `QA_RESTORED=true`. El timeout E2E anterior de importación permanece como observación fuera de scope y no altera la aceptación de esta feature.

## Git

- Cambios contractuales preparados archivo por archivo y revisados en `git diff --cached`.
- El commit contractual se publica en `origin/development`; el Worktime Target Engine se publica en un commit independiente.
- No se promovió a Preview, staging, production ni `main`; la rama de respaldo Neon no se eliminó.
