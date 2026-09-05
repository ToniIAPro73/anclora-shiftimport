# E2E acceptance — ejecución dirigida

La batería histórica completa (`playwright.local.config.ts`) se conserva para regresiones
amplias, pero no es el comando de trabajo diario. Para reducir esperas, cada contrato tiene un
runner pequeño y explícito:

```bash
npm run test:fast                 # smoke P0: 4 casos compactos
npm run test:a11y                 # auditoría axe focalizada
npm run test:p4                   # responsive/a11y P4 en un único recorrido sintético
npm run test:p0-flow              # único recorrido continuo signup → audit
npm run test:scheduling:desktop   # scheduling completo ES/desktop
npm run test:scheduling:mobile    # smoke EN/móvil: layout y cambio de vista
npm run test:tenant               # aislamiento API por los 4 roles
npm run test:future               # idempotencia/futuro/fail-closed
```

La comprobación móvil no repite la mutación completa de scheduling: el flujo completo de negocio
se ejecuta una vez y el caso móvil sólo cubre los contratos diferenciales de viewport, idioma,
navegación y cambio de vista. Los tests que necesitan datos comparten el setup/teardown global del
runner seleccionado, pero cada runner sigue usando fixtures sintéticas aisladas en Neon
development.

No usar estos comandos contra producción. La batería histórica sigue disponible con:

```bash
npx playwright test --config playwright.local.config.ts
```
