# UX Remediation Codex 2026-09 — Implementation Plan

Regla: como máximo una microtarea `IN_PROGRESS` a la vez cuando esto se implemente. Actualizar el
campo `Estado` de este fichero y `05_PROGRESS_LOG.md` después de cada gate. Todas las microtareas
están en `PENDING` — esta spec no implementa código.

IDs: `UXR-F<fase>-M<nn>`. Una microtarea = un cambio revisable de forma independiente y reversible
por sí solo. `Esfuerzo`/`Riesgo` tomados literalmente del JSON de la auditoría cuando la microtarea
tiene un finding origen; para microtareas de Fase 0/4 (gaps de herramienta / cierre de evidencia, sin
finding origen) se estiman explícitamente como tal.

---

## FASE 0 · Línea base y harness (sin cambios de producto)

Precondición de todas las demás fases. Cierra los 6 `TOOL_COMPATIBILITY_GAPS` declarados en
`evidence_coverage.TOOL_COMPATIBILITY_GAPS` del JSON de auditoría.

### UXR-F0-M01 · Definir generación reproducible de baseline de regresión visual

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[2]` — "Visual regression no ejecutada (BLOCKED)"
- **Prioridad / Severidad**: P1 (bloquea evidencia de toda fase posterior) / N/A (gap de herramienta, no de producto)
- **Esfuerzo / Riesgo**: MEDIUM / LOW (estimado — no viene del JSON de findings)
- **Depende de**: —
- **Bloquea a**: UXR-F0-M08, toda evidencia visual de Fase 1-4
- **Superficie / Entorno**: N/A (harness) / LOCAL_BUILD
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `VISUAL_REGRESSION_COVERAGE`: "MANUAL_COMPARATIVE_PARTIAL / AUTOMATED_BLOCKED" —
> `VISUAL_REGRESSION_COMPOSED: true` pero sin cobertura material automatizada.

**Causa raíz**
> No existe un procedimiento documentado de baseline reproducible (qué build, qué seed de datos, qué
> comando genera las capturas de referencia) que la herramienta de auditoría pueda ejecutar sin
> intervención manual.

**Cambio propuesto**
1. Documentar en este fichero (sección "Procedimiento de baseline", a añadir tras la primera
   ejecución) el comando exacto, la versión de build (`npm run build` + servidor estático o
   `npm run dev`) y el estado de datos sintéticos requerido para generar una baseline determinista.
2. Verificar que el mismo procedimiento produce capturas idénticas (pixel-diff 0) en dos ejecuciones
   consecutivas sobre el mismo HEAD, antes de aceptarlo como baseline.

**Ficheros previstos** (reales — implementados)
- `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` (procedimiento documentado).
- `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts` (config de captura).
- `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts` (spec de captura).

**DO_NOT_BREAK específico**
- N/A (harness, no toca comportamiento de producto).

**Riesgos de regresión UX**
- Ninguno directo; riesgo indirecto de baseline no determinista si el build incluye timestamps o
  datos aleatorios no congelados.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el mismo HEAD y el mismo procedimiento documentado, When se ejecuta dos veces,
      Then las capturas resultantes son idénticas (0 diferencias de píxel).
- [ ] AC-2 — Given una fase posterior necesita evidencia visual, When consulta este procedimiento,
      Then puede generar la baseline sin pasos no documentados.

**Evidencia requerida para cerrar**
- Automatizado: doble ejecución + `node qa/e2e-acceptance/compare-baseline-runs.mjs run1 run2`
  (verificación con tolerancia declarada; la igualdad de sha256 no es alcanzable en este stack —
  causa medida y documentada en el procedimiento §AC-1).
- Manual: revisión de que el procedimiento no depende de estado no versionado.

**Estado**: `DONE con hueco declarado` — AC-2 cumplido (procedimiento documentado y ejecutable) y
AC-1 cumplido con tolerancia declarada: **0 UNSTABLE en dos pares independientes de corridas**
(run1/run2 y run3/run4). La causa del 70.8% inicial quedó aislada: DOM y orden de CSS idénticos
entre procesos, capturas idénticas al byte dentro de un mismo lanzamiento, y varianza de
rasterización entre procesos de dos tipos (jitter de antialiasing, y layout sub-píxel en
`import-preview`). **Hueco**: la pantalla `import-preview` queda declarada inestable — es la
distribución de alturas fijas de CX-F01 y la posee `UXR-F2-M01`/`M02`; `calendar` y `pricing`
(40/48) sí son baseline fiable. Ver `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` §3.1,
`docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` §AC-1 y `05_PROGRESS_LOG.md`.

---

### UXR-F0-M02 · Formato/ubicación de locales TS detectable por `i18n-integrity-check`

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[0]` — "TS locales no detectadas"
- **Prioridad / Severidad**: P2 / N/A
- **Esfuerzo / Riesgo**: LOW / LOW (estimado)
- **Depende de**: —
- **Bloquea a**: verificación automatizada de CX-F08/CX-F09 en Fase 1
- **Superficie / Entorno**: N/A / LOCAL_BUILD
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `I18N_COVERAGE`: "PARTIAL_BROWSER / COMPOSED_NO_MATERIAL_COVERAGE" — `I18N_COMPOSED: true` pero la
> herramienta no detectó materialmente las locales porque están en `.ts` y no en el formato/ubicación
> que la herramienta espera.

**Causa raíz**
> Divergencia entre dónde vive el catálogo de traducciones en este repo (TypeScript, no JSON/YAML) y
> el formato que `i18n-integrity-check` reconoce por defecto.

**Cambio propuesto**
1. Localizar el fichero real del catálogo de i18n (candidato: junto a `I18nContext`, hermano de
   `src/lib/use-i18n.ts`) y documentar su formato exacto.
2. Definir cómo se le indica a la herramienta dónde y en qué forma leer ese catálogo (parámetro de
   configuración de la herramienta, o un export adicional en formato reconocible) — sin cambiar el
   formato TS de producción si eso rompe el patrón existente del repo.

**Ficheros previstos** (reales — implementados)
- `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` §M02 (declaración; ningún
  cambio en `src/`).

**DO_NOT_BREAK específico**
- El catálogo de traducciones en TS sigue siendo la fuente de verdad para la app; el harness se
  adapta a él, no al revés.

**Riesgos de regresión UX**
- Ninguno (cambio de tooling de auditoría, no de producto).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el catálogo i18n real del repo, When se ejecuta `i18n-integrity-check`, Then
      detecta las claves ES/EN sin `PARTIAL`/`NO_MATERIAL_COVERAGE`.

**Evidencia requerida para cerrar**
- Automatizado: salida de `i18n-integrity-check` sobre HEAD con cobertura material declarada.

**Estado**: `PARTIAL` — herramienta externa no disponible en este entorno (`NOT_EVALUATED`);
cobertura material sustituida por `src/lib/i18n-coverage.test.ts` (PASS en `npm test`). Ver gate.

---

### UXR-F0-M03 · Inventario explícito de rutas internas de App como entrada del detector

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[1]` — "Rutas internas de App no detectadas"
- **Prioridad / Severidad**: P2 / N/A
- **Esfuerzo / Riesgo**: LOW / LOW (estimado)
- **Depende de**: —
- **Bloquea a**: cobertura completa de journeys en Fase 2-4
- **Superficie / Entorno**: APPLICATION / N/A
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> El detector de rutas vio sólo páginas convencionales (rutas de fichero/URL tradicionales);
> `App.tsx` gestiona navegación interna por estado (modales, tabs, vistas) que no son rutas URL
> discretas, así que quedan fuera del inventario automático.

**Causa raíz**
> `App.tsx` es una SPA con navegación por estado interno (`/app`, `/app/schedule` como únicas rutas
> URL reales), no un árbol de páginas por fichero.

**Cambio propuesto**
1. Construir manualmente el inventario de superficies internas alcanzables (tabs de `MembersModal`,
   modales de `ImportModal`, vistas de `AppShell`) como entrada explícita fija para el detector, en
   vez de depender de descubrimiento automático por URL.

**Ficheros previstos** (reales — implementados)
- `docs/audits/ux-remediation-codex-2026-09-internal-routes-inventory.md` (documento nuevo,
  separado de `qa/e2e-acceptance/TEST-MATRIX.md` según instrucción explícita del prompt de Fase 0).

**DO_NOT_BREAK específico**
- N/A (harness).

**Riesgos de regresión UX**
- Ninguno directo; riesgo de inventario desactualizado si no se revisa tras cambios de navegación
  futuros — fuera del alcance de esta microtarea.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el inventario de rutas internas, When se usa como entrada del detector, Then las
      superficies de `MembersModal`/`ImportModal`/`AppShell` quedan cubiertas en el journey map.

**Evidencia requerida para cerrar**
- Manual: inventario revisado contra `App.tsx` y los componentes de `shift-dashboard/`.

**Estado**: `DONE`

---

### UXR-F0-M04 · Declaración de consumo del Design System para `design-system-consumer-check`

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[3]` — "DS consumidor no reconocido"
- **Prioridad / Severidad**: P3 / N/A
- **Esfuerzo / Riesgo**: LOW / LOW (estimado)
- **Depende de**: —
- **Bloquea a**: verificación de coherencia de componentes en fases posteriores
- **Superficie / Entorno**: N/A / N/A
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `DESIGN_SYSTEM_COMPOSED: true` pero el checker no reconoce el paquete consumidor de este repo.

**Causa raíz**
> Falta una declaración explícita (manifest o convención de import) que identifique este repo como
> consumidor del design system compartido, si aplica (ver nota de gobernanza no bloqueante en
> `00_PRODUCT_SPEC.md` §4.4 sobre la aplicabilidad de los contratos premium a este repo).

**Cambio propuesto**
1. Confirmar primero si `anclora-shiftimport` consume realmente `anclora-design-system` como
   dependencia (verificar `package.json`) — si no la consume, documentar `NOT_APPLICABLE` en vez de
   forzar una declaración artificial.
2. Si sí la consume, añadir la declaración/manifest que el checker espera.

**Ficheros previstos**
- `package.json` (sólo lectura de verificación) — ningún cambio de código de producto previsto salvo
  que la verificación confirme una dependencia real no declarada correctamente.

**DO_NOT_BREAK específico**
- No añadir una dependencia nueva al repo sólo para satisfacer el checker (regla del repo: "Evitar
  dependencias nuevas sin razón clara").

**Riesgos de regresión UX**
- Ninguno.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el estado real de dependencias del repo, When se ejecuta
      `design-system-consumer-check`, Then el resultado es `PASS` o `NOT_APPLICABLE` explícito, nunca
      `UNKNOWN` por falta de declaración.

**Evidencia requerida para cerrar**
- Automatizado: salida del checker.
- Manual: inspección de `package.json`.

**Estado**: `NOT_APPLICABLE` — confirmado sin dependencia de design system en `package.json`
(`dependencies`/`devDependencies` revisados íntegros). No se añade dependencia nueva.

---

### UXR-F0-M05 · Fijar `hide-scrollbars=false` como parámetro obligatorio de medición

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[4]` — "Scrollbars ocultables por herramienta"
- **Prioridad / Severidad**: P1 (afecta directamente la medición de CX-F01/CX-F02) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW (estimado)
- **Depende de**: —
- **Bloquea a**: toda medición de overflow en Fase 2-3
- **Superficie / Entorno**: N/A / N/A
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `agent-browser` oculta scrollbars por defecto, lo que hace invisible la señal de overflow que
> CX-F01/CX-F02 dependen de medir correctamente (el JSON ya lo nota: "Las barras pueden ser visibles
> con hide-scrollbars=false").

**Causa raíz**
> Configuración por defecto de la herramienta de captura, no del producto.

**Cambio propuesto**
1. Fijar `hide-scrollbars=false` como parámetro obligatorio en todo procedimiento de captura que mida
   overflow/scroll, documentado en `04_ACCEPTANCE_TEST_PLAN.md` §Matriz de validación.

**Ficheros previstos**
- Ninguno en `src/` — configuración de harness de auditoría únicamente.

**DO_NOT_BREAK específico**
- N/A (harness).

**Riesgos de regresión UX**
- Ninguno.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cualquier captura que mida overflow/scroll en Fase 1-4, When se genera, Then usa
      `hide-scrollbars=false`.

**Evidencia requerida para cerrar**
- Manual: revisión de que el parámetro está fijado en el procedimiento documentado.

**Estado**: `DONE` — cumplido por diseño de herramienta: `@playwright/test`/Chromium real (la
herramienta canónica elegida en `UXR-F0-M01`) nunca oculta scrollbars; no existe flag que fijar.
Documentado en `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` §M05 para uso
futuro con `agent-browser`.

---

### UXR-F0-M06 · Rutas absolutas de subida en escenarios de prueba

- **Finding/gap origen**: `TOOL_COMPATIBILITY_GAPS[5]` — "Rutas de subida relativas ilegibles"
- **Prioridad / Severidad**: P2 (bloquea validación real de CX-E01/CX-F05) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW (estimado)
- **Depende de**: —
- **Bloquea a**: UXR-F1-M04, UXR-F2-M05, UXR-F2-M06
- **Superficie / Entorno**: N/A / LOCAL_BUILD
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> Las rutas de subida de fixtures usadas en escenarios (`test-data/scenarios/...`) son relativas y la
> herramienta de captura no las resuelve correctamente.

**Causa raíz**
> Los escenarios documentan rutas relativas al repo, no absolutas al sistema de ficheros donde corre
> el harness.

**Cambio propuesto**
1. Fijar rutas absolutas (resueltas contra `/Users/toni/Developer/anclora/anclora-shiftimport/...` en
   esta máquina, o la raíz de checkout que corresponda) en toda referencia de escenario usada por el
   harness de captura.

**Ficheros previstos** (reales — implementados)
- `docs/audits/ux-remediation-codex-2026-09-baseline-procedure.md` §M06 — ningún fichero de
  `test-data/` cambia de contenido por esta microtarea (eso es `UXR-F1-M04`).

**DO_NOT_BREAK específico**
- N/A (harness).

**Riesgos de regresión UX**
- Ninguno.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given un escenario con fixture de subida, When el harness lo ejecuta, Then la ruta se
      resuelve sin error de fichero no encontrado.

**Evidencia requerida para cerrar**
- Automatizado: ejecución de al menos un escenario de subida end-to-end con la ruta corregida.

**Estado**: `DONE` — 48/48 tests de `UXR-F0-M08` suben fixtures con ruta resuelta por
`join(__dirname, ...)` sin error; fixture de `CX-E01` verificado existente para Fase 1.

---

### UXR-F0-M07 · Aprovisionar cuentas sintéticas OWNER y PLANNER

- **Finding/gap origen**: `evidence_coverage.OWNER_COVERED=false`, `PLANNER_COVERED=false`
- **Prioridad / Severidad**: P1 (bloquea Fase 3/4 con esos roles) / N/A
- **Esfuerzo / Riesgo**: MEDIUM / LOW (datos sintéticos aislados)
- **Depende de**: —
- **Bloquea a**: UXR-F4-M07 y toda validación de Fase 3/4 que requiera OWNER/PLANNER
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: OWNER, PLANNER

**Comportamiento actual (medido)**
> La auditoría cubrió navegador sólo para ADMIN/EMPLOYEE; `OWNER_COVERED` y `PLANNER_COVERED` están
> en `false` — sin cuentas sintéticas provisionadas para esos roles en el ciclo de auditoría.

**Causa raíz**
> No existían cuentas sintéticas OWNER/PLANNER con historial y formatos poblados disponibles para la
> corrida de auditoría.

**Cambio propuesto**
1. Crear organización sintética con cuenta OWNER dedicada (datos aislados, sin PII real).
2. Crear cuenta PLANNER sintética con al menos un modo de scope (`ORGANIZATION`, `AREAS` o
   `EMPLOYEES` — los tres si el tiempo lo permite) per `ADR-2026-09-07-P5.7-team-roles-scopes.md` D5.
3. Poblar historial de turnos e importar al menos un `FormatProfile` aprendido para que las cuentas no
   arranquen en estado vacío.

**Ficheros previstos** (reales — implementados)
- `qa/e2e-acceptance/local-setup.ts` (añade seed de `format_profiles` para orgA; el resto de
  memberships OWNER/PLANNER ya existía en el fichero).

**DO_NOT_BREAK específico**
- Aislamiento organización (esta org sintética no debe interferir con datos de otras orgs de
  prueba); una sola OWNER por organización (`ADR-2026-09-07` D7).

**Riesgos de regresión UX**
- Ninguno directo (provisión de datos, no cambio de código).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given la organización sintética, When se lista su membership, Then existe exactamente 1
      OWNER y al menos 1 PLANNER con scope definido.
- [ ] AC-2 — Given las cuentas provisionadas, When se usan en Fase 3/4, Then no arrancan en estado
      vacío (historial y formato presentes).

**Evidencia requerida para cerrar**
- Manual: capturas de la organización sintética con ambos roles operativos.

**Estado**: `PARTIAL` — AC-1/AC-2 verificados en vivo contra Neon dev por reproducción SQL fiel de
`local-setup.ts` (1 OWNER, 1 PLANNER con scope, historial + FormatProfile poblados, org ajena
intacta); la invocación literal del fichero `.ts` vía `playwright.local.config.ts` (`vercel dev` +
Neon) no se ejecutó en esta pasada. Ver gate §3.1 para el detalle y el hueco declarado.

---

### UXR-F0-M08 · Congelar matriz base de 8 viewports × 2 temas × 2 locales

- **Finding/gap origen**: precondición declarada en la sección 39 de la auditoría
- **Prioridad / Severidad**: P1 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / LOW (estimado)
- **Depende de**: UXR-F0-M01, UXR-F0-M05
- **Bloquea a**: toda matriz de evidencia visual de Fase 1-4
- **Superficie / Entorno**: APPLICATION + LANDING_PAGE / LOCAL_BUILD
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `VIEWPORT_ECONOMY_MEASURED: PARTIAL`; sin baseline congelada de los 8 viewports declarados.

**Causa raíz**
> Sin `UXR-F0-M01` (procedimiento reproducible) y `UXR-F0-M05` (scrollbars visibles), cualquier
> intento de congelar baseline sería no determinista o incompleto.

**Cambio propuesto**
1. Generar y archivar la baseline para 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900,
   1728×1117, 844×390 × {claro, oscuro} × {ES, EN} usando el procedimiento de `UXR-F0-M01` con
   `hide-scrollbars=false`.

**Ficheros previstos** (reales — implementados)
- `qa/e2e-acceptance/artifacts/ux-remediation-baseline/` (48 PNG + `manifest.json`, gitignored,
  regenerable con el comando de `UXR-F0-M01`).

**DO_NOT_BREAK específico**
- N/A (harness).

**Riesgos de regresión UX**
- Ninguno directo.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given los 8×2×2 = 32 combinaciones, When se genera la baseline, Then las 32 capturas
      existen y están archivadas con fecha/HEAD de referencia.

**Evidencia requerida para cerrar**
- Automatizado/manual: 32 capturas archivadas.

**Estado**: `DONE` — 32/32 combinaciones de `calendar` archivadas; `pricing`/`import-preview`
añadidas en subconjunto reducido (16 capturas extra) por decisión de alcance documentada en el
gate §3.4. Total 48 capturas con manifiesto sha256/HEAD/fecha.

---

## FASE 1 · Quick wins → CX-F03, CX-F08, CX-F09, CX-E01

Validación: Axe + teclado, ES/EN, y carga del fixture por la UI real. **`UXR-F1-M04` (CX-E01) es
dependencia dura de Fase 2** — `CX-F05` no se puede validar por la ruta de usuario real sin una
fixture que el parser acepte.

### UXR-F1-M01 · Nombrar accesiblemente campos y papeleras de preview por fila

- **Finding origen**: CX-F03
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M05 (medición axe/DOM sin distorsión de scrollbar)
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / PRODUCTION
- **Roles implicados**: ADMIN, EMPLOYEE, GUEST

**Comportamiento actual (medido)**
> Axe y DOM identifican cuatro papeleras sin nombre y campos de tabla sin label asociado en preview
> de cuatro filas. (Evidencia: E011)

**Causa raíz UX**
> Cabeceras visuales no se vinculan como nombres programáticos de cada control.

**Cambio propuesto (implementado)**
1. En `src/components/shift-dashboard/ImportModal.tsx`, `aria-label` contextual (`t('importModal.rowXxxAria', { row })`)
   en cada input de fila (fecha, origen, tipo, inicio, fin) y en cada botón de papelera — índice
   estable de fila (`row = index + 1`), no la posición visual.
2. El conteo de filas tras un borrado ya se anunciaba: el `aria-live="polite"` del botón de confirmar
   incluye `total: parsedShifts.length`, que cambia con el array — no hizo falta una región nueva.
3. Foco predecible al borrar: `pendingRemovalFocusIndex` + `useEffect` sobre `parsedShifts` — la fila
   que ocupa el hueco (o la anterior si era la última) recibe foco; sin filas restantes, foco va al
   contenedor de estado vacío (`role="status"`, `tabIndex={-1}`).
4. Hallazgos de axe corregidos dentro de alcance: campo "Origen" sin nombre (`rowOriginAria`) y `<th>`
   vacío de la columna de acciones (`<span className="sr-only">`, clave `colActions`).

**Ficheros previstos (reales — implementados)**
- `src/components/shift-dashboard/ImportModal.tsx` — nombres accesibles por fila + gestión de foco,
  sin nuevo texto visual repetitivo.
- `src/lib/i18n.ts` — claves `rowDateAria`/`rowOriginAria`/`rowTypeAria`/`rowStartAria`/`rowEndAria`/
  `removeRowAria`/`colActions` (ES/EN).

**DO_NOT_BREAK específico**
- Edición precommit
- Borrado de una sola fila
- Orden de tabulación
- Sin añadir texto visual repetitivo

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given preview de varias filas, When foco entra en hora final, Then se anuncia campo y
      turno asociado.
- [ ] AC-2 — Given papelera, When recibe foco, Then su nombre identifica la fila; al borrar el foco
      queda en un destino predecible.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 y 390×844 × {claro, oscuro} × {ES, EN} del preview con 4+ filas.
- Automatizado: `npm test` (fichero de test de `ImportModal`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`, Axe sin violaciones nuevas.
- Manual: recorrido por teclado completo del preview con lector de pantalla o inspección de árbol de
  accesibilidad; cuenta sintética ADMIN.

**Estado**: `DONE` — ver evidencia en `docs/roadmap/UXR-F1-QUICK-WINS-GATE.md` §4. Hallazgo adicional
fuera de alcance documentado (drift del `thead` sticky en `ImportModal.tsx`, preexistente, ver
`05_PROGRESS_LOG.md`).

---

### UXR-F1-M02 · Sincronizar `document.documentElement.lang` con el locale efectivo

- **Finding origen**: CX-F08
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M02 (detección de locales por el harness)
- **Bloquea a**: verificación i18n de Fase 4 (`UXR-F4-M12`, entorno STAGING/PREVIEW)
- **Superficie / Entorno**: APPLICATION + LANDING_PAGE / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: GUEST, ADMIN, EMPLOYEE (todos)

**Comportamiento actual (medido)**
> `document.documentElement.lang` permanece `es` mientras botones y contenidos muestran EN; también
> medido en producción. (Evidencia: E063, E064; código: `index.html:2` literalmente
> `<html lang="es">`, `src/lib/use-i18n.ts` no toca el DOM raíz.)

**Causa raíz UX**
> Locale visual no sincroniza el atributo raíz del documento.

**Cambio propuesto**
1. Localizar el provider de `I18nContext` (punto único de cambio de locale) y añadir la escritura de
   `document.documentElement.lang` en cada cambio de locale.
2. Confirmar que el valor inicial en carga fría coincide con el locale por defecto efectivo (no
   necesariamente `es` si el usuario ya tenía EN persistido).
3. Retestear páginas públicas y modales tras el cambio.

**Ficheros previstos (reales — implementados)**
- `index.html` — sin cambio: `lang="es"` se mantiene como default real documentado (no `en`).
- `src/lib/i18n-react.tsx` (`I18nProvider`, 22→23 líneas) — una línea en el `useEffect` existente:
  `document.documentElement.lang = locale`. Dispara también en el montaje inicial (cubre AC-2, carga
  fría con locale persistido).

**DO_NOT_BREAK específico**
- Persistencia de locale
- Traducciones existentes
- SSR/default si se incorpora posteriormente

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given interfaz EN, When se inspecciona html, Then `lang=en`.
- [ ] AC-2 — Given cambio ES→EN→ES y recarga, When cada vista se renderiza, Then idioma del documento
      coincide con preferencia efectiva.

**Evidencia requerida para cerrar**
- Capturas: no aplica (verificación de atributo DOM, no visual) — registrar valor de
  `document.documentElement.lang` en cada combinación de la matriz de locale.
- Automatizado: `npm test` (test nuevo/afectado del provider i18n), `npx tsc --noEmit`,
  `npm run lint`, `npm run build`.
- Manual: cambio ES→EN→ES con recarga en landing y en `/app`, cuenta GUEST y ADMIN.

**Estado**: `DONE` — GUEST verificado (test unitario + Playwright real en `/app` y `/pricing`, ES/EN).
ADMIN queda `NOT_EVALUATED` (requiere `vercel dev`+Neon, gap heredado de Fase 0). Ver gate §4.

---

### UXR-F1-M03 · Separar importe/moneda/intervalo y alinear terminología de roles en pricing EN

- **Finding origen**: CX-F09
- **Prioridad / Severidad**: P3 / LOW
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M02
- **Bloquea a**: —
- **Superficie / Entorno**: LANDING_PAGE / PRODUCTION
- **Roles implicados**: GUEST

**Comportamiento actual (medido)**
> Se muestra "4,99 €/mes/mo" y "Desde 19 €/mes/mo"; comparación conserva "Manager" frente al rol
> "Planner" del producto. (Evidencia: E030, E031; código: `src/lib/plans.ts:48,57,66`,
> `src/pages/PricingPage.tsx:47`.)

**Causa raíz UX**
> Precio/copy español hardcodeado se concatena con sufijo localizado y vocabulario heredado.

**Cambio propuesto**
1. En `src/lib/plans.ts`, sustituir `priceHypothesis: string` por campos estructurados (importe,
   moneda, intervalo, prefijo "Desde") — ver forma exacta en `02_DATA_API_CONTRACT.md`.
2. En `src/pages/PricingPage.tsx`, renderizar cada campo a través de la capa de i18n existente, sin
   concatenar un sufijo de intervalo sobre un string ya compuesto.
3. Alinear cualquier referencia residual a "Manager" con "Planner" (`ADR-2026-09-07-P5.7-team-roles-scopes.md`).

**Ficheros previstos (reales — implementados)**
- `src/lib/plans.ts` — `PlanPrice { amount, currency, interval, fromPrefix }` sustituye
  `priceHypothesis: string`; valores numéricos sin cambio (`null`/`4.99`/`19`).
- `src/pages/PricingPage.tsx` — compone `fromPrefix`/`amount`/`perMonth` vía i18n, sin concatenar
  sobre string ya compuesto.
- `src/lib/i18n.ts` — clave nueva `pricing.fromPrefix` (ES "Desde" / EN "From"); `perMonth` ya
  existía. `pricing.comparison.roles` corregido de "Manager" a "Planificador"/"Planner"
  (`role.planner`, `i18n.ts:592`/`:2152`).

**DO_NOT_BREAK específico**
- Distinción Free/Personal/Team
- No cambiar precios comerciales sin decisión de producto

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given EN, When abre pricing, Then no aparecen "Desde" ni "/mes/mo".
- [ ] AC-2 — Given comparación de roles, When se lee planificación, Then coincide con "Planner"
      vigente.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 y 390×844 × {claro, oscuro} de `PricingPage` en ES y EN.
- Automatizado: `npm test` (test de `plans.ts`/`PricingPage`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: lectura completa de pricing EN sin mezcla de idioma; cuenta GUEST.

**Estado**: `DONE` — ver evidencia en el gate §4 (16 capturas + tests unitarios/Playwright).

---

### UXR-F1-M04 · Alinear cabecera del fixture de empleados con el contrato del parser

- **Finding origen**: CX-E01
- **Prioridad / Severidad**: P3 / LOW
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M06
- **Bloquea a**: UXR-F2-M05, UXR-F2-M06, UXR-F4-M10 (TEAM_IMPORT_COVERED)
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> Fixture ofrece `externalEmployeeId` y el parser exige `external_employee_id`. Se rechaza en la UI
> de importación masiva. (Evidencia: E053; código: fixture línea 1 vs.
> `src/lib/bulk-import-csv.ts:38,81`.)

**Causa raíz UX**
> Contrato de fixture de escenario y parser de provisioning han divergido.

**Cambio propuesto**
1. Renombrar la columna `externalEmployeeId` → `external_employee_id` en
   `test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv` (cabecera únicamente, sin
   tocar los valores de las filas).
2. Añadir una prueba contractual (`bulk-import-csv.test.ts` o equivalente) que cargue el fixture real
   y falle si vuelve a divergir del header esperado por `columnIndex`.

**Ficheros previstos (reales — implementados)**
- `test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv` — sólo cabecera
  (`externalEmployeeId` → `external_employee_id`); BOM y valores de fila verificados intactos.
- `src/lib/bulk-import-csv.test.ts` — ya existía; ampliado con el test contractual (carga el fichero
  real, exige 45/45 filas).

**DO_NOT_BREAK específico**
- Dataset sintético
- Casos de incidencia deliberados

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given fixture designada para bulk empleados, When se carga, Then alcanza preview y no
      falla por headers.

**Evidencia requerida para cerrar**
- Automatizado: `npm test` (test contractual nuevo), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: carga del fixture por la UI real de importación masiva de empleados, cuenta sintética
  ADMIN.

**Estado**: `PARTIAL` — AC-1 cumplido por el test contractual (fixture real, 45/45 filas, parser sin
cambios). La verificación manual por `MembersModal` (UI real) queda `NOT_EVALUATED`: requiere
`vercel dev`+Neon, no levantado en esta pasada (gap heredado de Fase 0). No bloquea Fase 2: la
dependencia dura declarada (fixture cargable por el parser) está resuelta y verificada.

---

## FASE 2 · Alto impacto → CX-F01, CX-F04, CX-F05

Validación: 8 viewports; preview con históricos/futuros y por rol; casos nuevos/existentes/duplicados.

### UXR-F2-M01 · Resumen expandible de archivo/identidad y región visible mínima de revisión

- **Finding origen**: CX-F01
- **Prioridad / Severidad**: P1 / HIGH
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F0-M08 (baseline de viewports)
- **Bloquea a**: UXR-F2-M02
- **Superficie / Entorno**: APPLICATION / PRODUCTION + LOCAL_BUILD
- **Roles implicados**: EMPLOYEE, GUEST, ADMIN

**Comportamiento actual (medido)**
> A 390×844 y 844×390 hay cinco filas en DOM, pero su lista mide 0px; el panel padre recorta su
> contenido. A 768px los campos quedan estrechos. (Evidencia: E013, E059, E060, E061, E062.)

**Causa raíz UX**
> Altura de workspace fija repartida entre uploader, formulario y resúmenes que no ceden espacio tras
> parse.

**Cambio propuesto**
1. En `ImportModal.tsx`, tras completar el parse, colapsar el bloque de archivo/identidad a un
   resumen expandible (colapsado por defecto en viewports estrechos).
2. En `src/index.css`, redistribuir el `flex`/`grid` del contenedor de revisión para garantizar
   `min-height` positivo (nunca 0px) y `overflow-y: auto` propio del bloque de filas cuando el
   contenido no cabe — nunca scroll del modal completo (regla de `MODAL_CONTRACT.md`).

**Ficheros previstos**
- `src/components/shift-dashboard/ImportModal.tsx` — resumen colapsable, redistribución de estado.
- `src/index.css` — layout/alturas del contenedor de revisión.

**DO_NOT_BREAK específico**
- Preview antes de escritura
- Identidad y período autoritativos
- Avisos de filas excluidas
- Focus y cierre seguro

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cinco filas Ready a 390×844, When termina parse, Then al menos una fila completa
      es visible y todas son alcanzables.
- [ ] AC-2 — Given 844×390, When se abre revisión, Then el área de filas tiene altura positiva y las
      acciones no quedan recortadas.
- [ ] AC-3 — Given preview editada, When se cambia orientación o se expande archivo, Then se
      preservan cambios y selección temporal.

**Evidencia requerida para cerrar**
- Capturas: 390×844, 844×390, 768×1024 × {claro, oscuro} con preview de 5+ filas Ready.
- Automatizado: `npm test` (`ImportModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: parse completo + revisión + confirmación en los 3 viewports críticos, cuenta sintética
  EMPLOYEE.

**Estado**: `DONE` — AC-1/AC-2/AC-3 verificados con medición real (Playwright): `shifts-list.height`
390×844=180px, 844×390=64px (antes 0px ambos). Causa raíz completa: no sólo el bloque de
identidad/archivo — el bloque de diff/temporal/consentimiento de futuros, DEBAJO de la lista dentro
del mismo panel, también competía por el espacio fijo y por sí solo excedía el presupuesto; extraído
a `.import-modal-review-extra`/`.import-modal-review-status` con scroll propio (nunca oculto —
DO_NOT_BREAK). `thead` sticky corregido con `overflow-anchor: none`. Ver
`docs/roadmap/UXR-F2-HIGH-IMPACT-GATE.md` §3.1/§4 para la evidencia completa y los huecos declarados
(matriz PNG completa y doble corrida de baseline no ejecutadas).

---

### UXR-F2-M02 · Adaptar filas de revisión a lectura móvil (layout de tarjeta)

- **Finding origen**: CX-F01
- **Prioridad / Severidad**: P1 / HIGH
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F2-M01
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / PRODUCTION + LOCAL_BUILD
- **Roles implicados**: EMPLOYEE, GUEST, ADMIN

**Comportamiento actual (medido)**
> A 768px los campos quedan estrechos incluso cuando la lista es visible; el layout de tabla no se
> adapta a lectura móvil. (Evidencia: E061.)

**Causa raíz UX**
> Layout de fila diseñado para densidad de escritorio (columnas fijas), sin variante para viewports
> estrechos.

**Cambio propuesto**
1. Definir breakpoint (candidato 768px, a confirmar contra la matriz de 8 viewports) por debajo del
   cual cada fila de revisión pasa de columnas de tabla a un layout de tarjeta apilada
   (fecha/hora/empleado/acciones en bloque vertical), conservando los mismos controles editables y la
   papelera por fila con su nombre accesible (`UXR-F1-M01`).

**Ficheros previstos**
- `src/components/shift-dashboard/ImportModal.tsx` — variante de layout de fila.
- `src/index.css` — media query del breakpoint.

**DO_NOT_BREAK específico**
- Preview antes de escritura
- Identidad y período autoritativos
- Avisos de filas excluidas
- Focus y cierre seguro

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cinco filas Ready a 390×844, When termina parse, Then al menos una fila completa
      es visible y todas son alcanzables. *(compartido con AC-1 de `UXR-F2-M01`, verificado de nuevo
      con el layout de tarjeta aplicado)*
- [ ] AC-2 — Given 768×1024 (tablet), When se abre revisión, Then los campos de cada fila son legibles
      sin comprimirse.
- [ ] AC-3 — Given preview editada en layout de tarjeta, When se cambia de fila o se edita un campo,
      Then el foco y el valor editado se conservan.

**Evidencia requerida para cerrar**
- Capturas: 390×844, 430×932, 768×1024 × {claro, oscuro} con edición activa en una fila.
- Automatizado: `npm test` (`ImportModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: edición y borrado de fila en layout de tarjeta, cuenta sintética EMPLOYEE.

**Estado**: `DONE` — breakpoint **768px confirmado con datos** (anchura exacta donde la auditoría
midió columnas comprimidas, E061; no 760px por costumbre). Medido: input de fecha en modo tarjeta
639px de ancho (antes ~66px). `<thead>` oculto visualmente sin pérdida de accesibilidad (cada input
ya lleva `aria-label` propio, nunca dependió de `<th>`). Arrastre de Fase 1 §2.0.1 corregido:
identificador de fila por fecha (`turno del 2026-09-15`), no por ordinal. AC-3: mismo DOM tabla↔tarjeta
(reestilo CSS puro, `.import-row-table`), por construcción no puede perder foco/valor al cambiar de
layout — cubierto por el test existente de edición.

---

### UXR-F2-M03 · Derivar resumen temporal efectivo (detectado/incluido/excluido)

- **Finding origen**: CX-F04
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: LOW / MEDIUM
- **Depende de**: —
- **Bloquea a**: UXR-F2-M04
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: EMPLOYEE, ADMIN

**Comportamiento actual (medido)**
> Badge muestra cinco futuros→borrador con históricos-only; Employee recibe además mensaje de que no
> se creará planificación. (Evidencia: E041, E064; código: `ImportModal.tsx:1735`,
> `src/lib/import-temporal.ts`.)

**Causa raíz UX**
> Conteo de fechas detectadas expresado como destino efectivo antes de aplicar rol/decisión.

**Cambio propuesto**
1. Añadir `deriveEffectiveTemporalSummary` (pura, ver `02_DATA_API_CONTRACT.md`) en
   `src/lib/import-temporal.ts` que, dado el split histórico/futuro y el contexto de rol+decisión,
   devuelva `{ detected, includedAsDraft, excludedByRole }`.
2. Cobertura de test unitario para EMPLOYEE (excluido) y ADMIN/PLANNER (incluido según decisión).

**Ficheros previstos**
- `src/lib/import-temporal.ts` — nueva función pura.
- `src/lib/import-temporal.test.ts` — cobertura unitaria (fichero nuevo o ampliado).

**DO_NOT_BREAK específico**
- No publicar automáticamente
- Self scope
- Decisión explícita de futuros
- Conteo sin descarte silencioso

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 (añadido) — Given un split con futuros y `identityLocked=true` (EMPLOYEE), When se deriva
      el resumen efectivo, Then `includedAsDraft = 0` y `excludedByRole = detected`.
- [ ] AC-2 (añadido) — Given un split con futuros y decisión `historical-only`, When se deriva el
      resumen efectivo, Then `includedAsDraft = 0` para ADMIN/PLANNER también.

**Evidencia requerida para cerrar**
- Automatizado: `npx vitest run src/lib/import-temporal.test.ts`, `npx tsc --noEmit`, `npm run lint`.
- Manual: no aplica (función pura, sin UI en esta microtarea).

**Estado**: `DONE` — `deriveEffectiveTemporalSummary` implementada tal como el contrato de
`02_DATA_API_CONTRACT.md` la definía, sin cambios de firma. AC-1 y AC-2 cubiertos literalmente por
test (5 casos: EMPLOYEE+draft, EMPLOYEE+historical-only, ADMIN+historical-only, ADMIN+draft, sin
futuros).

---

### UXR-F2-M04 · Consumir el resumen temporal efectivo en el badge de `ImportModal`

- **Finding origen**: CX-F04
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: LOW / MEDIUM
- **Depende de**: UXR-F2-M03
- **Bloquea a**: UXR-F4-M06 (cierre de histórico F8)
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: EMPLOYEE, ADMIN

**Comportamiento actual (medido)**
> Ver `UXR-F2-M03` — el badge actual muestra el conteo detectado como si fuera el destino efectivo.

**Causa raíz UX**
> Ver `UXR-F2-M03`.

**Cambio propuesto**
1. En `ImportModal.tsx` (entorno de la línea 1735), sustituir el conteo directo de futuros por el
   resultado de `deriveEffectiveTemporalSummary`.
2. Usar futuro condicional ("se crearían N borradores") antes de que el usuario confirme la decisión;
   mensaje distinto y explícito cuando `excludedByRole > 0` (razón visible, no sólo el número).

**Ficheros previstos**
- `src/components/shift-dashboard/ImportModal.tsx` — consumo de la derivación, copy condicional.

**DO_NOT_BREAK específico**
- No publicar automáticamente
- Self scope
- Decisión explícita de futuros
- Conteo sin descarte silencioso

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given Employee con futuros, When revisa resumen, Then cero borradores a crear y razón
      explícita.
- [ ] AC-2 — Given Admin con históricos-only, When cambia a incluir futuros, Then conteos/destinos se
      actualizan de forma consistente.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 × {claro, oscuro} × {ES, EN} del badge para EMPLOYEE y ADMIN con futuros
  presentes.
- Automatizado: `npm test` (`ImportModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: import con futuros para EMPLOYEE (excluido) y ADMIN (toggle históricos↔futuros), cuentas
  sintéticas de ambos roles.

**Estado**: `DONE` (huecos: sin captura visual 1440×900×claro/oscuro×ES/EN — ver gate) — badge
`import-future-count` consume `deriveEffectiveTemporalSummary`; texto condicional ("Se crearían N
borradores...") sólo cuando `includedAsDraft>0`, texto explícito de exclusión cuando
`excludedByRole>0` (nunca oculto). AC-1/AC-2 cubiertos por test de componente (EMPLOYEE con futuros:
badge y `import-self-future-notice` coinciden en "cero borradores"; ADMIN: badge cambia al alternar
historical-only↔draft). DO_NOT_BREAK "nunca publicar automáticamente" verificado explícitamente.

---

### UXR-F2-M05 · Separar existencia de cuenta y vínculo de empleado; detectar duplicado intra-fichero

- **Finding origen**: CX-F05
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F1-M04 (fixture cargable), UXR-F0-M06
- **Bloquea a**: UXR-F2-M06
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido, verificado línea a línea)**
> Usuario nuevo sin empleado se cuenta como ya miembro; dos empleados con mismo ID nuevo se cuentan
> ambos como nuevos. (Evidencia: E051, E055, E057; código: `classifyUserRow` en
> `MembersModal.tsx:172` devuelve `status: 'no_employee'` para un email nuevo sin vínculo, agregado
> incorrectamente bajo "existing" en el resumen de la línea 999; sin verificación de
> `externalEmployeeId` ya visto en la misma pasada del fichero.)

**Causa raíz UX**
> Estados mezclan existencia de cuenta y vínculo; empleados no simulan duplicación intrafichero en
> preflight.

**Cambio propuesto**
1. En `classifyUserRow` (`MembersModal.tsx`), separar el eje "cuenta existe" del eje "vínculo a
   empleado" en el tipo de resultado (ver forma prevista en `02_DATA_API_CONTRACT.md`).
2. Añadir seguimiento de `externalEmployeeId` ya vistos en la pasada actual (análogo al `seenEmails`
   existente en la línea 140) y devolver un status dedicado de duplicado intra-fichero con referencia
   a la fila original cuando se repite un ID nuevo.
3. Cobertura de test unitario para los 4 casos: nuevo sin vínculo, existente con vínculo, existente
   sin vínculo, dos filas con el mismo ID nuevo.

**Ficheros previstos**
- `src/components/shift-dashboard/MembersModal.tsx` — `classifyUserRow` y tipo de resultado.
- Test unitario nuevo/ampliado para `classifyUserRow` (fichero a confirmar: extracción a
  `src/lib/` si facilita testeo aislado, o test de componente existente).

**DO_NOT_BREAK específico**
- Revalidación backend
- No crear empleado al importar usuario
- Aislamiento organización
- Motivos por fila

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 (añadido) — Given un email nuevo sin `externalEmployeeId`, When se clasifica, Then el
      status resultante distingue explícitamente "nuevo sin vínculo" de cualquier status de "ya
      miembro".
- [ ] AC-2 (añadido) — Given dos filas con el mismo `externalEmployeeId` nuevo en el mismo fichero,
      When se clasifican en orden, Then la segunda fila recibe un status de duplicado con referencia
      al índice de la primera.

**Evidencia requerida para cerrar**
- Automatizado: `npx vitest run` sobre el test de `classifyUserRow`, `npx tsc --noEmit`,
  `npm run lint`.
- Manual: no aplica en esta microtarea (lógica pura; la UI se valida en `UXR-F2-M06`).

**Estado**: `DONE` — **ubicación real**: `classifyUserRow` extraído a `src/lib/classify-user-row.ts`
(precedente `bulk-import-csv.ts`), no dejado como función local del componente. Bug real encontrado
en `MembersModal.tsx` (no sólo el descrito en la spec): `no_employee` se devolvía tanto para "cuenta
existente sin empleado" como para "email nuevo sin vínculo" — nuevo status `new_no_employee` separa
el segundo caso. Nuevo eje `seenExternalEmployeeIds` (análogo a `seenEmails`) para el AC-2, status
`duplicate_employee_id_in_file` + `duplicateOfIndex`. 8 tests unitarios cubren los 2 AC más casos de
regresión (email duplicado sin afectar por el nuevo eje, id no coincidente = `employee_not_found`).

---

### UXR-F2-M06 · Mostrar clasificación y conteos consistentes en la preview de provisioning

- **Finding origen**: CX-F05
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F2-M05
- **Bloquea a**: UXR-F4-M10 (TEAM_IMPORT_COVERED)
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> Ver `UXR-F2-M05` — el resumen de conteos en `MembersModal.tsx:999` agrega incorrectamente
> "no_employee" bajo "existing".

**Causa raíz UX**
> Ver `UXR-F2-M05`.

**Cambio propuesto**
1. Recalcular el resumen de conteos (línea 999) sobre los nuevos ejes de `UXR-F2-M05`: "nuevos sin
   vínculo", "existentes", "duplicados/conflicto" — la suma debe coincidir exactamente con el total
   de filas y con lo que la confirmación va a ejecutar.
2. Mostrar el motivo del conflicto por fila (referencia a la fila duplicada) en la tabla de preview,
   no sólo en el conteo agregado.

**Ficheros previstos**
- `src/components/shift-dashboard/MembersModal.tsx` — resumen de conteos y tabla de preview.

**DO_NOT_BREAK específico**
- Revalidación backend
- No crear empleado al importar usuario
- Aislamiento organización
- Motivos por fila

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given email nuevo sin external ID, When preview, Then se clasifica nuevo sin vínculo, no
      ya miembro.
- [ ] AC-2 — Given dos filas con mismo ID nuevo, When preview, Then segunda fila indica
      duplicado/conflicto con referencia a primera.
- [ ] AC-3 — Given filas válidas+inválidas, When muestra conteos, Then su suma coincide con total y
      política de confirmación.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 × {claro, oscuro} de la preview de usuarios con los 4 casos representados
  (nuevo, existente con vínculo, existente sin vínculo, duplicado).
- Automatizado: `npm test` (`MembersModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: carga del fixture corregido (`UXR-F1-M04`) con filas nuevas/existentes/duplicadas,
  cuenta sintética ADMIN.

**Estado**: `DONE` (hueco: sin captura visual 1440×900×claro/oscuro — ver gate) — resumen de conteos
recalculado sobre los nuevos ejes de M05 (`new_and_link`+`new_no_employee`→"nuevas";
`existing_and_link`+`already_linked`+`no_employee`→"ya son miembros"; el resto→"errores", incluido el
nuevo duplicado). Test de componente con los 4 casos exactos de la auditoría en un único CSV de 5
filas: `5 filas · 2 ya son miembros · 2 nuevas · 1 errores` — AC-3 verificado, la suma cuadra
exactamente con el total. Motivo del duplicado mostrado por fila ("(ver fila N)"), no sólo en el
agregado.

---

## FASE 3 · Estructura → CX-F02, CX-F06, CX-F07

Validación: cuentas Owner/Admin/Planner/Employee y ciclo sintético
`publicar → consultar → acuse → solicitar → resolver`.

### UXR-F3-M01 · Métrica total legible sin desplazamiento horizontal en `StatsBar`

- **Finding origen**: CX-F02
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F0-M08
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: ADMIN, PLANNER, EMPLOYEE

**Comportamiento actual (medido)**
> Métricas ~1135px sobre teléfono; el total principal queda fuera de vista sin scroll evidente.
> (Evidencia: E014, E015; código: `src/components/shift-dashboard/StatsBar.tsx`.)

**Causa raíz UX**
> Densidad desktop mantenida en un contenedor de fila fija.

**Cambio propuesto**
1. En `StatsBar.tsx`, mostrar la métrica total/principal en un layout responsivo (wrap o carrusel con
   indicador) que sea legible en 390px sin desplazamiento horizontal, conservando la densidad
   completa en desktop (regla DO_NOT_BREAK "Métricas desktop").

**Ficheros previstos**
- `src/components/shift-dashboard/StatsBar.tsx` — layout responsivo.
- `src/index.css` — reglas de breakpoint asociadas.

**DO_NOT_BREAK específico**
- Siete días y detalle completo
- Tabla alternativa accesible
- Contexto de empleado
- Métricas desktop

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 (parcial, compartido con `UXR-F3-M02` AC-1) — Given 390px, When se abre mes, Then la
      interfaz indica cómo alcanzar la información completa sin desplazamiento horizontal accidental.

**Evidencia requerida para cerrar**
- Capturas: 390×844, 430×932 × {claro, oscuro} de `StatsBar` con datos poblados.
- Automatizado: `npm test` (`StatsBar.test.tsx`), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Manual: lectura de métrica total en 390px sin scroll horizontal, cuenta sintética ADMIN.

**Estado**: `PENDING`

---

### UXR-F3-M02 · Indicación persistente de overflow y scroll nombrado por teclado en la tabla semanal

- **Finding origen**: CX-F02 (converge con histórico F6)
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F0-M08
- **Bloquea a**: UXR-F4-M05 (cierre de histórico F6)
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: ADMIN, PLANNER, EMPLOYEE

**Comportamiento actual (medido)**
> Calendario ~780px sobre teléfono; el planner deja horario fuera de viewport sin señal persistente
> de que hay más contenido. Tabla semanal aún desborda (histórico F6, E023). (Evidencia: E021, E023;
> código: `src/components/scheduling/AccessibleScheduleTable.tsx`.)

**Causa raíz UX**
> Densidad desktop mantenida; el contenedor de tabla no señaliza overflow ni asegura que el scroll
> interno esté nombrado para navegación por teclado.

**Cambio propuesto**
1. En `AccessibleScheduleTable.tsx`, mantener la tabla accesible-por-teclado existente (no
   sustituirla) y añadir una indicación visual persistente (no dependiente de hover) de que hay más
   columnas fuera de viewport.
2. Confirmar/asegurar que el contenedor de scroll interno tiene `aria-label`/`role` propio, de forma
   que el teclado alcance horario y acciones sin mover toda la página horizontalmente.

**Ficheros previstos**
- `src/components/scheduling/AccessibleScheduleTable.tsx` — indicador de overflow, nombrado ARIA del
  scroll interno.
- `src/index.css` — estilos del indicador.

**DO_NOT_BREAK específico**
- Siete días y detalle completo
- Tabla alternativa accesible
- Contexto de empleado
- Métricas desktop

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given 390px, When se abre mes, Then la interfaz indica cómo alcanzar los siete días.
- [ ] AC-2 — Given tabla semanal, When se navega por teclado, Then horario y acciones se alcanzan sin
      mover horizontalmente toda la página.

**Evidencia requerida para cerrar**
- Capturas: 390×844, 768×1024 × {claro, oscuro} de la tabla semanal con indicador de overflow visible.
- Automatizado: `npm test` (`AccessibleScheduleTable.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`, Axe sin violaciones nuevas.
- Manual: navegación completa por teclado de la tabla semanal en 390px y 768px, cuentas sintéticas
  PLANNER y EMPLOYEE.

**Estado**: `PENDING`

---

### UXR-F3-M03 · Conectar el acuse de turno al detalle activo del shell Employee

- **Finding origen**: CX-F06
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F0-M07 (cuentas sintéticas para el ciclo publicar→acuse)
- **Bloquea a**: UXR-F3-M04, UXR-F4-M08 (PUBLISH_COVERED/APPROVAL_COVERED)
- **Superficie / Entorno**: APPLICATION / UNKNOWN (sin evidencia de navegador — `MEASURED_CODE`)
- **Roles implicados**: EMPLOYEE

**Comportamiento actual (medido por código, sin evidencia de navegador)**
> `ShiftDetail` ofrece `acknowledgeRemoteShift`, pero solo lo utiliza `PortalShell`, sin importación
> productiva en `App.tsx`. El calendario activo abre `ShiftModal`. (Código:
> `src/App.tsx` — importa/monta `ShiftModal` en la línea 2121, sin import de `PortalShell` ni
> `ShiftDetail`; `PortalShell.tsx:108` monta `ShiftDetail`; `ShiftDetail.tsx:3,57` implementa
> `acknowledgeRemoteShift`.)

**Causa raíz UX**
> Migración al shell común dejó la capacidad de recepción fuera de la navegación alcanzable.

**Cambio propuesto**
1. Portar la llamada a `acknowledgeRemoteShift` (de `src/lib/remote`) al punto de montaje del detalle
   de turno activo (`ShiftModal`, montado desde `App.tsx:2121`), condicionada a que el turno
   pertenezca al EMPLOYEE visualizando su propio calendario (scope SELF) y esté publicado (no
   borrador).
2. No eliminar `ShiftDetail.tsx`/`PortalShell.tsx` — siguen siendo código válido, simplemente dejan
   de ser el único punto de acceso a esta acción (regla de alcance: no reinstaurar un segundo portal
   completo para recuperar una sola acción).

**Ficheros previstos**
- `src/App.tsx` — wiring de la acción en el punto de montaje del detalle activo.
- `src/components/shift-dashboard/ShiftModal.tsx` (o el componente exacto que `App.tsx:2121` monta,
  a confirmar el nombre de fichero en implementación) — UI de acuse.

**DO_NOT_BREAK específico**
- Scope SELF
- Publicado frente a borrador
- Solicitudes existentes
- No permitir editar planificación con acuse

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given Employee con turno publicado, When abre su detalle desde calendario, Then ve
      estado de recepción y acción autorizada.
- [ ] AC-3 — Given borrador no publicado, When Employee consulta, Then no se expone como turno
      operativo.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 y 390×844 × {claro, oscuro} del detalle de turno con acción de acuse visible.
- Automatizado: `npm test` (test del componente de detalle activo), `npx tsc --noEmit`,
  `npm run lint`, `npm run build`.
- Manual: publicar turno (Admin/Planner) → consultar y acusar (Employee) con cuentas sintéticas de
  `UXR-F0-M07`.

**Estado**: `PENDING`

---

### UXR-F3-M04 · Estado de fallo y reintento del acuse sin duplicar acción

- **Finding origen**: CX-F06
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F3-M03
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / UNKNOWN
- **Roles implicados**: EMPLOYEE

**Comportamiento actual (medido)**
> Ver `UXR-F3-M03` — sin punto de acceso productivo, el comportamiento de fallo/reintento de
> `acknowledgeRemoteShift` no ha sido ejercitado desde el shell activo.

**Causa raíz UX**
> Ver `UXR-F3-M03`.

**Cambio propuesto**
1. Al fallar `acknowledgeRemoteShift` (red, sesión expirada), conservar el turno intacto, mostrar el
   estado de fallo sin duplicar la acción (deshabilitar reintento concurrente), y permitir reintentar
   explícitamente.

**Ficheros previstos**
- Mismo componente que `UXR-F3-M03` — manejo de estado de error/reintento.

**DO_NOT_BREAK específico**
- Scope SELF
- Publicado frente a borrador
- Solicitudes existentes
- No permitir editar planificación con acuse

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-2 — Given fallo de acuse, When reintenta, Then conserva turno y muestra estado sin duplicar
      acción.

**Evidencia requerida para cerrar**
- Automatizado: `npm test` (caso de fallo simulado en el test del componente), `npx tsc --noEmit`,
  `npm run lint`, `npm run build`.
- Manual: simulación de fallo de red durante el acuse, reintento, cuenta sintética EMPLOYEE.

**Estado**: `PENDING`

---

### UXR-F3-M05 · Acción masiva explícita de provisioning dentro del workspace Equipo

- **Finding origen**: CX-F07
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F1-M04, UXR-F2-M05, UXR-F2-M06
- **Bloquea a**: UXR-F3-M06, UXR-F4-M10 (TEAM_IMPORT_COVERED)
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> Equipo nuevo expone Personas/Roles/Áreas/Asignaciones; el CSV aparece en Ajustes→Equipo→Abrir
> Usuarios — dos vocabularios y rutas de entrada distintas para el mismo dominio. (Evidencia: E006,
> E050, E051; código: `src/App.tsx`, `src/components/shift-dashboard/MembersModal.tsx`.)

**Causa raíz UX**
> Coexistencia de entradas con vocabulario y acciones diferentes para el mismo dominio.

**Cambio propuesto**
1. Añadir una acción masiva explícita y visible dentro del workspace "Equipo" (mismo
   componente/tab donde ya vive el alta individual), sin retirar la ruta existente vía Ajustes.

**Ficheros previstos**
- `src/App.tsx` — punto de entrada de navegación.
- `src/components/shift-dashboard/MembersModal.tsx` — acción visible en el tab correspondiente.

**DO_NOT_BREAK específico**
- Separación acceso/ficha
- Opciones de scope
- Preview de errores
- Credenciales de un solo uso

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given Admin en Equipo, When necesita importar CSV, Then descubre la acción sin pasar por
      configuración general.

**Evidencia requerida para cerrar**
- Capturas: 1440×900 × {claro, oscuro} del workspace Equipo con la acción masiva visible.
- Automatizado: `npm test` (`MembersModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: descubrimiento y uso de la acción masiva desde Equipo sin pasar por Ajustes, cuenta
  sintética ADMIN.

**Estado**: `PENDING`

---

### UXR-F3-M06 · Conservar contexto de personas al volver desde la preview de importación masiva

- **Finding origen**: CX-F07
- **Prioridad / Severidad**: P2 / MEDIUM
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM
- **Depende de**: UXR-F3-M05
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> Ver `UXR-F3-M05` — sin acción unificada, el contexto de retorno tras cancelar desde
> configuración general hoy no está garantizado.

**Causa raíz UX**
> Ver `UXR-F3-M05`.

**Cambio propuesto**
1. Al cancelar desde la preview de importación masiva iniciada desde "Equipo", volver conservando la
   pestaña/filtro/contexto de personas activo antes de entrar al flujo.

**Ficheros previstos**
- `src/components/shift-dashboard/MembersModal.tsx` — estado de navegación interna.

**DO_NOT_BREAK específico**
- Separación acceso/ficha
- Opciones de scope
- Preview de errores
- Credenciales de un solo uso

**Riesgos de regresión UX**
- Regresión de contexto, teclado o conservación del preview al adaptar layout/estado.
- Confundir una mejora de presentación con permiso para realizar nuevas operaciones.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-2 — Given vuelta desde preview, When cancela, Then conserva pestaña/filtro/contexto de
      personas.

**Evidencia requerida para cerrar**
- Automatizado: `npm test` (`MembersModal.test.tsx`), `npx tsc --noEmit`, `npm run lint`,
  `npm run build`.
- Manual: entrar a bulk desde un filtro/tab activo, cancelar, verificar contexto conservado, cuenta
  sintética ADMIN.

**Estado**: `PENDING`

---

## FASE 4 · Cierre de evidencia (no son findings; son huecos de cobertura)

Condición transversal: datos aislados, autorización específica de cada mutación, y comprobar que
**turnos manuales e imports ajenos sobreviven**.

### UXR-F4-M01 · Retest histórico F2 — gate Personal tardío al añadir segundo acceso

- **Finding/histórico origen**: F2 (`NOT_RETESTED`)
- **Prioridad / Severidad**: P1 (histórico) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M08
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION + LANDING_PAGE / LOCAL_BUILD
- **Roles implicados**: GUEST → Personal

**Comportamiento actual (medido)**
> Sólo cuenta Team disponible en la auditoría; pricing no retestea el gate. Código de gating
> presente, insuficiente para declarar `FIXED`.

**Causa raíz**
> Falta de cuenta sintética de plan Personal en el ciclo de auditoría anterior.

**Cambio propuesto**
1. Provisionar cuenta sintética de plan Personal.
2. Reproducir el flujo de "añadir segundo acceso" y verificar en qué punto aparece el gate (antes o
   después de completar el formulario largo).

**Ficheros previstos**
- Ninguno de producto — sólo datos sintéticos y evidencia.

**DO_NOT_BREAK específico**
- No cambiar precios comerciales sin decisión de producto.

**Riesgos de regresión UX**
- Formulario largo antes de límite comercial (riesgo histórico original, a confirmar si persiste).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cuenta Personal sintética, When intenta añadir un segundo acceso, Then el gate se
      declara `FIXED`, `PARTIALLY_FIXED` o `REGRESSED` con evidencia, nunca `NOT_RETESTED` de nuevo.

**Evidencia requerida para cerrar**
- Capturas: flujo completo de alta de segundo acceso con cuenta Personal.
- Manual: cuenta sintética Personal, sin datos reales.

**Estado**: `PENDING`

---

### UXR-F4-M02 · Retest histórico F9 — validación de nombre de empleado en onboarding

- **Finding/histórico origen**: F9 (`NOT_RETESTED`)
- **Prioridad / Severidad**: P4 (histórico) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M08
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: GUEST (sin organización)

**Comportamiento actual (medido)**
> No hay cuenta sin org para recorrer onboarding; el signup existente no es el mismo formulario que
> el histórico referenciaba.

**Causa raíz**
> Falta de cuenta sintética sin organización previa en el ciclo de auditoría anterior.

**Cambio propuesto**
1. Provisionar cuenta sintética completamente nueva (sin organización) y recorrer el onboarding real
   hasta el paso de nombre de empleado.
2. Verificar si la validación de nombre (histórica, confianza baja, "reconstruido") sigue presente,
   cambió o no aplica al formulario actual.

**Ficheros previstos**
- Ninguno de producto — sólo datos sintéticos y evidencia.

**DO_NOT_BREAK específico**
- Wizard de persona (cuenta opcional, ficha separada, resumen antes de alta).

**Riesgos de regresión UX**
- Condición de carrera de automatización histórica no descartada (riesgo histórico original).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cuenta sintética sin organización, When completa onboarding hasta el paso de
      nombre de empleado, Then el comportamiento de validación se declara explícitamente (FIXED,
      PARTIALLY_FIXED, REGRESSED o NOT_APPLICABLE si el formulario cambió estructuralmente), nunca
      `NOT_RETESTED` de nuevo.

**Evidencia requerida para cerrar**
- Capturas: flujo de onboarding completo hasta alta de empleado.
- Manual: cuenta sintética sin organización previa.

**Estado**: `PENDING`

---

### UXR-F4-M03 · Cerrar histórico F1 — persistencia postcommit

- **Finding/histórico origen**: F1 (`PARTIALLY_FIXED`, ahora asociado a CX-F04)
- **Prioridad / Severidad**: P1 (histórico) / N/A
- **Esfuerzo / Riesgo**: LOW / MEDIUM (mutación real de datos, sintética y aislada)
- **Depende de**: UXR-F2-M04, UXR-F0-M07
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN, EMPLOYEE

**Comportamiento actual (medido)**
> `E041,E046,E049`: diagnóstico y recuperación medidos; resultado postcommit (persistencia real tras
> confirmar) no ejecutado en la auditoría.

**Causa raíz**
> El servidor local bloquea escrituras operativas en el entorno de auditoría sin autorización
> específica de mutación — no se ejecutó una confirmación real con verificación posterior.

**Cambio propuesto**
1. Con datos sintéticos aislados y autorización explícita de mutación, ejecutar una importación
   completa hasta confirmar, y verificar que el resultado persiste (recarga, reconsulta) sin pérdida
   de filas ni de resultado.

**Ficheros previstos**
- Ninguno de producto — verificación de comportamiento existente.

**DO_NOT_BREAK específico**
- No perder filas/resultados cuando falla confirmación (riesgo histórico original).

**Riesgos de regresión UX**
- No perder filas/resultados cuando falla confirmación.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given una importación confirmada con datos sintéticos, When se recarga o reconsulta,
      Then el resultado persiste exactamente como se confirmó.

**Evidencia requerida para cerrar**
- Manual: confirmación real + recarga + reconsulta, con autorización explícita de mutación de datos
  sintéticos aislados.

**Estado**: `PENDING`

---

### UXR-F4-M04 · Cerrar histórico F5 — contrato documental README vs. AGENTS.md

- **Finding/histórico origen**: F5 (`PARTIALLY_FIXED`)
- **Prioridad / Severidad**: P2 (histórico) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: —
- **Bloquea a**: —
- **Superficie / Entorno**: N/A (documentación) / N/A
- **Roles implicados**: N/A

**Comportamiento actual (medido)**
> `AGENTS.md` ahora documenta tipos y OWNER/ADMIN/PLANNER/EMPLOYEE correctamente, pero el resumen
> B2C/local-first diverge del README B2B actual — contrato documental mixto (verificado:
> `AGENTS.md` describe "Producto Premium B2C" + "Persistencia local-first en `localStorage`" en su
> primera línea, mientras el modelo real ya es multi-tenant B2B con Organization/Membership/roles).

**Causa raíz**
> El README y el resumen inicial de `AGENTS.md` no se actualizaron al mismo ritmo que la evolución
> real del producto hacia multi-tenant B2B (Fase 1 en adelante).

**Cambio propuesto**
1. Esta microtarea es de **documentación**, no de código de producto — actualizar el resumen inicial
   de `AGENTS.md` y/o `README.md` para reflejar que el producto opera hoy en modo dual: local-first
   B2C para invitados/Personal, y multi-tenant B2B para organizaciones con Team, sin perder ninguna
   de las dos descripciones como falsa.
2. Nota: al no ser código de `src`/`api`/`db`, esta microtarea sí puede ejecutarse dentro del mismo
   tipo de agente que esta spec (edición de Markdown), pero queda en `PENDING` como el resto —
   ninguna microtarea se implementa desde este documento.

**Ficheros previstos**
- `AGENTS.md` (raíz del repo) — resumen inicial.
- `README.md` — si diverge, alineación de terminología.

**DO_NOT_BREAK específico**
- N/A (documentación, no comportamiento).

**Riesgos de regresión UX**
- Agentes derivan modelo obsoleto (riesgo histórico original — este es precisamente el riesgo que
  esta microtarea cierra).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given `AGENTS.md` y `README.md` actualizados, When un agente nuevo los lee, Then el
      modelo de producto que infiere (dual B2C local-first + B2B multi-tenant) coincide con el código
      real verificado en `01_TECHNICAL_DESIGN.md`.

**Evidencia requerida para cerrar**
- Manual: revisión cruzada de `AGENTS.md`/`README.md` contra el modelo de dominio real
  (`Organization`/`Membership`/roles) verificado en el código.

**Estado**: `PENDING`

---

### UXR-F4-M05 · Verificar cierre de histórico F6 (converge con CX-F02)

- **Finding/histórico origen**: F6 (`PARTIALLY_FIXED`)
- **Prioridad / Severidad**: P2 (histórico) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F3-M02
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: PLANNER, EMPLOYEE

**Comportamiento actual (medido)**
> `E022` editor modal visible; `E023` tabla aún desborda; `E014` métricas. No reducir el finding
> compuesto histórico a sólo calendario.

**Causa raíz**
> Ver `CX-F02` en `01_TECHNICAL_DESIGN.md`.

**Cambio propuesto**
1. Tras completar `UXR-F3-M01`/`UXR-F3-M02`, retestear específicamente los 3 componentes que el
   histórico F6 agrupaba (editor modal, tabla semanal, métricas) y declarar el estado de cada uno por
   separado (no un veredicto único agregado) para no volver a producir un `PARTIALLY_FIXED` opaco.

**Ficheros previstos**
- Ninguno de producto — sólo verificación.

**DO_NOT_BREAK específico**
- Scroll interno y teclado al adaptar tabla (riesgo histórico original).

**Riesgos de regresión UX**
- Scroll interno y teclado al adaptar tabla.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given editor modal, tabla semanal y métricas tras `UXR-F3-M01`/`M02`, When se retestean
      individualmente, Then cada uno se declara `FIXED` o se documenta explícitamente qué queda
      pendiente, sin agregarlos en un único veredicto.

**Evidencia requerida para cerrar**
- Capturas: los mismos viewports que `UXR-F3-M01`/`M02`, reetiquetadas contra el histórico F6.
- Manual: comparación directa contra `E022`/`E023`/`E014`.

**Estado**: `PENDING`

---

### UXR-F4-M06 · Verificar cierre de histórico F8 (converge con CX-F04)

- **Finding/histórico origen**: F8 (`PARTIALLY_FIXED`)
- **Prioridad / Severidad**: P3 (histórico, `OPPORTUNITY`) / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F2-M04
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD + PRODUCTION
- **Roles implicados**: EMPLOYEE, ADMIN

**Comportamiento actual (medido)**
> `E012` draft explícito; `E041/E064` resumen aún contradictorio; `E027` promesa. Distinción visible
> añadida, destino efectivo impreciso.

**Causa raíz**
> Ver `CX-F04` en `01_TECHNICAL_DESIGN.md` — mismo síntoma raíz.

**Cambio propuesto**
1. Tras `UXR-F2-M04`, retestear específicamente contra la evidencia histórica `E012`/`E041`/`E064`/
   `E027` y declarar si "hacer pasar importado por publicado" (riesgo histórico original) queda
   descartado con la nueva presentación del resumen efectivo.

**Ficheros previstos**
- Ninguno de producto — sólo verificación.

**DO_NOT_BREAK específico**
- Hacer pasar importado por publicado (riesgo histórico original — nunca).

**Riesgos de regresión UX**
- Hacer pasar importado por publicado.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el resumen efectivo de `UXR-F2-M04`, When se compara contra la promesa de
      "calendario listo" de la landing (`E027`), Then no hay contradicción entre lo prometido y lo
      que el import realmente deja como borrador vs. publicado.

**Evidencia requerida para cerrar**
- Capturas: landing (`E027` re-tomada) junto al resumen de import tras `UXR-F2-M04`.
- Manual: comparación directa.

**Estado**: `PENDING`

---

### UXR-F4-M07 · Ejecutar journeys con cuentas OWNER y PLANNER (cierre de flags de cobertura)

- **Finding/gap origen**: `evidence_coverage.OWNER_COVERED=false`, `PLANNER_COVERED=false`
- **Prioridad / Severidad**: P1 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / LOW
- **Depende de**: UXR-F0-M07
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: OWNER, PLANNER

**Comportamiento actual (medido)**
> Ver `UXR-F0-M07` — cuentas provisionadas pero journeys de auditoría aún no ejecutados con ellas.

**Causa raíz**
> Ver `UXR-F0-M07`.

**Cambio propuesto**
1. Ejecutar al menos un journey completo por rol (OWNER: gobernanza + transferencia de ownership sin
   ejecutarla realmente salvo en entorno aislado; PLANNER: planificación en cada uno de los 3 modos de
   scope disponibles) y capturar evidencia.

**Ficheros previstos**
- Ninguno de producto — sólo evidencia.

**DO_NOT_BREAK específico**
- Una sola OWNER por organización (`ADR-2026-09-07` D7).

**Riesgos de regresión UX**
- Ninguno directo (verificación).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given cuentas OWNER/PLANNER de `UXR-F0-M07`, When se ejecutan journeys representativos,
      Then `OWNER_COVERED` y `PLANNER_COVERED` pasan a `true` (o `PARTIAL` con motivo documentado, en
      ningún caso silenciosamente ignorados).

**Evidencia requerida para cerrar**
- Capturas: journeys OWNER y PLANNER, los 3 modos de scope de PLANNER si el tiempo lo permite.
- Manual: cuentas sintéticas de `UXR-F0-M07`.

**Estado**: `PENDING`

---

### UXR-F4-M08 · Cerrar PUBLISH_COVERED y APPROVAL_COVERED con el ciclo publicar→acuse→solicitud→resolución

- **Finding/gap origen**: `evidence_coverage.PUBLISH_COVERED=false`, `APPROVAL_COVERED=false`
- **Prioridad / Severidad**: P1 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM (mutación real, sintética y aislada)
- **Depende de**: UXR-F3-M03, UXR-F3-M04, UXR-F0-M07
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: OWNER/ADMIN/PLANNER (publicar, resolver), EMPLOYEE (acuse, solicitar)

**Comportamiento actual (medido)**
> `PUBLISH_COVERED` y `APPROVAL_COVERED` en `false` — sin ciclo completo ejercitado en la auditoría.

**Causa raíz**
> Publicación y resolución de solicitudes requieren mutación real de datos, no ejercitada en el ciclo
> de auditoría sin autorización explícita.

**Cambio propuesto**
1. Con datos sintéticos aislados y autorización explícita, ejecutar el ciclo completo:
   `publicar (Planner/Admin) → consultar (Employee) → acuse (Employee, tras UXR-F3-M03) →
   solicitar cambio (Employee) → resolver (Planner/Admin, respetando anti-autoaprobación
   `ADR-2026-09-07` D11)`.

**Ficheros previstos**
- Ninguno de producto — verificación de comportamiento existente + el nuevo wiring de `UXR-F3-M03`.

**DO_NOT_BREAK específico**
- Anti-autoaprobación (`ADR-2026-09-07` D11); "Solicitudes" nunca "Aprobaciones" (D10).

**Riesgos de regresión UX**
- Ninguno directo (verificación end-to-end).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el ciclo completo ejecutado, When se revisa cada paso, Then `PUBLISH_COVERED` y
      `APPROVAL_COVERED` pasan a `true` con evidencia por paso.

**Evidencia requerida para cerrar**
- Capturas: cada paso del ciclo (publicar, consultar, acuse, solicitar, resolver).
- Manual: cuentas sintéticas de `UXR-F0-M07`, autorización explícita de mutación.

**Estado**: `PENDING`

---

### UXR-F4-M09 · Cerrar SAFE_DELETE_COVERED e IDEMPOTENCY_COVERED

- **Finding/gap origen**: `evidence_coverage.SAFE_DELETE_COVERED=false`, `IDEMPOTENCY_COVERED=false`
- **Prioridad / Severidad**: P1 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / MEDIUM (mutación real, sintética y aislada)
- **Depende de**: UXR-F0-M07
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> Ambos flags en `false` — reimportación y borrado seguro no ejercitados en la auditoría.

**Causa raíz**
> Requieren mutación real repetida (reimportar el mismo documento dos veces; borrar un turno
> importado) no ejercitada sin autorización explícita.

**Cambio propuesto**
1. Reimportar el mismo documento sintético dos veces y verificar deduplicación (organization +
   employee + fingerprint, no sólo fecha, per `AGENTS.md` §Reglas para cambios).
2. Borrar un turno importado y verificar que **turnos manuales e imports ajenos sobreviven** (condición
   transversal de Fase 4).

**Ficheros previstos**
- Ninguno de producto — verificación.

**DO_NOT_BREAK específico**
- Conflicto de re-importación = organization + employee + fingerprint, nunca solo fecha.

**Riesgos de regresión UX**
- Pérdida de turnos manuales o de otros imports al borrar/reimportar.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el mismo documento reimportado dos veces, When se compara el resultado, Then no
      hay duplicados (idempotencia por fingerprint verificada).
- [ ] AC-2 — Given un borrado de turno importado, When se revisan turnos manuales y de otros imports
      en la misma organización, Then sobreviven intactos.

**Evidencia requerida para cerrar**
- Manual: reimportación doble + borrado, con verificación de supervivencia de datos ajenos, cuenta
  sintética ADMIN, datos aislados.

**Estado**: `PENDING`

---

### UXR-F4-M10 · Cerrar TEAM_IMPORT_COVERED

- **Finding/gap origen**: `evidence_coverage.TEAM_IMPORT_COVERED=false`
- **Prioridad / Severidad**: P1 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / LOW
- **Depende de**: UXR-F1-M04, UXR-F2-M05, UXR-F2-M06, UXR-F3-M05, UXR-F3-M06
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> `TEAM_IMPORT_COVERED=false` — sin ejecución completa de importación masiva de equipo tras las
> correcciones de CX-F05/CX-F07.

**Causa raíz**
> Bloqueado transitivamente por CX-E01 (fixture) y CX-F05 (clasificación) hasta que ambos se
> resuelven.

**Cambio propuesto**
1. Ejecutar la importación masiva completa de equipo (usuarios + empleados) con el fixture corregido
   y la clasificación corregida, desde la entrada unificada de `UXR-F3-M05`.

**Ficheros previstos**
- Ninguno de producto — verificación end-to-end de las microtareas ya implementadas.

**DO_NOT_BREAK específico**
- Aislamiento organización; credenciales de un solo uso.

**Riesgos de regresión UX**
- Ninguno directo (verificación end-to-end).

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given el fixture y la clasificación corregidos, When se ejecuta la importación masiva
      completa desde Equipo, Then `TEAM_IMPORT_COVERED` pasa a `true`.

**Evidencia requerida para cerrar**
- Capturas: flujo completo de importación masiva de equipo.
- Manual: cuenta sintética ADMIN, fixture corregido.

**Estado**: `PENDING`

---

### UXR-F4-M11 · Cerrar CREDENTIAL_EXPORT_COVERED

- **Finding/gap origen**: `evidence_coverage.CREDENTIAL_EXPORT_COVERED=false`
- **Prioridad / Severidad**: P2 / N/A
- **Esfuerzo / Riesgo**: LOW / LOW
- **Depende de**: UXR-F0-M07
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION / LOCAL_BUILD
- **Roles implicados**: ADMIN

**Comportamiento actual (medido)**
> `CREDENTIAL_EXPORT_COVERED=false` — sin verificación de exportación de credenciales de un solo uso
> tras provisioning.

**Causa raíz**
> No ejercitado en la auditoría anterior.

**Cambio propuesto**
1. Provisionar un usuario nuevo vía el flujo corregido (`UXR-F2-M05`/`M06`) y verificar que la
   credencial de un solo uso generada (si el flujo la genera) se exporta/muestra correctamente una
   sola vez, sin quedar accesible después.

**Ficheros previstos**
- Ninguno de producto — verificación.

**DO_NOT_BREAK específico**
- Credenciales de un solo uso (DO_NOT_BREAK de CX-F07).

**Riesgos de regresión UX**
- Exposición repetida o persistente de una credencial que debería ser de un solo uso.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given un usuario provisionado con credencial de un solo uso, When se revisita la
      pantalla tras cerrarla, Then la credencial ya no es recuperable en texto plano.

**Evidencia requerida para cerrar**
- Manual: provisioning + verificación de no-persistencia de la credencial, cuenta sintética ADMIN.

**Estado**: `PENDING`

---

### UXR-F4-M12 · Cerrar STAGING_BROWSER_COVERED y PREVIEW_BROWSER_COVERED

- **Finding/gap origen**: `evidence_coverage.STAGING_BROWSER_COVERED=false`,
  `PREVIEW_BROWSER_COVERED=false`
- **Prioridad / Severidad**: P2 / N/A
- **Esfuerzo / Riesgo**: MEDIUM / LOW
- **Depende de**: UXR-F0-M01, UXR-F0-M08
- **Bloquea a**: —
- **Superficie / Entorno**: APPLICATION + LANDING_PAGE / STAGING + PREVIEW (nuevo objetivo, ver
  §9 de `00_PRODUCT_SPEC.md`)
- **Roles implicados**: N/A (entorno, no rol)

**Comportamiento actual (medido)**
> Ambos flags en `false` — la auditoría cubrió `PRODUCTION`/`LOCAL_BUILD` únicamente
> (`PRODUCTION_BROWSER_COVERED: true`, `LOCAL_BUILD_BROWSER_COVERED: true`,
> `DEPLOYED_SURFACE_COVERED: true`, pero sin `STAGING`/`PREVIEW`).

**Causa raíz**
> Sin acceso o proceso documentado para navegar contra un despliegue `staging`/`preview` en el ciclo
> de auditoría anterior.

**Cambio propuesto**
1. Identificar si existe un entorno `staging`/`preview` accesible (rama `staging` del repo,
   despliegue de Vercel preview) sin desplegar nada nuevo (regla: sin despliegues).
2. Si existe, ejecutar al menos un journey de referencia contra él y documentar la comparación con
   `PRODUCTION`. Si no existe un entorno accesible sin desplegar, declarar `ENVIRONMENT_BLOCKED` con
   motivo explícito — nunca inventar cobertura.

**Ficheros previstos**
- Ninguno de producto — sólo evidencia/documentación.

**DO_NOT_BREAK específico**
- N/A (verificación de entorno).

**Riesgos de regresión UX**
- Ninguno directo.

**Criterios de aceptación (Given/When/Then)**
- [ ] AC-1 — Given un entorno staging/preview accesible sin nuevo despliegue, When se navega un
      journey de referencia, Then `STAGING_BROWSER_COVERED`/`PREVIEW_BROWSER_COVERED` pasan a `true`;
      si no es accesible, se declara `ENVIRONMENT_BLOCKED` con motivo explícito en vez de `false`
      silencioso.

**Evidencia requerida para cerrar**
- Capturas o declaración `ENVIRONMENT_BLOCKED` documentada.
- Manual: intento de acceso a staging/preview sin desplegar nada nuevo.

**Estado**: `PENDING`

---

## Trazabilidad DO_NOT_BREAK (las 8 entradas de la sección 38, cada una en al menos una fase)

| Entrada DO_NOT_BREAK | Aparece en criterios de no regresión de |
|---|---|
| Preview antes de escritura | `UXR-F2-M01`, `UXR-F2-M02` (CX-F01) |
| Recuperación de código desconocido | Gate `UXR-F2-HIGH-IMPACT-GATE.md` §3.2 (transversal a import) |
| Identidad y permisos visibles | `UXR-F2-M01` (identidad/período autoritativos), `UXR-F3-M05`/`M06` (separación acceso/ficha) |
| Borrador explícito | `UXR-F2-M03`, `UXR-F2-M04` (CX-F04), `UXR-F4-M03`/`M06` |
| Wizard de persona | `UXR-F4-M02` (retest F9, onboarding) |
| Modal manual accesible al cerrar | `UXR-F2-M01`/`M02` (focus y cierre seguro), gate §3.2 transversal |
| Bulk con errores por fila | `UXR-F2-M05`, `UXR-F2-M06` (CX-F05, motivos por fila) |
| Landing móvil y temas | `UXR-F0-M08` (matriz base), `UXR-F1-M03` (CX-F09) |
