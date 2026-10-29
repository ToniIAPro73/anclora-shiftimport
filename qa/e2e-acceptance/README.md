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

Las pruebas automatizadas aisladas que necesitan escenarios multi-tenant pueden usar organizaciones
sintéticas con `runId` en Neon `main` y teardown verificado. La validación funcional y visual autenticada
de `development` usa la identidad dedicada y `ShiftImport — QA Mirror`; `ShiftImport` se mantiene
READ ONLY. La batería histórica sigue disponible con:

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
npm run qa:dev-runtime                          # app local sobre la BD canónica (Neon) — NO `vercel dev` a secas: usaría el Postgres Docker de .env.local
npm run qa:local:smoke                          # gate de QA funcional sobre development local + Neon main + QA Mirror
npm run qa:preview:smoke                        # OPTIONAL: smoke adicional contra el Preview de development
npm --prefix qa/e2e-acceptance run test:qa-mirror
```

El origen sólo se lee (huella SHA-256 idéntica antes/después). Toda escritura E2E pasa por
`assertQaOrganization()`: aborta salvo que la organización sea exactamente el mirror, la identidad QA sea
miembro y todos los miembros sean `@anclora.test`. Tras tests destructivos, vuelve a ejecutar `--apply`.
Las rutas `.env*.local` del repo apuntan al Postgres Docker: los scripts QA resuelven la BD canónica desde el entorno Development de Vercel (o `QA_DATABASE_URL`) y abortan si el destino no es el endpoint canónico.
El `storageState` de login es temporal (`.qa-state/`, ignorado por Git) y se destruye en el teardown.

Preview no es un gate de aceptación de `development` ni un requisito general de promoción. La promoción
es independiente y explícita; usa el SHA de `development` que Toni ya validó según los contratos canónicos.

### Integración PostgreSQL local opcional (Docker)

`db/effective-calendar.integration.test.mjs` y `playwright.effective-calendar.config.ts` son una
alternativa local opcional que exige un PostgreSQL Docker. No forman parte del gate ordinario y no se
deben ejecutar para desbloquear QA contractual: la cobertura de integración ordinaria usa la aplicación
local conectada a Neon Production `main` y escribe únicamente en `ShiftImport — QA Mirror`.
