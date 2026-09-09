# PROMPT MAESTRO — Ejecución de FASE 0 · Línea base y harness
## `UXR-F0-M01` … `UXR-F0-M08` · Gate: `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md`

> **Uso**: entregar íntegramente este documento como prompt inicial a un agente IA con acceso de
> lectura/escritura al repositorio `anclora-shiftimport`, rama `development`.
>
> **Diferencia con el prompt anterior**: aquel producía la spec. **Este ejecuta la Fase 0.**

---

## 0 · ROL Y MISIÓN

Eres un **ingeniero de QA/tooling**. Tu misión es **dejar el harness de auditoría en un estado en el
que las Fases 1–4 puedan producir evidencia creíble**, y cerrar el gate
`UXR-F0-BASELINE-HARNESS-GATE.md` con evidencia real.

**Fase 0 no corrige ningún finding de producto.** Si durante la ejecución detectas un defecto de
producto, lo **documentas** y lo dejas para su fase; **no lo arreglas aquí**.

### Qué puedes tocar
✅ `qa/e2e-acceptance/**` (harness Playwright aislado), `docs/audits/**`, `docs/roadmap/UXR-F0-*`,
`sdd/features/ux-remediation-codex-2026-09/**` (actualizar estados y rellenar decisiones abiertas),
`.gitignore` (sólo para añadir rutas de evidencia regenerable).

### Qué NO puedes tocar
❌ `src/`, `api/`, `db/migrations/`, `vercel.json`, `package.json` raíz, `index.html`.
❌ Producción, secretos, `git push`, despliegues, `sudo`, `kill`/`pkill`.

### Punto de partida
Árbol limpio sobre `43e5c31` (`docs(sdd): add UX remediation spec…`). El commit inmediatamente
anterior, `0cc66ff fix(header): eliminate late auth CTA pop and stabilize slot from first render`,
tocó `src/App.tsx`, `src/components/PublicHeader.tsx`, `PublicHeader.test.tsx` y `src/index.css`.
Es trabajo de producto ajeno a Fase 0: **no lo revises, no lo revierta, no lo tomes como baseline de
comportamiento sin verificar antes que la suite pasa sobre él** (ver §6.2).

---

## 1 · ENTRADAS OBLIGATORIAS

| # | Ruta | Uso |
|---|------|-----|
| 1 | `/Users/toni/AGENTS.md`, `/Users/toni/Developer/anclora/AGENTS.md`, `AGENTS.md` (raíz) | Permisos y prohibiciones |
| 2 | `sdd/features/ux-remediation-codex-2026-09/03_IMPLEMENTATION_PLAN.md` **líneas 14–388** | Las 8 microtareas literales de Fase 0 |
| 3 | `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md` | Los AC exactos que debes satisfacer |
| 4 | `sdd/features/ux-remediation-codex-2026-09/04_ACCEPTANCE_TEST_PLAN.md` | Matriz de validación a instanciar |
| 5 | `docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.json` → `evidence_coverage` | Los 6 `TOOL_COMPATIBILITY_GAPS` y los flags en `false` |
| 6 | `qa/e2e-acceptance/` completo | **El harness ya existe. Constrúyelo encima, no lo reinventes.** |

---

## 2 · ESTADO REAL DEL REPO — CORRECCIONES A LA SPEC

⚠️ **Leer con atención.** La spec de Fase 0 fue escrita antes de inspeccionar el harness y deja
rutas como *«candidato»* o *«a definir en implementación»*. Estas son las respuestas reales. Donde
esta sección contradiga al `03_IMPLEMENTATION_PLAN.md`, **manda esta sección**, y actualizas la spec
para reflejarlo (registrando el cambio en `05_PROGRESS_LOG.md`).

### 2.1 El harness Playwright ya existe
`qa/e2e-acceptance/` es un **paquete npm independiente** (`anclora-shiftimport-e2e-acceptance`,
`private: true`, con su propio `node_modules`), declarado como *"test tooling only, not app code"*.
Contiene:
- `@playwright/test ^1.62.1` y `@axe-core/playwright ^4.13.0` — **ya instalados**.
- 14 configs de gate (`playwright.p0-gate.config.ts` … `playwright.r3-gate.config.ts`).
- `responsive.local.config.ts` + `specs-responsive/responsive-landscape.spec.ts` — **el patrón más
  cercano a lo que necesitas**: guest mode local-first contra `vite dev` en el puerto 5199,
  `reuseExistingServer`, `cwd: '../..'`, sin Neon ni vercel dev.
- `local-setup.ts` / `local-teardown.ts` — seeding contra la rama dev de Neon.
- `helpers/` (`env.ts`, `flow.ts`, `artifacts.ts`, `expected.ts`, …).
- `TEST-MATRIX.md` — matriz existente, centrada en **ingesta de documentos**, no en UX/viewports.

**Consecuencia**: no añadas dependencias nuevas ni al `package.json` raíz ni al del harness. Toda la
Fase 0 se construye con lo que ya hay.

### 2.2 Distinción de herramientas — obligatoria y explícita
`CLAUDE.md` del workspace lo exige y aquí es material: la auditoría Codex se midió con
**`agent-browser`** (que oculta scrollbars por defecto — origen del gap 4), mientras que el repo
automatiza con **`@playwright/test`** sobre Chromium. **No son la misma herramienta y no producen la
misma captura.**

En todo artefacto que generes debes declarar, por cada medición:
`tool` ∈ {`@playwright/test`, `agent-browser`, `playwright-cli`, `MCP browser`, `manual`},
`browser`, `versión`, `viewport`, `deviceScaleFactor`, `tema`, `locale`, `entorno`
(`LOCAL_BUILD` / `PRODUCTION`), `HEAD`.

Una baseline generada con una herramienta **no es comparable** con una generada con otra. Elige
`@playwright/test` como herramienta canónica de la baseline (es la del repo, versionable y
reproducible) y decláralo.

### 2.3 `UXR-F0-M04` es resoluble ahora: `NOT_APPLICABLE`
He verificado `package.json`: **no existe dependencia de `anclora-design-system`** ni de ningún
paquete de design system. Las `dependencies` son Neon, axios, cors, dotenv, exceljs, express, jspdf,
jspdf-autotable, lucide-react, multer, pdfjs-dist, react, react-dom, tesseract.js.

→ El resultado correcto es **`NOT_APPLICABLE` documentado con esta evidencia**, no `PASS`, no
`UNKNOWN`. El repo consume tokens de marca vía `docs/standards/ANCLORA_BRANDING_*` y CSS propio, no
vía paquete. **No añadas una dependencia para satisfacer al checker** (regla de AGENTS.md: evitar
dependencias nuevas sin razón clara). Cierra M04 con esa justificación y su AC-1 marcado.

### 2.4 `UXR-F0-M07` está mayormente hecho — rescópalo
`qa/e2e-acceptance/local-setup.ts` **ya siembra** OWNER y PLANNER:

| Cuenta | Rol | Scope |
|---|---|---|
| `owner@e2e.test` | OWNER | Org A |
| `owner-b@e2e.test` | OWNER | Org B |
| `planner@e2e.test` | PLANNER | Org A, `scoped_area_id = areaA` |
| `planner-no-area@e2e.test` | PLANNER | Org A, **sin área** (cubre `PD-2026-09-06-D05`) |
| `planner-global@e2e.test` | PLANNER | Org Fresh |
| `planner-b@e2e.test` | PLANNER | Org B, `scoped_area_id = areaB` |
| `admin@e2e.test`, `employee*@e2e.test` | ADMIN / EMPLOYEE | varios |

Password compartida en `local-setup.ts` (`PASSWORD`). Orgs: A (`team`), B (`company`),
Fresh (`personal`).

→ **El gap real no es la existencia de cuentas: es que la auditoría nunca las recorrió con navegador**
(`OWNER_COVERED=false`, `PLANNER_COVERED=false`). Rescope de M07 a:
1. **Verificar** que el seed corre y produce esas memberships (invariante: 1 sola OWNER por org,
   `ADR-2026-09-07` D7).
2. **Poblar** historial de turnos y ≥1 `FormatProfile` aprendido para que no arranquen vacías —
   usa `db/seed-dev.mjs` (`npm run seed:dev -- --organization-id <id>`), que es idempotente, siembra
   40 empleados **sólo como Employees** (nunca Users/memberships/sesiones) y tiene guarda
   `assertNonProduction()`.
3. **Documentar** las credenciales sintéticas y el procedimiento de login en el artefacto de Fase 0
   (son cuentas de prueba de un branch dev; aun así **no las pongas en un fichero que se publique
   fuera del repo**).
4. Dejar constancia de que **la ejecución de journeys con esos roles es Fase 3/4**, no Fase 0.

### 2.5 La evidencia visual NO se commitea
`.gitignore` ya excluye `qa/1.2b-visual/`, `evidence/`, `docs/manual/screenshots/`,
`qa/e2e-acceptance/test-results*/`.

→ Las 32 capturas de `UXR-F0-M08` van a una ruta **ignorada**. Lo que se versiona es un
**manifiesto** (JSON/MD) con: id de captura, viewport, tema, locale, ruta, `sha256`, HEAD, herramienta
y fecha. Añade la ruta nueva al `.gitignore` siguiendo el patrón y el comentario existente
(*"evidence kept on disk, never committed"*).

### 2.6 i18n: el catálogo es `src/lib/i18n.ts`
3.214 líneas, TypeScript, con `Locale = 'es' | 'en'`, `DEFAULT_LOCALE`, persistencia en
`localStorage` (`anclora_shiftimport_locale_v1`) y política de inicio de semana por locale.
Además **ya existe `src/lib/i18n-coverage.test.ts`**, que verifica que cada clave usada resuelve a
cadenas distintas en ES y EN.

→ El gap de M02 es **de la herramienta externa**, no del repo. La solución correcta es enseñarle a la
herramienta dónde mirar (o declarar el `i18n-coverage.test.ts` como la cobertura material vigente),
**no** migrar el catálogo a JSON. `AGENTS.md` y `docs/standards/LOCALIZATION_CONTRACT.md` mandan
sobre el formato.

### 2.7 `UXR-F0-M03`: el inventario de rutas
`TEST-MATRIX.md` existe pero cubre ingesta de documentos (casos GS-01…GS-10, GN-01…GN-07), no
superficies UX. Crea un **documento nuevo y separado** para el inventario de superficies internas —
no contamines la matriz de ingesta. Rutas URL reales: sólo `/app` y `/app/schedule`; el resto es
navegación por estado en `src/App.tsx`.

---

## 3 · LAS 8 MICROTAREAS — ORDEN DE EJECUCIÓN

Ejecuta en este orden; respeta las dependencias declaradas en la spec.

```
Ola A (sin dependencias, paralelizables)
  UXR-F0-M02  locales detectables            P2
  UXR-F0-M03  inventario de rutas internas   P2
  UXR-F0-M04  DS consumer → NOT_APPLICABLE   P3   ← resoluble de inmediato (§2.3)
  UXR-F0-M05  hide-scrollbars=false          P1
  UXR-F0-M06  rutas absolutas de subida      P2
  UXR-F0-M07  verificar/poblar OWNER+PLANNER P1   ← rescopado (§2.4)

Ola B (depende de A)
  UXR-F0-M01  baseline reproducible          P1   ← bloquea M08 y toda evidencia posterior

Ola C (depende de M01 + M05)
  UXR-F0-M08  congelar 32 capturas           P1
```

**Empieza por M04 y M05**: son los dos cierres más baratos y desbloquean confianza en la medición.

---

## 4 · EL PUNTO DIFÍCIL: `UXR-F0-M01` y el determinismo

El AC-1 de M01 exige **dos ejecuciones consecutivas con 0 diferencias de píxel**. En esta aplicación
eso **no se cumple por defecto**. Antes de declarar la baseline, neutraliza al menos:

| Fuente de no determinismo | Mitigación esperada |
|---|---|
| Fecha/hora actual (calendario resalta «hoy», cabeceras de mes, cálculo histórico/futuro) | Congelar reloj y zona horaria (`timezoneId` + reloj fijo de Playwright); documentar la fecha congelada |
| `Math.random` / ids generados | Semilla fija o enmascarado de la región |
| Animaciones y transiciones (`docs/standards/UI_MOTION_CONTRACT.md`) | Deshabilitar animaciones en el contexto de captura |
| Carga de fuentes web | Esperar a `document.fonts.ready` antes de capturar |
| Datos de seed variables (ids autoincrementales de Neon) | Capturar en modo guest local-first donde sea posible, como hace `responsive.local.config.ts` |
| Scrollbars | `hide-scrollbars=false` — **nunca ocultas** (M05) |
| Contenido asíncrono (turnos, métricas) | Esperar a estado estable explícito, no a `networkidle` a secas |

**Si tras estas mitigaciones el diff sigue sin ser 0**, no falsees el AC. Documenta el umbral real
alcanzado (p. ej. «0 diffs en 30/32; 2 capturas con ±N px en la región X por causa Y»), márcalo como
`PASS_WITH_GAPS` y explica la causa. **Un AC no cumplido y declarado vale más que un AC marcado en
falso.**

---

## 5 · MATRIZ DE `UXR-F0-M08` — 32 CAPTURAS

8 viewports × 2 temas × 2 locales:

| | 390×844 | 430×932 | 768×1024 | 1024×768 | 1366×768 | 1440×900 | 1728×1117 | 844×390 |
|---|---|---|---|---|---|---|---|---|
| **claro · ES** | | | | | | | | |
| **claro · EN** | | | | | | | | |
| **oscuro · ES** | | | | | | | | |
| **oscuro · EN** | | | | | | | | |

**Qué se captura en cada celda**: como mínimo las pantallas que las Fases 1–3 van a tocar —
importador con preview de ≥5 filas (CX-F01/F03/F04), calendario y métricas (CX-F02), planner semanal
(CX-F02), Equipo y bulk (CX-F05/F07), pricing (CX-F09). Si una pantalla exige rol autenticado y no
lo tienes disponible en local, **declara la celda `NOT_EVALUATED` con motivo**; no la inventes ni la
sustituyas por otra pantalla.

**Convención de nombre**: sigue el patrón ya existente en `qa/1.2b-visual/`
(`<pantalla>-<locale>-<tema>-<viewport>.png`, p. ej. `import-preview-es-dark-390x844.png`).

---

## 6 · GATE — CÓMO CERRARLO HONESTAMENTE

Al terminar, actualiza `docs/roadmap/UXR-F0-BASELINE-HARNESS-GATE.md`:

1. **§3.1** — marca cada AC sólo con evidencia adjunta. Un AC sin artefacto se queda sin marcar.
2. **§3.3 Calidad automatizada** — ejecuta y pega salida real:
   ```bash
   npm test && npx tsc --noEmit && npm run lint && npm run build
   ```
   ⚠️ **Ejecuta estos cuatro comandos ANTES de empezar a trabajar**, sobre el árbol limpio, y guarda
   la salida. Ése es tu punto de partida real: el commit `0cc66ff` tocó código de producto (§0) y no
   consta que la suite se haya ejecutado después. Si algo ya falla de entrada, **no es tuyo**:
   decláralo como estado heredado, no lo arregles (sería tocar `src/`), y compáralo contra la
   ejecución final para aislar tu efecto. Registra ambas salidas tal cual salgan.
3. **§4 Evidencia adjunta** — rellena la tabla: artefacto, ruta, herramienta que lo generó, fecha.
4. **§5 Gate Status** — `PASS` sólo si las 8 microtareas tienen AC cumplidos con evidencia.
   Con cualquier hueco: **`PASS_WITH_GAPS`**, listando qué quedó `NOT_EVALUATED` y por qué.
   Nunca `PASS` con evidencia parcial.
5. Actualiza `05_PROGRESS_LOG.md` (una fila por microtarea: `PENDING` → `DONE` / `PARTIAL` /
   `NOT_APPLICABLE`) y refleja en `03_IMPLEMENTATION_PLAN.md` las decisiones que cerraste
   (las rutas «candidato» pasan a ser rutas reales).

---

## 7 · REGLAS DE INTEGRIDAD

- **`COMPLETED ≠ cobertura material.`** Que una herramienta termine sin error no significa que haya
  medido nada. Es la regla `composed_skill_coverage_rules` de la skill y la causa de 4 de los 6 gaps.
- **`PARTIAL` y `NOT_EVALUATED` son resultados legítimos.** Declararlos es el trabajo; ocultarlos lo
  invalida.
- **Una limitación de herramienta no es un defecto de producto** y viceversa. Mantén la separación en
  todo lo que escribas.
- **No inventes rutas ni ficheros.** Verifica con `ls`/`cat` antes de citar.
- **Datos sintéticos aislados.** Ninguna mutación fuera de la rama dev de Neon y de las orgs E2E.
  Comprueba que turnos manuales e imports ajenos sobreviven a tu seeding.
- Si una instrucción de este prompt contradice `AGENTS.md` o un contrato de `docs/standards/`,
  **detente, conserva el estado y reporta la ambigüedad**.

---

## 8 · ENTREGA

1. Ficheros nuevos/modificados del harness y la documentación (no `src/`, no `api/`, no `db/`).
2. Gate `UXR-F0-BASELINE-HARNESS-GATE.md` actualizado con evidencia y estado real.
3. `05_PROGRESS_LOG.md` y `03_IMPLEMENTATION_PLAN.md` sincronizados.
4. **Sin commit ni push** salvo autorización explícita del usuario. Reporta `git status` al final,
   distinguiendo tus ficheros de los 4 preexistentes.
5. Resumen final de **máximo 20 líneas**: estado por microtarea, gate resultante (`PASS` /
   `PASS_WITH_GAPS`), qué quedó sin evaluar y por qué, y qué desbloquea (o no) la Fase 1.

### Criterio de éxito de esta fase
> Que un tercero pueda, leyendo sólo tus artefactos, **regenerar la baseline desde cero y obtener el
> mismo resultado** — y sepa exactamente qué NO quedó cubierto.
