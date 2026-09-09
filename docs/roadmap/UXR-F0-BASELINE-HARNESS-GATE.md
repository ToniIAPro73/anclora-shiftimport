# UXR-F0 — Baseline & Harness Gate Document

## Summary
- **Status**: GATE PASS_WITH_GAPS
- **Date**: 2026-09-09
- **Fase**: UXR-F0 (Línea base y harness)
- **Target Branch**: `development`
- **HEAD de referencia**: `43e5c31dcb3e87cc5ebe47bfc9ab937ea530c919`
- **Findings cubiertos**: ninguno (gaps de herramienta y provisión de cuentas, sin finding de
  producto directo — precondición de todas las demás fases)
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`

---

## 1 · Objectives & Scope

**Entra**: cerrar los 6 `TOOL_COMPATIBILITY_GAPS` de la auditoría Codex 2026-09-09
(`UXR-F0-M01`…`UXR-F0-M06`), aprovisionar cuentas sintéticas OWNER y PLANNER (`UXR-F0-M07`), y
congelar la matriz base de 8 viewports × 2 temas × 2 locales (`UXR-F0-M08`).

**No entra explícitamente**: ninguna corrección de los 10 findings de producto (CX-F01…CX-E01) —
esas viven en Fase 1-3. Ningún cambio de código de producto (`src/`, `api/`, `db/`).

**Declarado fuera de esta pasada** (documentado, no oculto — ver §4 huecos): la ejecución literal
de `qa/e2e-acceptance/local-setup.ts`/`local-teardown.ts` vía `playwright test --config
playwright.local.config.ts` (que requiere `vercel dev` + Neon dev orquestados juntos) no se
ejecutó en esta pasada. En su lugar, `UXR-F0-M07` se verificó mediante una reproducción fiel de las
mismas sentencias SQL contra la Neon dev branch real (mismo host `ep-winter-bird-*`, ver
`docs/db-environments.md`), con limpieza posterior — ver detalle en §3.1.

## 2 · Criterios de entrada (gate de admisión)

- [x] Spec `sdd/features/ux-remediation-codex-2026-09/` completa y no en `DRAFT` de contenido.
- [x] Acceso confirmado a un entorno `LOCAL_BUILD` reproducible (`npm run dev -- --port 5199`).
- [x] Sin dependencias previas (esta es la primera fase).

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [x] **UXR-F0-M01 · AC-1** — **CUMPLIDO con tolerancia declarada**, tras aislar la causa que la
      primera pasada dejó abierta. La igualdad de sha256 no es alcanzable en este stack y por tanto
      no es el criterio: dentro de un mismo lanzamiento las capturas son idénticas al byte (4/4),
      pero entre procesos el mismo DOM (verificado idéntico) rasteriza con jitter de antialiasing
      de 13-107 px sobre 329 160 (`maxDelta` 4-10 de 765). AC-1 se verifica ahora con
      `qa/e2e-acceptance/compare-baseline-runs.mjs` (tolerancia: ≤max(200, 0.05%) px y
      `maxDelta` ≤32). Dos pares independientes de corridas: **0 UNSTABLE** en ambos
      (run1/run2: 36 idénticas + 11 en tolerancia + 1 declarada; run3/run4: 38 + 7 + 3).
      Ver `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` §AC-1.
- [ ] **UXR-F0-M01 · AC-1 (hueco declarado)** — la pantalla **`import-preview` queda declarada
      inestable**: sus residuos no son antialiasing sino líneas horizontales de 1px (y=422,
      x=680..1352, `maxDelta` 43), separadores de tabla sobre frontera fraccionaria. Es la misma
      distribución de alturas fijas que describe CX-F01, así que la posee `UXR-F2-M01`/`M02`; no es
      corregible aquí sin tocar `src/`. **Consecuencia**: `calendar` y `pricing` (40/48) son
      baseline fiable; `import-preview` (8/48) no lo es hasta que Fase 2 rehaga ese layout.
- [x] **UXR-F0-M01 · AC-2** — cumplido: procedimiento documentado y ejecutable con un único
      comando (`docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md`).
- [ ] **UXR-F0-M02 · AC-1** — `NOT_EVALUATED`: la herramienta externa `i18n-integrity-check` no
      está disponible en este entorno (no forma parte del repo; instalarla violaría la regla de
      "evitar dependencias nuevas sin razón clara"). Evidencia sustitutoria: `src/lib/
      i18n-coverage.test.ts` (cobertura material declarada) — **PASS** dentro de `npm test`.
- [x] **UXR-F0-M03 · AC-1** — cumplido: `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md`
      cubre `MembersModal`/`ImportModal`/`AppShell`/planner con `data-testid` verificados contra
      el código.
- [x] **UXR-F0-M04 · AC-1** — `NOT_APPLICABLE` explícito, con evidencia de `package.json` (sin
      dependencia de design system). Nunca `UNKNOWN`.
- [x] **UXR-F0-M05 · AC-1** — cumplido por diseño de herramienta (`@playwright/test`/Chromium real
      no oculta scrollbars; no hay flag que fijar). Documentado para uso futuro con `agent-browser`.
- [x] **UXR-F0-M06 · AC-1** — cumplido: las 8 celdas `import-preview` de M08 suben
      `01_READY_structured.csv` con ruta resuelta por `join(__dirname, ...)` sin error; fixture de
      `CX-E01` (`test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv`) verificado
      existente para Fase 1.
- [x] **UXR-F0-M07 · AC-1** — cumplido, verificado contra Neon dev real (host `ep-winter-bird-*`):
      organización sintética con **exactamente 1 OWNER** (`owner@e2e.test`) y **1 PLANNER con scope
      de área** (`planner@e2e.test`, `scoped_area_id` no nulo). Membership completo ya presente en
      `qa/e2e-acceptance/local-setup.ts` (orgA/orgB, incluye además `planner-no-area@e2e.test` y
      `planner-global@e2e.test` para cubrir los tres modos de scope de `ADR-2026-09-07` D5).
- [x] **UXR-F0-M07 · AC-2** — cumplido: historial de turnos (≥1 shift verificado) y **1
      `FormatProfile` aprendido** (`status='validated'`, `source_type='tabular'`) añadidos a
      `qa/e2e-acceptance/local-setup.ts` para que la org OWNER no arranque vacía. Verificado con
      una ejecución real contra la dev DB (sembrado → consultado → destruido, ver detalle abajo).
- [x] **UXR-F0-M08 · AC-1** — cumplido: 48 capturas (32 = 8×2×2 de `calendar` + 16 reducidas de
      `pricing`/`import-preview`, ver decisión de alcance en §3.4) archivadas en
      `qa/e2e-acceptance/artifacts/ux-remediation-baseline/` con manifiesto sha256/HEAD/fecha.

**Detalle de la verificación en vivo de UXR-F0-M07** (Neon dev branch, datos sintéticos aislados,
reversible):
1. Detectadas 3 orgs `E2E*` huérfanas y vacías (de una corrida incompleta anterior, ajena a esta
   sesión) — limpiadas antes de sembrar de nuevo, para no dejar basura de otra sesión mezclada con
   la evidencia de esta.
2. Sembrado 1:1 con las sentencias de `local-setup.ts` (org A, área A, `owner@e2e.test` OWNER,
   `planner@e2e.test` PLANNER con área, `emp@e2e.test` EMPLOYEE, 1 turno, 1 `format_profiles`) +
   la inserción nueva de `format_profiles` que se añadió al fichero real.
3. Verificado por lectura: `OWNER_COUNT=1`, `PLANNER_WITH_SCOPE=true`, `SHIFT_COUNT=1`,
   `FORMAT_PROFILE_COUNT=1`. Confirmado que la org preexistente ajena (`Cadena Aurora Hoteles`,
   no-E2E) permaneció intacta durante todo el ciclo.
4. Destruido (mismo patrón que `local-teardown.ts`: `DELETE FROM organizations WHERE id = orgA`,
   `DELETE FROM users WHERE email LIKE '%@e2e.test'`) — dev DB devuelta a 0 orgs `E2E%`.
5. **Hueco declarado**: el fichero `local-setup.ts` en sí (TypeScript, `globalSetup` de Playwright)
   no se invocó literalmente en esta pasada — se reprodujeron sus sentencias en un script `.mjs`
   equivalente porque ejecutarlo tal cual requiere `playwright test --config
   playwright.local.config.ts`, que orquesta `vercel dev` (fuera de alcance/riesgo de esta pasada
   de Fase 0) o un runtime TS adicional (`tsx`/`ts-node`, no instalado — añadirlo violaría la regla
   de no nuevas dependencias). Recomendado: la primera ejecución real de Fase 2-4 contra
   `playwright.local.config.ts` sirve como la verificación literal pendiente de este fichero.

### 3.2 No regresión — DO_NOT_BREAK

- [x] La organización sintética de `UXR-F0-M07` no interfiere con datos de otras organizaciones de
      prueba (verificado: `Cadena Aurora Hoteles` intacta antes/después) y mantiene la invariante de
      una sola OWNER por organización (`ADR-2026-09-07` D7) — orgA: 1 OWNER, orgB: 1 OWNER, orgFresh:
      0 OWNER (nunca >1).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

**Antes** (HEAD `43e5c31`, árbol limpio, vía `git stash` reversible para aislar el estado heredado
del commit anterior `0cc66ff` que tocó `src/App.tsx`/`PublicHeader.tsx`/`src/index.css` — ajeno a
esta fase, no revisado ni tocado aquí):
```
npm test          → Test Files 156 passed (156) · Tests 1459 passed (1459) · EXIT 0
npx tsc --noEmit  → EXIT 0 (sin salida)
npm run lint      → EXIT 0 (sin salida, 0 errores/warnings)
npm run build     → vite build ✓ built in 4.04s · EXIT 0
```

**Después** (con los cambios de esta Fase 0 aplicados — `qa/e2e-acceptance/local-setup.ts`,
`.gitignore`, `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts`,
`qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts`, más los `.md` nuevos):
```
npm test          → Test Files 156 passed (156) · Tests 1459 passed (1459) · EXIT 0
npx tsc --noEmit  → EXIT 0 (sin salida)
npm run lint      → EXIT 0 (sin salida, 0 errores/warnings) — corregido durante la implementación:
                     una primera versión del spec de baseline usaba `extends (OriginalDate as any)`
                     para congelar el reloj, lo que disparaba `constructor-super` (2 errores) porque
                     `eslint . --ext ts,tsx` en la raíz también lint-ea `qa/e2e-acceptance/`. Fix:
                     `class FixedDate extends Date` directo, sin cast a `any`.
npm run build     → vite build ✓ built in 4.04s · EXIT 0 (sin cambios — Fase 0 no toca src/)
```
Sin regresión: mismos 156/1459 verdes, mismos 0 errores de tipo/lint, mismo build. Ningún test
eliminado ni `.skip` nuevo.

### 3.4 Matriz de evidencia visual

- [x] **Decisión de alcance documentada** (no un incumplimiento silencioso): el AC-1 de M08 exige
      "32 combinaciones (8×2×2) archivadas". La pantalla `calendar` (siempre alcanzable en
      invitado) cubre las 32 combinaciones completas. `pricing` e `import-preview` — con preview de
      5 filas Ready, alineado con la matriz de Fase 1 en `04_ACCEPTANCE_TEST_PLAN.md` — se
      capturaron en un subconjunto reducido (390×844 y 1440×900 × 2 temas × 2 locales = 8 cada
      una), no en las 8 viewports completas, para mantener el esfuerzo de Fase 0 acotado a
      "harness", no a evidencia de producto (eso es Fase 1-3). Total: 32 + 8 + 8 = 48 capturas.
- [x] `hide-scrollbars=false` no aplica/confirmado (M05): Chromium real vía `@playwright/test`.
- [ ] **Huecos declarados explícitamente** (no capturados en esta fase, `NOT_EVALUATED`):
      - Planner semanal (`/app/schedule` con rol no-EMPLOYEE) y Equipo/bulk (`MembersModal`,
        `TeamImportModal`) — **requieren sesión autenticada** (`isAdminRole`/rol no-EMPLOYEE), ver
        `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md`. No se ejecutó
        `vercel dev` en esta pasada (fuera de alcance de riesgo de Fase 0 — ver §3.1 M07). Estas
        capturas quedan pendientes de Fase 3 (`UXR-F3-M01`…`M06`), que sí las necesita y sí debe
        levantar el entorno autenticado completo.

### 3.5 Accesibilidad

- [x] N/A directo en esta fase (sin cambio de UI de producto) — confirmado, ninguna captura de M08
      reveló un estado de UI distinto al esperado por el código (no se hizo auditoría axe formal,
      fuera de alcance de Fase 0 según el gate original).

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase | Resultado real |
|---|---|---|---|
| Viewport Economy (medición) | `VIEWPORT_ECONOMY_MEASURED: PARTIAL` | Baseline congelada (precondición) | Congelada para `calendar` (32/32); `pricing`/`import-preview` en subconjunto reducido (ver §3.4) |
| Cobertura OWNER/PLANNER | `OWNER_COVERED`/`PLANNER_COVERED`: `false` | Cuentas provisionadas | Cuentas verificadas en vivo contra dev DB (no vía ejecución literal de `playwright.local.config.ts` — ver hueco §3.1). `OWNER_COVERED`/`PLANNER_COVERED` siguen en `false` hasta que Fase 3/4 ejecute journeys reales con navegador — esta fase sólo aprovisiona, no navega. |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| Procedimiento de baseline (M01/M02/M04/M05/M06) | `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` | Fase 0 (esta ejecución) | 2026-09-09 |
| Inventario de rutas internas (M03) | `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md` | Fase 0 | 2026-09-09 |
| Config de captura | `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts` | Fase 0 | 2026-09-09 |
| Spec de captura | `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts` | Fase 0 | 2026-09-09 |
| Comparador AC-1 con tolerancia declarada | `qa/e2e-acceptance/compare-baseline-runs.mjs` | Fase 0 (revisión de determinismo) | 2026-09-09 |
| 4 corridas comparadas por pares (run1..run4) | `qa/e2e-acceptance/artifacts/ux-remediation-baseline/<runId>/` (gitignored) | Fase 0 (revisión de determinismo) | 2026-09-09 |
| 48 capturas + manifiesto sha256 | `qa/e2e-acceptance/artifacts/ux-remediation-baseline/` (gitignored — regenerable con el comando de M01) | Fase 0, 2 ejecuciones (`run1`/`run2`) | 2026-09-09 |
| Seed OWNER/PLANNER/FormatProfile (código) | `qa/e2e-acceptance/local-setup.ts` (diff) | Fase 0 | 2026-09-09 |
| Verificación en vivo M07 (log de terminal, no fichero) | consultas SQL directas contra Neon dev, ver §3.1 | Fase 0 | 2026-09-09 |
| Salidas antes/después de `npm test`/`tsc`/`lint`/`build` | este gate, §3.3 | Fase 0 | 2026-09-09 |

## 5 · Gate Status

**PASS_WITH_GAPS**.

Huecos declarados explícitamente (ninguno oculto):
1. `UXR-F0-M01` AC-1: causa aislada y criterio corregido a tolerancia declarada — 0 UNSTABLE en dos
   pares de corridas. Hueco restante: la pantalla `import-preview` (8/48 capturas) queda declarada
   inestable por layout sub-píxel, propiedad de `UXR-F2-M01`/`M02`.
2. `UXR-F0-M02` AC-1: herramienta externa `i18n-integrity-check` no disponible en este entorno;
   cobertura material sustituida por `src/lib/i18n-coverage.test.ts` (PASS).
3. `UXR-F0-M07`: verificación en vivo hecha por reproducción SQL fiel, no por invocación literal
   de `local-setup.ts` vía `playwright.local.config.ts` (requiere `vercel dev`, fuera de alcance de
   riesgo de esta pasada).
4. `UXR-F0-M08`: `pricing`/`import-preview` en subconjunto reducido de viewports (decisión de
   alcance documentada, no incumplimiento oculto); planner semanal y Equipo/bulk sin capturar
   (requieren sesión autenticada, no ejercitada en esta fase).

Ninguno de estos huecos bloquea el inicio de Fase 1 (`UXR-F1-M01`…`M04`, quick wins): sus
dependencias declaradas son `UXR-F0-M05` (cumplido) y, para `CX-E01`, la verificación de que el
fixture existe (cumplido, M06). Sí bloquean/condicionan partes de Fase 2-4 que dependan de sesión
autenticada real o de un determinismo de imagen más estricto — quien ejecute esas fases debe
re-verificar el determinismo puntual de sus propias capturas (repetir 2 corridas) antes de
archivarlas, y levantar `vercel dev` + Neon para las superficies de Equipo/Miembros/planner.
