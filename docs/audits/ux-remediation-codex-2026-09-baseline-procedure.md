# UX Remediation Codex 2026-09 — Fase 0 baseline procedure

Fuente: `sdd/features/ux-remediation-codex-2026-09/03_IMPLEMENTATION_PLAN.md` (UXR-F0-M01…M06).
Cierra 5 de los 6 `TOOL_COMPATIBILITY_GAPS` de
`docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.json` (el sexto, rutas internas de
App, vive en el documento separado `ux-remediation-codex-2026-09-internal-routes-inventory.md` —
UXR-F0-M03).

No corrige ningún finding de producto. Fase de harness únicamente.

---

## UXR-F0-M01 — Procedimiento reproducible de baseline visual

**Herramienta canónica declarada**: `@playwright/test` 1.62.1 + Chromium (la que ya trae
`qa/e2e-acceptance/package.json`), no `agent-browser`. Ambas herramientas no son comparables entre
sí (ven scrollbars distinto — ver M05); esta spec fija `@playwright/test` como referencia
versionable y reproducible por comando.

**Comando exacto**:
```bash
cd qa/e2e-acceptance
UXR_BASELINE_HEAD=$(git -C ../.. rev-parse HEAD) \
  npx playwright test --config playwright.uxr-f0-baseline.config.ts
```
- Config: `qa/e2e-acceptance/playwright.uxr-f0-baseline.config.ts`.
- Spec: `qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts`.
- Servidor: `npm run dev -- --port 5199 --strictPort` (plain `vite dev`, **sin** `vercel dev` ni
  Neon — modo invitado/local-first únicamente; ver §Alcance más abajo).
- Salida: 48 PNG + `qa/e2e-acceptance/artifacts/ux-remediation-baseline/manifest.json` (sha256,
  viewport, tema, locale, herramienta, HEAD, fecha por captura). Ruta ignorada por git
  (`.gitignore`); sólo el manifiesto y esta documentación quedan versionados vía las tablas del
  gate.

**Estado de datos requerido**: ninguno persistente — modo invitado puro, `localStorage` sembrado
por `context.addInitScript` en cada test (onboarding ya completado, cookie-consent aceptado, tema y
locale fijados). No depende de Neon ni de seeds de servidor.

**Mitigaciones de no-determinismo aplicadas** (todas en el spec):
| Fuente | Mitigación | Dónde |
|---|---|---|
| Fecha/hora actual | `Date`/`Date.now()` sobrescritos a `2026-09-15T10:00:00Z` vía `context.addInitScript`, antes de que cargue el bundle de la app | `seedGuestContext()` |
| Zona horaria | `timezoneId: 'Europe/Madrid'` fijo | `playwright.uxr-f0-baseline.config.ts` |
| Animaciones/transiciones | `reducedMotion: 'reduce'` (config) + hoja de estilo inyectada forzando `animation-duration/transition-duration: 0s` tras cada navegación | `disableMotionAndWaitFonts()` |
| Carga de fuentes | `await page.evaluate(() => document.fonts.ready)` antes de cada captura | `disableMotionAndWaitFonts()` |
| Datos de seed variables | Modo invitado local-first (sin Neon, sin ids autoincrementales de servidor) | todo el spec |
| Scrollbars | No se ocultan — es Chromium real vía `@playwright/test`, no `agent-browser`; no existe flag que las oculte en esta herramienta (ver M05) | N/A |
| `Math.random`/ids generados | No se revisaron aparte — ninguna de las 3 pantallas capturadas (calendario/precio/preview) renderiza un id generado en el texto visible; el propio resultado del diff (ver AC-1 más abajo) es la evidencia de que no hay ruido oculto de esta fuente | — |
| Contenido asíncrono | Se espera un selector estable (`[data-testid="app-shell"]`, `.month-grid-cells`, o el conteo exacto de filas del preview) antes de capturar, nunca `networkidle` a secas | todo el spec |

**Descubrimiento durante la implementación (no documentado en la spec original)**: `vite dev` sin
backend real detrás de su proxy `/api` no basta para entrar en modo invitado. `src/lib/session.ts
fetchSession()` sólo interpreta un **401 explícito** de `/api/session/me` como "invitado"; un fallo
de conexión del proxy (`ECONNREFUSED` → 5xx) se trata como "desconocido" y `src/App.tsx` redirige a
`/login` en vez de arriesgar exponer borradores locales (comportamiento deliberado, comentado en el
propio código). El spec resuelve esto interceptando esa ruta con `context.route(...)` y devolviendo
un 401 sintético — no requiere levantar `proxy-server.mjs` ni ningún backend.

### AC-1 — determinismo (dos ejecuciones consecutivas, mismo HEAD)

**Resultado: CUMPLIDO con tolerancia declarada, con una pantalla declarada inestable.**

La primera pasada dio 70.8% de sha256 idénticos y dejó la causa sin aislar. La investigación
posterior la aisló, y la conclusión cambia el criterio de verificación, no sólo el número.

**Qué se midió, en orden:**

1. **DOM idéntico.** Dos procesos independientes producen el mismo `outerHTML` del `app-shell`
   (33 246 caracteres, byte a byte). No hay diferencia de contenido ni de estado.
2. **Orden de hojas de estilo idéntico.** Tres procesos: mismas 3 `<style>`, mismas longitudes
   (9 582 / 13 915 / 149 618). Descartada la hipótesis de inyección de CSS variable de `vite dev`.
3. **Dentro de un mismo lanzamiento de navegador, las capturas son idénticas al byte** (4/4).
4. **Entre procesos distintos, no.** El diff de píxeles muestra dos fenómenos **distintos**:
   - *Jitter de antialiasing*: 13-107 píxeles de 329 160 (0.004-0.033%), `maxDelta` 4-10 sobre 765,
     dispersos por los bordes de las glifos. Sub-perceptible.
   - *Inestabilidad de layout sub-píxel*: residuos que son **una línea horizontal de 1 píxel de alto**
     (medido: y=422, x=680..1352, `maxDelta` 43) — separadores de la tabla de preview sobre una
     frontera fraccionaria que redondea a una fila u otra según el proceso.

**Flags de rasterización**: `--force-color-profile=srgb`, `--font-render-hinting=none`,
`--disable-lcd-text`, `--disable-gpu`, `--disable-skia-runtime-opts` reducen la varianza pero **no la
eliminan**. Una medición inicial de 3 muestras sugirió que sí; ampliada la muestra, no se sostuvo.
Se conservan por higiene, con el comentario del config corregido para no afirmar lo que no hacen.

**Consecuencia sobre el criterio**: la igualdad de sha256 no es un criterio alcanzable en este stack
y por tanto no es el criterio de aceptación. AC-1 se verifica con **tolerancia declarada** mediante
`qa/e2e-acceptance/compare-baseline-runs.mjs`:

```bash
cd qa/e2e-acceptance
UXR_BASELINE_RUN_ID=run1 npx playwright test --config playwright.uxr-f0-baseline.config.ts
UXR_BASELINE_RUN_ID=run2 npx playwright test --config playwright.uxr-f0-baseline.config.ts
node compare-baseline-runs.mjs run1 run2
```

Tolerancia: `diffPx ≤ max(200, 0.05% de la imagen)` **y** `maxDelta ≤ 32` de 765. Está calibrada para
absorber jitter de glifos y nada más: una regresión real (una fila que desaparece, un panel que
colapsa, un color que cambia) mueve miles de píxeles con deltas grandes y sigue detectándose.
Cada corrida escribe en su propio directorio (`artifacts/ux-remediation-baseline/<runId>/`) para que
ambas sobrevivan a la comparación.

**Resultado sobre dos pares independientes de corridas** (HEAD `43e5c31`):

| Par | byte-idénticas | dentro de tolerancia | declaradas inestables | UNSTABLE |
|---|---|---|---|---|
| run1 vs run2 | 36 | 11 | 1 | **0** |
| run3 vs run4 | 38 | 7 | 3 | **0** |

**Pantalla declarada inestable: `import-preview`.** Se declara a nivel de *pantalla*, no de captura.
El primer intento la declaró por id y fue un error: entre los dos pares la misma firma (673 px,
`maxDelta` 43) se movió de `es-dark-1440x900` a `en-dark-1440x900`, y apareció una tercera celda
(`en-dark-390x844`, 1009 px). Fijar ids habría escondido una propiedad sistémica tras una lista
móvil.

Su causa es la distribución de alturas fijas que **CX-F01 describe literalmente**, así que pertenece
a `UXR-F2-M01`/`M02` (ImportModal + `index.css`). No es corregible en Fase 0: exigiría tocar `src/`.

**Consecuencia operativa para las fases siguientes**: `calendar` y `pricing` (40 de 48 capturas) son
una baseline fiable para comparación de regresión. `import-preview` (8 capturas) **no lo es** hasta
que Fase 2 rehaga ese layout. Quien use evidencia visual de esa pantalla antes de Fase 2 debe repetir
la captura in situ y declararlo.

### AC-2 — suficiencia para fases posteriores

Cumplido: el comando de arriba, ejecutado tal cual, regenera las 48 capturas + manifiesto sin pasos
manuales adicionales. Fase 1-4 pueden extender `VIEWPORTS`/`REDUCED_VIEWPORTS`/las tres funciones de
captura del mismo spec para nuevas pantallas, reutilizando `seedGuestContext` y
`disableMotionAndWaitFonts`.

---

## UXR-F0-M02 — Catálogo i18n para `i18n-integrity-check`

**Catálogo real**: `src/lib/i18n.ts` (3214 líneas, TypeScript). `export type Locale = 'es' | 'en'`,
`DEFAULT_LOCALE = 'es'`, persistencia en `localStorage` (`anclora_shiftimport_locale_v1`).

**Cobertura material ya existente**: `src/lib/i18n-coverage.test.ts` (177 líneas) — recorre un
inventario explícito de claves realmente usadas por los componentes (`T_KEYS`) y falla si alguna
clave resuelve a la **misma** cadena en ES y EN (salvo excepciones documentadas explícitamente,
p. ej. la línea de marca). Se ejecuta como parte de `npm test` (Vitest), no como suite aparte.

**Resolución declarada**: la herramienta externa `i18n-integrity-check` (la de la auditoría Codex,
no forma parte de este repo) no reconoce TS como formato de catálogo. Siguiendo la instrucción
explícita del prompt maestro de Fase 0 (§2.6: "enseñarle a la herramienta dónde mirar... no migrar
el catálogo a JSON"), la resolución es: **declarar `src/lib/i18n-coverage.test.ts` como la cobertura
material vigente para ES/EN**, y apuntar cualquier configuración futura de `i18n-integrity-check` a
`src/lib/i18n.ts` como fuente + `src/lib/i18n-coverage.test.ts` como prueba de cobertura, en vez de
migrar el catálogo de formato.

**AC-1**: `NOT_EVALUATED` — la herramienta externa `i18n-integrity-check` no está disponible en este
entorno (no es parte del repo ni de sus dependencias; instalarla sería añadir una dependencia nueva
sin razón de producto, prohibido por `AGENTS.md`). Evidencia sustitutoria aportada: ejecución de
`src/lib/i18n-coverage.test.ts` dentro de `npm test` — **PASS** (ver salida completa en el gate,
sección Calidad automatizada). Queda documentado que cuando la herramienta externa esté disponible,
debe configurarse contra estos dos ficheros; no se puede marcar `PASS` de la herramienta externa
misma sin acceso a ella.

---

## UXR-F0-M04 — `design-system-consumer-check` → `NOT_APPLICABLE`

Verificado contra `package.json` (raíz): `dependencies` = `@neondatabase/serverless`, `axios`,
`cors`, `dotenv`, `exceljs`, `express`, `jspdf`, `jspdf-autotable`, `lucide-react`, `multer`,
`pdfjs-dist`, `react`, `react-dom`, `tesseract.js`. `devDependencies` sin ningún paquete
`anclora-design-system` ni equivalente. El repo consume tokens de marca vía `docs/standards/
ANCLORA_BRANDING_*` y CSS propio (`src/index.css`), no vía paquete de design system compartido.

**AC-1**: `NOT_APPLICABLE` (explícito, con evidencia de `package.json` arriba) — no se añade una
dependencia nueva sólo para satisfacer el checker (regla de `AGENTS.md`: "Evitar dependencias
nuevas sin razón clara").

---

## UXR-F0-M05 — `hide-scrollbars=false` obligatorio

El gap original es específico de `agent-browser` (la herramienta con la que se midió la auditoría
Codex), que oculta las barras de scroll por defecto. La herramienta canónica de este harness
(`@playwright/test` sobre Chromium real, M01) **no tiene ese comportamiento**: no existe flag que
oculte las barras — el screenshot captura el renderizado real de Chromium.

**AC-1**: cumplido por diseño de herramienta, no por configuración explícita — declarado aquí para
que cualquier medición futura con `agent-browser` (si se usa en paralelo) recuerde fijar
`hide-scrollbars=false` explícitamente, y para que la matriz de `04_ACCEPTANCE_TEST_PLAN.md` quede
consistente con lo que M08 realmente usó.

---

## UXR-F0-M06 — Rutas absolutas de subida en escenarios

El gap original es de la herramienta de la auditoría (rutas relativas no resueltas). El harness de
este repo ya resuelve rutas de fixture con `join(__dirname, ...)`/`resolve(__dirname, ...)` en tiempo
de ejecución de Node (absolutas de facto en el momento de `setInputFiles`), como en
`qa/e2e-acceptance/specs-local/unknown-color-resolution.spec.ts:4` y en el nuevo
`qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts` (fixture
`test-data/fixtures/manual-qa-state-contract/01_READY_structured.csv`, verificado existente).

**AC-1**: cumplido — evidencia: la ejecución end-to-end de `import-preview` en M08/M01 (48/48 tests
pasan, incluidas las 8 celdas de `import-preview`) sube el fixture `01_READY_structured.csv` con
ruta resuelta por `join(__dirname, '..', '..', '..', 'test-data', ...)` sin error de fichero no
encontrado, para las 5 filas esperadas (`test-data/scenarios/anclora-group-shift-ingestion/
01_empleados_45.csv`, el fixture del propio CX-E01, también verificado existente para uso en
Fase 1-2).
