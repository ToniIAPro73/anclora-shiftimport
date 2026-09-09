# UX Remediation Codex 2026-09 — Progress Log

Resume from here after any context compaction. Leer este fichero más `03_IMPLEMENTATION_PLAN.md`
antes de hacer nada; no reiniciar subtareas ya completadas.

Plantilla vacía — una fila por microtarea, todas en `PENDING`. Al implementar, cada gate real añade
una entrada con: fecha, HEAD antes/después, ficheros tocados, tests ejecutados y resultado,
desviaciones respecto a esta spec (si las hay) y decisiones tomadas durante la implementación.

---

## Estado de microtareas (36 total)

### Fase 0 — Línea base y harness (8)

| ID | Título | Estado |
|---|---|---|
| UXR-F0-M01 | Baseline de regresión visual reproducible | PARTIAL (determinismo 34/48, ver gate) |
| UXR-F0-M02 | Formato/ubicación de locales TS para `i18n-integrity-check` | PARTIAL (herramienta externa no disponible; cobertura sustituida por `i18n-coverage.test.ts`) |
| UXR-F0-M03 | Inventario de rutas internas de App | DONE |
| UXR-F0-M04 | Declaración de consumo del Design System | NOT_APPLICABLE (sin dependencia de design system) |
| UXR-F0-M05 | `hide-scrollbars=false` obligatorio | DONE (por diseño de herramienta) |
| UXR-F0-M06 | Rutas absolutas de subida en escenarios | DONE |
| UXR-F0-M07 | Aprovisionar cuentas sintéticas OWNER y PLANNER | PARTIAL (verificado en vivo por reproducción SQL; `local-setup.ts` no invocado literalmente) |
| UXR-F0-M08 | Congelar matriz base 8×2×2 | DONE (calendar 32/32; pricing/import-preview en subconjunto reducido, ver gate) |

### Fase 1 — Quick wins (4)

| ID | Título | Estado |
|---|---|---|
| UXR-F1-M01 | CX-F03 — nombres accesibles en preview | DONE |
| UXR-F1-M02 | CX-F08 — sincronizar `lang` del documento | DONE |
| UXR-F1-M03 | CX-F09 — separar precio/moneda/intervalo, terminología de roles | DONE |
| UXR-F1-M04 | CX-E01 — alinear cabecera del fixture de empleados | PARTIAL (fixture+test contractual DONE; verificación manual por UI de `MembersModal` NOT_EVALUATED — requiere `vercel dev`+Neon) |

### Fase 2 — Alto impacto (6)

| ID | Título | Estado |
|---|---|---|
| UXR-F2-M01 | CX-F01 — resumen expandible + región visible mínima | DONE (AC funcionales con medición real; ver gate §3.1/§3.4 para huecos de captura) |
| UXR-F2-M02 | CX-F01 — adaptar filas a lectura móvil | DONE (breakpoint 768px medido, no adivinado) |
| UXR-F2-M03 | CX-F04 — derivar resumen temporal efectivo (lib) | DONE |
| UXR-F2-M04 | CX-F04 — consumir resumen efectivo en el badge (UI) | DONE (sin captura visual — NOT_EVALUATED en gate) |
| UXR-F2-M05 | CX-F05 — separar existencia/vínculo, detectar duplicado intra-fichero (lib) | DONE (extraído a `src/lib/classify-user-row.ts`) |
| UXR-F2-M06 | CX-F05 — mostrar clasificación y conteos consistentes (UI) | DONE (sin captura visual — NOT_EVALUATED en gate) |

### Fase 3 — Estructura (6)

| ID | Título | Estado |
|---|---|---|
| UXR-F3-M01 | CX-F02 — métrica total responsiva en `StatsBar` | PENDING |
| UXR-F3-M02 | CX-F02 — indicador de overflow y scroll nombrado en tabla semanal | PENDING |
| UXR-F3-M03 | CX-F06 — conectar acuse al detalle activo del shell Employee | PENDING |
| UXR-F3-M04 | CX-F06 — estado de fallo y reintento del acuse | PENDING |
| UXR-F3-M05 | CX-F07 — acción masiva explícita en Equipo | PENDING |
| UXR-F3-M06 | CX-F07 — conservar contexto al volver de la preview bulk | PENDING |

### Fase 4 — Cierre de evidencia (12)

| ID | Título | Estado |
|---|---|---|
| UXR-F4-M01 | Retest histórico F2 — gate Personal | PENDING |
| UXR-F4-M02 | Retest histórico F9 — validación de nombre en onboarding | PENDING |
| UXR-F4-M03 | Cierre histórico F1 — persistencia postcommit | PENDING |
| UXR-F4-M04 | Cierre histórico F5 — contrato documental README/AGENTS | PENDING |
| UXR-F4-M05 | Verificación de cierre histórico F6 | PENDING |
| UXR-F4-M06 | Verificación de cierre histórico F8 | PENDING |
| UXR-F4-M07 | Journeys OWNER/PLANNER (cierre de flags) | PENDING |
| UXR-F4-M08 | Ciclo publicar→acuse→solicitud→resolución (PUBLISH/APPROVAL) | PENDING |
| UXR-F4-M09 | Reimportación e idempotencia + borrado seguro | PENDING |
| UXR-F4-M10 | Importación masiva de equipo completa (TEAM_IMPORT) | PENDING |
| UXR-F4-M11 | Verificación de credencial de un solo uso | PENDING |
| UXR-F4-M12 | Cobertura STAGING/PREVIEW | PENDING |

---

## Entradas de progreso

### 2026-09-09 — Fase 0 completa (PASS_WITH_GAPS)

- **HEAD antes/después**: `43e5c31dcb3e87cc5ebe47bfc9ab937ea530c919` (sin cambio de HEAD — nada
  commiteado en esta pasada).
- **Ficheros tocados**: `qa/e2e-acceptance/local-setup.ts` (añade seed de `format_profiles` para
  UXR-F0-M07 AC-2), `.gitignore` (añade rutas de evidencia de baseline), nuevos:
  `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts`,
  `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts`,
  `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md`,
  `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md`,
  `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` (actualizado).
- **Discovery no anticipado por la spec**:
  1. `vite dev` sin backend detrás del proxy `/api` no basta para modo invitado — `fetchSession()`
     sólo trata un 401 explícito como "guest"; un fallo de proxy se trata como "desconocido" y
     redirige a `/login`. Resuelto interceptando `/api/session/me` con `context.route(...)` →
     401 sintético, sin levantar `proxy-server.mjs`.
  2. El layout actual usa `[data-testid="app-shell"]`/`[data-testid="sidebar-import"]` (componente
     `src/components/app-shell/AppShell.tsx`), no la clase `.dashboard-header` que usa el spec
     existente `specs-responsive/responsive-landscape.spec.ts` — ese spec puede estar desactualizado
     respecto al shell premium actual; no se tocó (fuera de alcance de esta microtarea), sólo se
     anota aquí para quien lo revise después.
  3. En viewports estrechos, `[data-testid="sidebar-import"]` queda fuera de viewport tras colapsar
     a drawer móvil — se añadió apertura de `[data-testid="app-shell-mobile-menu"]` cuando esté
     visible, antes de clicar el import.
  4. El import de fixture requiere un paso explícito "Procesar archivo" tras `setInputFiles` (el
     modal no auto-parsea al seleccionar el fichero) — añadido al spec, con el label resuelto vía
     `translate(locale, 'importModal.process')` para no hardcodear texto por idioma.
  5. La Neon dev branch tenía 3 organizaciones `E2E*` huérfanas y vacías de una corrida incompleta
     anterior (ajena a esta sesión) — limpiadas antes de verificar M07 en vivo, para no mezclar
     evidencia con basura de otra sesión.
- **Incidente de seguridad menor (auto-reportado)**: un primer intento de comprobar el host de
  `DATABASE_URL` con `grep`+`sed` no enmascaró correctamente la línea `DATABASE_URL_UNPOOLED` y
  expuso la contraseña de la Neon dev DB en la salida de una herramienta durante esta sesión.
  Recomendación entregada al usuario: rotar esa credencial de desarrollo por precaución. A partir de
  ese punto, toda lectura de `.env.development.local` se hizo mediante el mismo patrón interno que
  ya usa `local-setup.ts` (nunca imprime la URL).
- **Tests ejecutados y resultado**: ver `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` §3.3 (antes/
  después de `npm test`/`tsc --noEmit`/`lint`/`build`, los 4 en verde en ambos momentos). Suite de
  captura (`playwright.uxr-f0-baseline.config.ts`): 48/48 tests pasan; determinismo entre 2
  corridas: 34/48 hashes idénticos (ver gate).
- **Desviaciones respecto a la spec original**: `UXR-F0-M07` verificado por reproducción SQL fiel de
  `local-setup.ts`, no por su invocación literal (requiere `vercel dev`, fuera de alcance de riesgo
  de esta pasada — ver gate §3.1). `UXR-F0-M08` capturó `pricing`/`import-preview` en subconjunto
  reducido de viewports, no las 8 completas (decisión de alcance documentada en el gate §3.4).
- **Riesgos para fases siguientes**: Equipo/Miembros/planner semanal no capturados (requieren
  sesión autenticada real, `vercel dev` + Neon) — Fase 3 debe levantar ese entorno. El determinismo
  parcial de M01 (70.8%) significa que cualquier captura puntual de evidencia en Fase 1-4 debe
  repetirse 2 veces antes de archivarse como definitiva, no asumirse estable a la primera.
- **Siguiente paso**: Fase 1 (`UXR-F1-M01`…`M04`, quick wins) puede empezar — sus dependencias
  declaradas (`UXR-F0-M05`, `UXR-F0-M06`) están cumplidas.

---

### 2026-09-09 — Fase 1 completa (PASS_WITH_GAPS)

- **HEAD antes/después**: `83ddb82` (sin cambio de HEAD — nada commiteado en esta pasada).
- **Ficheros tocados**: `src/components/shift-dashboard/ImportModal.tsx`, `src/lib/i18n.ts`,
  `src/lib/i18n-react.tsx`, `src/lib/plans.ts`, `src/pages/PricingPage.tsx`,
  `test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv`; tests: nuevo
  `src/lib/i18n-react.test.tsx`, ampliados `src/lib/bulk-import-csv.test.ts`, `src/lib/plans.test.ts`,
  `src/pages/PricingPage.test.tsx`.
- **Orden de ejecución**: M04 → M02 → M03 → M01, como manda la dependencia dura de Fase 2 sobre M04.
- **UXR-F1-M04**: cabecera `externalEmployeeId` → `external_employee_id` en la fixture (sólo la
  cabecera; BOM y valores de fila intactos, verificado por hexdump antes/después). Test contractual
  nuevo en `bulk-import-csv.test.ts` que carga el fichero real y exige 45/45 filas parseadas. La pata
  de verificación manual por `MembersModal` (UI real, ADMIN) queda `NOT_EVALUATED` — requiere
  `vercel dev` + Neon, no levantado en esta pasada (mismo gap heredado de Fase 0).
- **UXR-F1-M02**: una línea (`document.documentElement.lang = locale`) en el único `useEffect` de
  `I18nProvider` (`src/lib/i18n-react.tsx`). `index.html:2` se deja en `lang="es"` (default real,
  documentado, no se toca). Verificado con test unitario (ciclo ES→EN→ES + mount fresco simulando
  recarga con EN persistido) y con Playwright real en modo invitado sobre `/app` y `/pricing`, ES/EN
  (4/4 — ver evidencia en el gate).
- **UXR-F1-M03**: `priceHypothesis: string` → `price: PlanPrice` estructurado (`amount`, `currency`,
  `interval`, `fromPrefix`) en `plans.ts`; `PricingPage.tsx` compone el texto vía dos claves i18n
  nuevas (`pricing.fromPrefix`, ya existía `pricing.perMonth`) en vez de concatenar sufijo sobre
  string ya compuesto. `pricing.comparison.roles` (ES/EN) corregido de "Manager" a
  "Planificador"/"Planner" (`role.planner` ya vigente en `i18n.ts:592`/`:2152`). Valores comerciales
  (0 €, 4,99 €, 19 €) sin cambio — verificado byte a byte en test.
- **UXR-F1-M01**: `aria-label` por celda (fecha/origen/tipo/inicio/fin) con identificador de fila
  estable (`row = index + 1`, coherente con cómo el propio estado ya direcciona filas por índice — no
  hay reordenación, sólo borrado). Foco predecible al borrar: `pendingRemovalFocusIndex` +
  `useEffect` sobre `parsedShifts` — fila siguiente (o anterior si era la última) recibe foco; si no
  quedan filas, foco va al contenedor de estado vacío (`role="status"`, `tabIndex={-1}`). El conteo
  tras borrar ya se anunciaba solo (el `aria-live="polite"` del botón de confirmar incluye
  `total: parsedShifts.length`) — no hizo falta una región nueva.
- **Discovery no anticipado por la spec (hallazgos de axe, corregidos dentro de alcance)**:
  1. El campo "Origen" (readOnly) de cada fila no tenía nombre accesible — axe lo marcaba `critical`.
     Añadido `aria-label` (`rowOriginAria`) igual que el resto de campos.
  2. La celda de cabecera de la columna de acciones (papelera) es un `<th>` vacío — axe
     `empty-table-header` (best-practice). Añadido `<span className="sr-only">` con clave
     `importModal.colActions` (usa `.sr-only` ya existente en `index.css`, no se tocó ese fichero).
- **Hallazgo adicional fuera de alcance (documentado, NO corregido)**: `.import-modal__shifts-list
  thead` (`position: sticky`) deriva varios px hacia abajo en cada borrado de fila, hasta cubrir por
  completo el botón de papelera de la fila 1 tras ~4 borrados sucesivos. **Verificado como
  preexistente**: se reproduce de forma idéntica (mismos y-offsets exactos) sobre el componente sin
  modificar, aisilando el cambio con `git stash` de sólo los ficheros de producto. No es causado por
  el foco programático añadido en esta microtarea. Es del mismo tipo de defecto que `CX-F01`/`CX-F02`
  (layout de `ImportModal.tsx`/scroll) — se deja para Fase 2, no se toca aquí. Los tests de evidencia
  de M01 que necesitaban borrar varias filas seguidas usan activación por teclado
  (foco + `Enter`) en vez de click de puntero, que no depende de la geometría de superposición.
- **Evidencia generada**: 6/6 tests Playwright temporales (AC-1, AC-2×2, tab order, axe ES/EN) todos
  en verde — ficheros de spec temporales, no comiteados (fuera del alcance de ficheros tocables de
  esta fase); salida JSON de axe archivada en
  `qa/e2e-acceptance/artifacts/ux-remediation-baseline/axe-uxr-f1-m01/` (ya gitignorado, mismo prefijo
  que Fase 0). 16 capturas nuevas (`import-preview` + `pricing`, 2 viewports × 2 temas × 2 locales
  cada una) generadas reutilizando sin modificar
  `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts` de Fase 0, run id
  `uxr-f1-evidence`.
- **Tests ejecutados y resultado**: `npm test`/`tsc --noEmit`/`lint`/`build` antes (línea base sobre
  HEAD limpio, vía `git stash`) y después de los cambios — los 4 en verde en ambos momentos (baseline:
  156 ficheros/1459 tests; final: 157 ficheros/1466 tests, +7 nuevos, cero regresiones, cero
  intermitencia). Ver gate §3.3 para la salida literal.
- **Desviaciones respecto a la spec original**: ninguna en el alcance de código. El AC de "Axe sin
  violaciones nuevas" se verificó con Playwright real contra `vite dev` (mismo patrón que Fase 0), no
  con un test de componente aislado — no existía tooling de axe a nivel unitario en el repo y no se
  añadió dependencia nueva para ello (regla de `AGENTS.md`).
- **Siguiente paso**: Fase 2 puede empezar — `UXR-F1-M04` cierra la dependencia dura declarada en
  `03_IMPLEMENTATION_PLAN.md` (fixture cargable por el parser real). La pata NOT_EVALUATED de M04
  (verificación por `MembersModal` en vivo) y el hallazgo del `thead` sticky quedan como riesgo
  heredado para Fase 2/3.

---

### 2026-09-09 — Fase 2 completa (PASS_WITH_GAPS)

- **HEAD antes/después**: `cbd642d` (sin cambio de HEAD — nada commiteado en esta pasada; Fase 1 ya
  en las 4 ramas remotas).
- **Ficheros tocados**: `src/lib/import-temporal.ts` (+`deriveEffectiveTemporalSummary`),
  `src/components/shift-dashboard/ImportModal.tsx` (badge CX-F04, resumen colapsable + layout de
  tarjeta CX-F01, identificador de fila por fecha §2.0.1), `src/components/shift-dashboard/MembersModal.tsx`
  (CX-F05, `classifyUserRow` extraído), `src/index.css` (breakpoint 768px, colapso de identidad,
  layout de tarjeta, min-height de la lista, scroll propio de los bloques de estado). Nuevo:
  `src/lib/classify-user-row.ts` + `.test.ts`. Tests ampliados: `import-temporal.test.ts`,
  `ImportModal.test.tsx`, `MembersModal.test.tsx`. Harness: nuevo
  `qa/e2e-acceptance/specs-baseline/uxr-f2-import-preview-evidence.spec.ts`.
- **Orden de ejecución**: Cadena A (M03→M04) → Cadena B (M05→M06) → Cadena C (M01→M02), como manda
  el prompt de fase.
- **UXR-F2-M03/M04 (CX-F04)**: `deriveEffectiveTemporalSummary(split, {identityLocked, decision})`
  pura en `import-temporal.ts`; el badge `import-future-count` ahora usa `includedAsDraft` (tiempo
  condicional: "Se crearían N borradores...") o, cuando `excludedByRole>0`, un texto explícito de
  exclusión — nunca el conteo detectado crudo como si fuera destino. Dos claves i18n nuevas
  (`temporalFutureExcluded`, reescrita `temporalFutureDraft`). No publica nada; función pura + copy.
- **UXR-F2-M05/M06 (CX-F05)**: `classifyUserRow` extraído de `MembersModal.tsx` a
  `src/lib/classify-user-row.ts` (precedente `bulk-import-csv.ts`). Bug real encontrado: el status
  `no_employee` se devolvía tanto para "cuenta existente sin empleado" (línea ~169 original) como
  para "email nuevo sin vínculo" (línea ~172), y el resumen agregaba ambos bajo "existente" — de ahí
  el defecto medido. Nuevo status `new_no_employee` para el segundo caso; el resumen ahora los cuenta
  por separado. Nuevo eje de duplicado: `seenExternalEmployeeIds` (análogo a `seenEmails`), status
  `duplicate_employee_id_in_file` con `duplicateOfIndex`, mostrado en la preview como "(ver fila N)".
- **UXR-F2-M01 (CX-F01, el P1)**: colapso 100% CSS del bloque de archivo/identidad tras el parse
  (`.import-modal-identity-summary + .import-modal-identity-detail`, selector de hermano — nunca
  desmonta el subárbol, así que no puede perder ediciones). **Hallazgo no anticipado por la spec,
  causa raíz real del 0px**: el bloque de identidad NO era el único culpable — el bloque de
  diff/temporal/consentimiento de futuros, DEBAJO de la lista de filas dentro del mismo panel flex,
  competía por el mismo espacio fijo y por sí solo ya excedía el presupuesto disponible. Se extrajo a
  `.import-modal-review-extra` (y las chips de calidad/diagnóstico a `.import-modal-review-status`),
  ambos con `flex:0 1 auto; overflow-y:auto` en viewports estrechos/cortos — nunca `display:none`
  (DO_NOT_BREAK: avisos de filas excluidas). A 844×390 el presupuesto real del panel completo es
  ~100px tras la cabecera; con eso, una fila de tarjeta de 354px no cabe sin scroll — el AC-2 exige
  "altura positiva y acciones no recortadas" (cumplido, medido: 64px), no "fila completa sin scroll"
  (eso es AC-1, para 390×844, donde sí se cumple con 180px). Corrección de `thead` sticky: añadido
  `overflow-anchor: none` (evita que el scroll-anchoring del navegador reposicione filas bajo la
  cabecera al borrar, la causa técnica exacta del drift documentado en Fase 1).
- **UXR-F2-M02 (CX-F01)**: breakpoint **768px** elegido y medido (no 760px por costumbre, no
  adivinado) — es la anchura exacta donde la auditoría midió columnas comprimidas (E061). Tabla
  reestilizada a tarjetas vía CSS puro (`.import-row-table`, mismo DOM, `<thead>` oculto
  visualmente — cada input ya lleva su propio `aria-label`, nunca dependió de `<th>`). Arrastre de
  Fase 1 corregido (§2.0.1): el identificador de fila pasa de ordinal (`turno 3`, se desactualizaba
  al borrar) a fecha (`turno del 2026-09-15`, estable), con fallback a ordinal sólo si la fecha es
  inválida/vacía. Claves i18n nuevas: `rowLabelByDate`, `rowLabelByOrdinal`.
- **Medición real (Playwright, Chromium, `@playwright/test` — no `agent-browser`)**: ver
  `qa/e2e-acceptance/artifacts/uxr-f2-evidence/measurements.json`. `shifts-list.height`: 180px
  (390×844, antes 0px), 64px (844×390, antes 0px); input de fecha en modo tarjeta: 639px de ancho
  (768×1024, antes ~66px compartidos entre 6 columnas); axe: 0 violaciones (390×844, ES, claro).
- **Tests ejecutados y resultado**: `npm test`/`tsc --noEmit`/`lint`/`build` en verde antes y después
  — 158 ficheros / 1486 tests (+20 netos sobre el cierre de Fase 1), cero regresiones.
- **Huecos declarados (no ocultos, ver gate §3.4/§3.5/§3.6)**: sin matriz PNG 8×2×2 completa; sin
  doble corrida de `compare-baseline-runs.mjs` para confirmar si `import-preview` sale de
  `DECLARED_UNSTABLE_SCREENS`; sin recalificación formal de scorecards (mejora medida pero no
  convertida en rating GOOD/FAIR defendible sin el re-audit completo de Fase 4); axe y teclado sólo
  verificados en una combinación de viewport/tema/locale, no en todas las pantallas tocadas.
- **Siguiente paso**: Fase 3 puede empezar (CX-F02/F06/F07) — ninguna de sus dependencias declaradas
  se apoya en los huecos de esta fase. Quien cierre los huecos de evidencia visual de Fase 2 puede
  reutilizar `uxr-f2-import-preview-evidence.spec.ts` como base, ampliándolo a M04/M06 y a la matriz
  completa.

---

## Revisión de determinismo de UXR-F0-M01 (2026-09-09, posterior al cierre de Fase 0)

Motivo: AC-1 quedó como "causa no aislada" (34/48, 70.8%). Se aisló.

| Paso | Resultado |
|---|---|
| Aserción de contenido poblado (`.month-day-cell` × 30, `.pricing-card` × 3) en vez de `toBeAttached()` | Aplicado |
| `stableScreenshot()` — recaptura hasta que dos buffers consecutivos son idénticos | Aplicado; `settled: true` en 48/48, `max settleTries = 2` |
| `deviceScaleFactor: 1` explícito en cada contexto | Aplicado (el manifiesto ya lo declaraba sin controlarlo) |
| Reset de scroll antes de capturar | Aplicado |
| Directorio por corrida (`artifacts/ux-remediation-baseline/<runId>/`) | Aplicado — sin esto las dos corridas se pisaban |
| Flags de rasterización determinista en `launchOptions` | Aplicados; **reducen** la varianza, **no la eliminan** (una medición inicial de 3 muestras sugirió lo contrario y no se sostuvo al ampliarla) |
| `compare-baseline-runs.mjs` — verificación de AC-1 con tolerancia declarada | Nuevo |

**Causa aislada** (medida, no hipotetizada): DOM idéntico entre procesos (33 246 chars byte a byte),
orden de CSS idéntico, capturas idénticas al byte dentro de un mismo lanzamiento (4/4). La varianza
es de rasterización entre procesos, y son **dos fenómenos distintos**: jitter de antialiasing en
glifos (13-107 px de 329 160, `maxDelta` 4-10 de 765) e inestabilidad de layout sub-píxel en
`import-preview` (líneas horizontales de 1px, y=422, `maxDelta` 43).

**Resultado**: AC-1 cumplido con tolerancia declarada, **0 UNSTABLE en dos pares independientes**
(run1/run2: 36+11+1; run3/run4: 38+7+3). `import-preview` queda **declarada inestable a nivel de
pantalla** — declararla por id fue un error corregido: la firma se movía de celda entre pares.
Propiedad de `UXR-F2-M01`/`M02` (es la distribución de alturas fijas de CX-F01).

**Observación no atribuida a esta fase**: la suite `npm test` falló 1 vez de 13 ejecuciones (~8%),
con 2 errores no capturados; no reproducible en 10 intentos consecutivos posteriores y sin relación
con estos cambios (no se tocó `src/`). Se deja registrado, no diagnosticado.
