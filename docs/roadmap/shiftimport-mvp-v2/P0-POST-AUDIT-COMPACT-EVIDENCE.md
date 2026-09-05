# P0 — Evidencia compacta de ejecución

Fecha: 2026-09-05  
Rama: `development`  
Commits de la evidencia: `b9082a7` (runner) + `dd99b92` (verificador)
Entorno: Neon **development** (prefijo de host verificado por el runner)

## Perfil E2E

Comando ejecutado desde `qa/e2e-acceptance/`:

```text
npx playwright test --config playwright.p0-gate.config.ts
```

Resultado: **4/4 PASS en 43,3 s**.

Los cuatro escenarios son:

1. planner UI y ausencia de diálogos nativos;
2. matriz compacta de roles y aislamiento de tenant;
3. import futuro, idempotencia, scope y fail-closed;
4. portal de empleado y endpoint de política de aprobación.

El perfil evita logins de interfaz, logouts, navegación repetida y esperas de hidratación que no
aportan cobertura nueva a estos casos. El perfil exhaustivo histórico sigue disponible en
`qa/e2e-acceptance/playwright.local.config.ts`.

## Smoke API dirigido

Comando:

```text
node --env-file=.env.development.local scripts/smoke-api.mjs
```

Resultado: **72/72 PASS en 16,3 s**. El harness se actualizó al contrato actual de onboarding
(`OWNER` + `ownerIsEmployee`) e imports (`employeeId` + fingerprint SHA-256), y ahora rechaza
ejecutarse contra un host que no sea Neon development. La limpieza final confirmó **0
organizaciones smoke** residuales.

Esta es la ruta rápida recomendada para cambios de API: cubre cada caso de forma dirigida sin
repetir los journeys completos del navegador. Los E2E de navegador se reservan para cambios de
UI, navegación, accesibilidad o flujos cuya evidencia dependa del browser.

## Regresión dirigida de scheduling

Comando:

```text
npx playwright test --config playwright.r3-gate.config.ts --grep "happy path"
```

Resultado: **2/2 PASS en 1m45,2 s** (ES desktop: 44,9 s; EN mobile: 53,5 s).
El journey conserva creación, validación, publicación, historial y comprobación persistente;
solo deja de navegar 13/14 semanas artificiales antes de empezar. Las fixtures se reinician en
cada ejecución, por lo que las semanas cercanas vacías son equivalentes para este caso y evitan
round-trips de UI que no aportan cobertura.

## Recorrido continuo P0-M07

Comando ejecutado desde `qa/e2e-acceptance/`:

```text
npx playwright test --config playwright.p0-flow.config.ts
```

Resultado: **1/1 PASS en 1m37,2 s**.

El escenario usa una organización y dos empleados sintéticos, con setup/teardown global únicos,
y cubre en una sola sesión de navegador: signup, onboarding OWNER, área y empleados, importación
histórica con revisión/compare/confirmación, creación y edición de borrador, importación futura a
borrador, publicación, portal EMPLOYEE, acknowledge, solicitud de cambio, aprobación y lectura de
auditoría. La segunda sesión de navegador sólo se abre para validar el recorrido del EMPLOYEE.

La preparación de datos que no constituye evidencia de UI (alta de área/empleados, provisión de
plan Team y consultas de verificación) se hace por API/SQL contra Neon development protegido por
host. El caso no sustituye la evidencia pendiente de P0-M07: EN, dark, axe y capturas completas
del recorrido continuo.

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

Esta evidencia no declara cerrado el Gate P0: aún falta completar la matriz rol×scope×endpoint,
las capturas/axe/responsive ES/EN exigidas por P0-M07..M10 y la consolidación formal del Gate. Los
perfiles compactos son smoke deterministas para reducir tiempo de espera, no una reducción de los
criterios de aceptación.
