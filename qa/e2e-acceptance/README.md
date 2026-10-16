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
runner seleccionado. Todos los runners usan exclusivamente Neon `main` de producción y aíslan sus
fixtures con un `runId` único; el teardown elimina y verifica todos los residuos sintéticos.

La batería se ejecuta contra la única rama Neon autorizada (`main`) mediante organizaciones
sintéticas. La batería histórica sigue disponible con:

```bash
npx playwright test --config playwright.local.config.ts
```

## QA persistente contra el mirror (sin intervención manual)

Código `development` local + Neon producción + identidad QA dedicada (`qa.shiftimport@anclora.test`)
+ organización espejo persistente (`<origen> — QA Mirror`, clon pseudonimizado y de sólo lectura del origen).

```bash
node scripts/qa/ensure-qa-identity.mjs          # crea/valida la identidad; rota y guarda la password en .env.development.local (nunca se imprime)
node scripts/qa/refresh-qa-mirror.mjs --dry-run # inventario
node scripts/qa/refresh-qa-mirror.mjs --apply   # reconstruye el baseline (idempotente, ids deterministas)
vercel dev --local --listen 5173                # app local sobre la BD de producción
npm --prefix qa/e2e-acceptance run test:qa-mirror
```

El origen sólo se lee (huella SHA-256 idéntica antes/después). Toda escritura E2E pasa por
`assertQaOrganization()`: aborta salvo que la organización sea exactamente el mirror, la identidad QA sea
miembro y todos los miembros sean `@anclora.test`. Tras tests destructivos, vuelve a ejecutar `--apply`.
El `storageState` de login es temporal (`.qa-state/`, ignorado por Git) y se destruye en el teardown.
