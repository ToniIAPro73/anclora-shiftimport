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

## Git

- Cambios contractuales preparados archivo por archivo y revisados en `git diff --cached`.
- El commit contractual se publica en `origin/development`; el Worktime Target Engine permanece fuera de este commit.
- No se promovió a Preview, staging, production ni `main`; la rama de respaldo Neon no se eliminó.
