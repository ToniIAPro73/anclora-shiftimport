# P3 — Dialog Replacement & Copy Correctness Gate

**STATUS: PASS_WITH_GAPS**

Fecha: 2026-09-06
Rama: `development`

## Resultado

P3 elimina los diálogos nativos de los journeys de negocio y los sustituye por confirmaciones
persistentes conformes al contrato de modales. Los errores y éxitos del dashboard permanecen
visibles hasta cierre explícito. Los textos vacíos de Members distinguen usuarios, empleados y
opciones de vinculación sin reutilizar `orgSelector.noResults`.

## Evidencia

| Criterio | Resultado | Evidencia |
|---|---|---|
| No `window.alert`/`window.confirm` en UI | PASS | `rg` en `src/` devuelve cero coincidencias de código |
| Guardia anti-regresión | PASS | `no-restricted-properties` en `eslint.config.js` |
| Confirmación destructiva accesible | PASS | `ConfirmDialog`, `role=alertdialog`, foco inicial en Cancelar, ESC/click exterior cancelan |
| Doble envío | PASS | ConfirmDialog deshabilita acciones mientras espera el callback |
| Superficies migradas | PASS | Members, Areas, Settings, TeamImport, ImportHistory, WeeklyPlanner, Legal y App |
| Variantes de componentes | PASS | Tests dirigidos de las superficies modificadas |
| Smoke navegador | PASS | `p3-dialogs.spec.ts`: 1/1 en Chromium, 24.0 s |
| Test suite | PASS | 139 ficheros, 1240 tests |
| Lint | PASS | `npm run lint` |
| Typecheck/build | PASS | `npm run build` |
| I18n | PASS | Nuevas claves ES/EN para estados vacíos |

## Estrategia E2E reducida

Se ejecuta un único recorrido browser de alto valor: abrir una acción destructiva real, comprobar
el `alertdialog`, cancelar de forma segura y fallar si aparece cualquier diálogo nativo. Las
variantes restantes se cubren con tests de componentes, evitando repetir login, seed y teardown
por cada superficie.

## Gap aceptado

No se repitió un recorrido navegador independiente para cada superficie destructiva. La cobertura
de esas variantes queda en tests de componentes y el guard de lint; P3 conserva un smoke E2E único
para validar integración real y ausencia de diálogos nativos. No afecta seguridad ni integridad y
queda absorbido por la suite de regresión del Gate final.

## Worktree

Los cambios de P3 están pendientes de commit hasta la revisión final de diff.
