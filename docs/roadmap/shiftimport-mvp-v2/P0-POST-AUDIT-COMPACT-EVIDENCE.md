# P0 — Evidencia compacta de ejecución

Fecha: 2026-09-05  
Rama: `development`  
Commit de la ejecución: `dd99b92`  
Entorno: Neon **development** (prefijo de host verificado por el runner)

## Perfil E2E

Comando ejecutado desde `qa/e2e-acceptance/`:

```text
npx playwright test --config playwright.p0-gate.config.ts
```

Resultado: **4/4 PASS en 43,8 s**.

Los cuatro escenarios son:

1. planner UI y ausencia de diálogos nativos;
2. matriz compacta de roles y aislamiento de tenant;
3. import futuro, idempotencia, scope y fail-closed;
4. portal de empleado y endpoint de política de aprobación.

El perfil evita logins de interfaz, logouts, navegación repetida y esperas de hidratación que no
aportan cobertura nueva a estos casos. El perfil exhaustivo histórico sigue disponible en
`qa/e2e-acceptance/playwright.local.config.ts`.

## Invariantes de datos

Comando:

```text
node --env-file=.env.development.local scripts/verify-mvp-invariants.mjs
```

Resultado: **11/11 PASS, 0 violaciones**.

Se verificaron columnas tenant `NOT NULL`, coherencia organization↔employee en shifts/imports,
coherencia de assignments y change requests, OWNER único, unicidad de `structureHash`, unicidad
de approval request y presencia de las defensas únicas correspondientes.

## Calidad transversal

- `npm test -- --run`: **137 ficheros / 1.220 tests PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**; permanecen únicamente los warnings conocidos de tamaño de chunks y
  deprecación de opciones de Vite/esbuild.
- `git diff --check`: **PASS**.

## Alcance pendiente del Gate P0

Esta evidencia no declara cerrado el Gate P0: aún falta el recorrido funcional continuo de 16
pasos, la matriz completa rol×scope×endpoint y las capturas/axe/responsive ES/EN exigidas por
P0-M07..M10. El perfil compacto es un smoke determinista para reducir tiempo de espera, no una
reducción de los criterios de aceptación.
