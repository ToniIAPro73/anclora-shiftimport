# PROMPT MAESTRO — Ejecución de FASE 1 · Quick wins
## `UXR-F1-M01` … `UXR-F1-M04` · Findings: CX-F03, CX-F08, CX-F09, CX-E01
## Gate: `docs/roadmap/UXR-F1-QUICK-WINS-GATE.md`

> **Uso**: entregar íntegramente como prompt inicial a un agente IA con acceso de lectura/escritura
> al repositorio `anclora-shiftimport`, rama `development`.

---

## 0 · ROL Y MISIÓN

Eres un **ingeniero frontend**. Esta es la **primera fase que toca código de producto**. Cuatro
correcciones pequeñas, acotadas y de bajo riesgo: nombres accesibles en el preview del importador,
sincronización del idioma del documento, limpieza del pricing EN, y alineación de una fixture con el
parser.

**Regla de oro de esta fase**: son *quick wins*. Si una microtarea empieza a crecer hacia refactor,
**párala y decláralo** — el rediseño del importador es Fase 2, no ésta.

### Qué puedes tocar
✅ `src/components/shift-dashboard/ImportModal.tsx`, `src/lib/i18n-react.tsx`, `index.html`,
`src/lib/plans.ts`, `src/pages/PricingPage.tsx`, `src/lib/i18n.ts`,
`test-data/scenarios/anclora-group-shift-ingestion/01_empleados_45.csv`, y los ficheros de test
asociados.

### Qué NO puedes tocar
❌ `api/`, `db/`, `vercel.json`, `src/index.css` (el layout es Fase 2/3), lógica de autorización.
❌ Producción, secretos, `git push`, despliegues.
❌ **Precios comerciales**: `4,99 €` y `19 €` son decisión de producto. Reestructuras *cómo se
representan*, no *cuánto valen*.

### Precondición
Fase 0 cerrada (`UXR-F0-BASELINE-HARNESS-GATE.md` en `PASS` o `PASS_WITH_GAPS` documentado).
`UXR-F1-M01` depende de `UXR-F0-M05` (scrollbars visibles en la medición axe/DOM);
`M02`/`M03` de `UXR-F0-M02` (detección de locales); `M04` de `UXR-F0-M06` (rutas absolutas de subida).

### Estado real al arrancar (Fase 0 cerró en `PASS_WITH_GAPS` — cuatro cosas que te afectan)

1. **`import-preview` está declarada inestable a nivel de pantalla.** Sus capturas varían entre
   procesos por layout sub-píxel (líneas de 1px sobre frontera fraccionaria) — es la misma
   distribución de alturas fijas de CX-F01, y la arregla Fase 2. **Para ti no es un bloqueo**: tus
   capturas de `UXR-F1-M01` son evidencia de estado ("el preview tiene nombres accesibles"), no
   comparación pixel-a-pixel. Pero **no las uses como baseline de regresión** ni te alarmes si dos
   capturas de la misma pantalla no son idénticas: está medido y documentado.
   `calendar` y `pricing` (40 de 48 capturas) sí son baseline fiable — tu `UXR-F1-M03` va sobre
   `pricing`, así que ahí sí puedes comparar.
2. **`UXR-F0-M02` quedó `NOT_EVALUATED`** (la herramienta externa `i18n-integrity-check` no está
   disponible y no se instala sin violar la regla de dependencias). La cobertura material vigente es
   `src/lib/i18n-coverage.test.ts`, que ya pasa. **No te bloquea**: `M02` y `M03` se verifican con el
   atributo `lang` del DOM y con tests unitarios, no con esa herramienta.
3. **`UXR-F1-M04` tiene una pata que hoy no puedes ejecutar.** El test contractual y el renombrado de
   cabecera sí. Pero la verificación manual "carga del fixture por la UI real de importación masiva"
   pasa por `MembersModal`, que es **ADMIN y requiere sesión autenticada** (`vercel dev` + Neon), y
   ese entorno quedó `NOT_EVALUATED` en Fase 0. Si no lo levantas: cierra `M04` con el test
   contractual y **declara la verificación por UI como `NOT_EVALUATED` con motivo** — no la des por
   hecha. Dilo explícitamente en el gate, porque `M04` desbloquea Fase 2.
4. **La suite tiene un test intermitente.** `npm test` falló 1 vez de 13 ejecuciones (~8%, 2 errores
   no capturados), no reproducible en 10 intentos seguidos, y sin relación con los cambios de Fase 0
   (no se tocó `src/`). Si te sale un fallo que no guarda relación con tu cambio, **reejecuta antes
   de diagnosticar**; y si lo reproduces, identifícalo y repórtalo en vez de arreglarlo a ciegas.

El resto de Fase 1 (`M01`, `M02`, `M03`) es **íntegramente ejecutable en modo invitado local-first**,
sin `vercel dev` ni Neon: el harness de Fase 0 ya abre el importador con 5 filas en modo invitado
(`qa/e2e-acceptance/specs-baseline/ux-remediation-baseline.spec.ts`). Reutiliza ese patrón.

---

## 1 · ENTRADAS OBLIGATORIAS

| # | Ruta | Uso |
|---|------|-----|
| 1 | `AGENTS.md` (raíz) + `/Users/toni/AGENTS.md` | Permisos y convenciones |
| 2 | `sdd/features/ux-remediation-codex-2026-09/03_IMPLEMENTATION_PLAN.md` **líneas 389–610** | Las 4 microtareas literales |
| 3 | `docs/roadmap/UXR-F1-QUICK-WINS-GATE.md` | AC exactos a satisfacer |
| 4 | `sdd/features/ux-remediation-codex-2026-09/02_DATA_API_CONTRACT.md` | Forma estructurada del precio (M03) |
| 5 | `docs/standards/LOCALIZATION_CONTRACT.md` | Manda sobre el formato de i18n (M02, M03) |
| 6 | `docs/standards/MODAL_CONTRACT.md` | Foco y cierre del modal (M01) |

---

## 2 · ESTADO REAL DEL REPO — CORRECCIONES A LA SPEC

⚠️ La spec deja varios *«a confirmar en implementación»*. **Ya están confirmados.** Donde esta
sección contradiga al `03_IMPLEMENTATION_PLAN.md`, manda esta sección; actualiza la spec y regístralo
en `05_PROGRESS_LOG.md`.

### 2.1 `UXR-F1-M02` — el punto de inserción está resuelto
El provider es **`src/lib/i18n-react.tsx`** (22 líneas), no un fichero por localizar:

```tsx
const [locale, setLocaleState] = useState<Locale>(() => loadLocale());
useEffect(() => { saveLocale(locale); }, [locale]);
```

Ese `useEffect` es el punto exacto: escribe también `document.documentElement.lang`. Como
`loadLocale()` corre en el inicializador de `useState`, el efecto dispara en el montaje y la carga
fría con EN persistido queda cubierta (AC-2).

- `index.html:2` es literalmente `<html lang="es">` — es el valor inicial antes de hidratar. Decide y
  documenta: o se deja `es` (default del producto, `DEFAULT_LOCALE`) aceptando un frame de desajuste,
  o se neutraliza. **No lo cambies a `en`**: `es` es el default real.
- `src/lib/i18n.ts` define `Locale = 'es' | 'en'`, `DEFAULT_LOCALE = 'es'` y persiste en
  `localStorage` bajo `anclora_shiftimport_locale_v1`. **No migres el catálogo a JSON** (§2.6 del
  prompt de Fase 0): la fuente de verdad es TS.

### 2.2 `UXR-F1-M03` — "Manager" no está en `plans.ts`
Verificado. Las referencias reales son:

| Qué | Dónde |
|---|---|
| `priceHypothesis: string` (el tipo a reestructurar) | `src/lib/plans.ts:34` |
| `'0 €'` / `'4,99 €/mes'` / `'Desde 19 €/mes'` | `src/lib/plans.ts:48, 57, 66` |
| La concatenación que produce `/mes/mo` | `src/pages/PricingPage.tsx:47-49` — renderiza `{plan.priceHypothesis}` y le añade `{t('pricing.perMonth')}` |
| `Manager` (ES) | `src/lib/i18n.ts:1369` → `roles: 'Roles Admin/Manager'` |
| `Manager` (EN) | `src/lib/i18n.ts:2928` → `roles: 'Admin/Manager roles'` |

→ El AC-2 ("coincide con Planner vigente") se cierra en `i18n.ts`, no en `plans.ts`. `plans.test.ts`
ya existe: amplíalo, no crees un fichero paralelo.

### 2.3 `UXR-F1-M04` — el test contractual ya tiene casa, y el BOM ya está resuelto
- **`src/lib/bulk-import-csv.test.ts` ya existe** (la spec decía "a confirmar"). Añade ahí el test
  contractual; no crees uno nuevo.
- La fixture tiene BOM (`﻿name,externalEmployeeId,area,areaCode,status`), pero **el BOM ya está
  cubierto**: `bulk-import-csv.test.ts` tiene los casos 1, 2 y 8 sobre BOM. No es la causa del fallo.
- **La causa real**: `normalizeHeader` (`src/lib/bulk-import-csv.ts:12`) hace
  `trim().toLowerCase().replace(/\s+/g, '_')` — baja a minúsculas y sustituye espacios, pero **no
  convierte camelCase a snake_case**. Así `externalEmployeeId` → `externalemployeeid`, que nunca
  iguala a `external_employee_id` (exigido en `bulk-import-csv.ts:38`).
- **Corrige la fixture, no el parser.** El parser documenta su contrato explícitamente
  (`external_employee_id,name`) y `normalizeHeader` es deliberadamente estricto. Renombra sólo la
  cabecera; **no toques los valores de las filas** (hay casos de incidencia deliberados).

### 2.4 `UXR-F1-M01` — patrones que ya existen en `ImportModal.tsx`
No inventes convenciones nuevas. El fichero (1806 líneas) ya usa:
- **5 regiones `role="status"` / `aria-live`** — reutiliza una de ellas para anunciar el conteo tras
  borrar una fila (paso 3 de la microtarea). No añadas una sexta sin motivo.
- **`data-testid` estables** que te sirven de anclaje en los tests:
  `import-quality-state`, `import-detected-period`, `import-diagnostics`, `import-historical-count`,
  `import-future-count`, `import-self-future-notice`, `import-employee-name-locked`,
  `import-area-context`, `self-import-summary`.
- Tests existentes: `ImportModal.test.tsx` y `ImportModal.areas.test.tsx`.

⚠️ **DO_NOT_BREAK "Sin añadir texto visual repetitivo"**: el nombre accesible va en `aria-label` /
`<label>` asociado, **nunca** como texto visible repetido en cada fila.

---

## 3 · ORDEN DE EJECUCIÓN

```
UXR-F1-M04  fixture (header rename + test contractual)     ← primero: desbloquea Fase 2
UXR-F1-M02  lang del documento                             ← insercción de 1 línea + test
UXR-F1-M03  pricing EN estructurado                        ← plans.ts + PricingPage + i18n.ts
UXR-F1-M01  nombres accesibles por fila                    ← el más delicado de los cuatro
```

`M04` primero porque **bloquea `UXR-F2-M05`, `UXR-F2-M06` y `UXR-F4-M10`**: sin fixture cargable, la
Fase 2 no se puede validar por la ruta de usuario real.

`M01` al final porque es el único que toca un componente de 1806 líneas con foco, teclado y estado de
edición en juego.

---

## 4 · EL PUNTO DELICADO: `UXR-F1-M01`

Los AC exigen dos cosas que se rompen con facilidad:

**AC-1 — "se anuncia campo y turno asociado"**: cada input de fila necesita un nombre que combine
*qué campo* y *qué fila*. Usa un identificador estable (fecha del turno o índice de fila), no la
posición visual. Si la fila se borra o reordena, el nombre debe seguir siendo correcto.

**AC-2 — "al borrar, el foco queda en un destino predecible"**: éste es el que se olvida. Al eliminar
una fila, el elemento enfocado desaparece del DOM y el foco se pierde al `<body>`. Define
explícitamente el destino (la papelera de la fila siguiente, o la anterior si era la última, o la
región de estado si no quedan filas) y **cúbrelo con un test**.

Verifica además, sin excusa:
- Orden de tabulación intacto (DO_NOT_BREAK).
- Edición precommit y borrado de una sola fila siguen funcionando.
- Axe sin violaciones nuevas — con la medición de Fase 0 (`hide-scrollbars=false`).

---

## 5 · GATE — CÓMO CERRARLO

Actualiza `docs/roadmap/UXR-F1-QUICK-WINS-GATE.md`:

1. **§3.1** — un AC marcado exige artefacto adjunto. Sin evidencia, sin marca.
2. **§3.2 No regresión** — verifica explícitamente las 4 entradas DO_NOT_BREAK de CX-F03
   (edición precommit, borrado de una fila, orden de tabulación, sin texto visual repetitivo), las 3
   de CX-F08 (persistencia de locale, traducciones existentes, SSR/default) y las 2 de CX-F09
   (distinción Free/Personal/Team, precios comerciales intactos).
3. **§3.3 Calidad automatizada** — cero tolerancia:
   ```bash
   npm test && npx tsc --noEmit && npm run lint && npm run build
   ```
   Ejecútalo **antes de empezar** para tener línea base y **al terminar**. `npm run lint` corre con
   `--max-warnings 0`: un warning nuevo es un fallo.
4. **§3.4 Matriz visual** — capturas por microtarea:
   - M01: 1440×900 y 390×844 × {claro, oscuro} × {ES, EN}, preview con 4+ filas.
   - M02: no es visual — registra el valor de `document.documentElement.lang` por celda de la matriz.
   - M03: 1440×900 y 390×844 × {claro, oscuro} de `PricingPage` en ES y EN.
   - M04: no es visual — salida del test contractual + carga real del fixture por la UI.
5. **§5** — `PASS` sólo con las 4 microtareas cerradas con evidencia. Cualquier hueco →
   `PASS_WITH_GAPS` con el motivo.
6. Sincroniza `05_PROGRESS_LOG.md` y `03_IMPLEMENTATION_PLAN.md`.

---

## 6 · REGLAS DE INTEGRIDAD

- **Ninguna de estas cuatro correcciones amplía permisos.** Un `aria-label`, un atributo `lang`, un
  campo de precio y una cabecera de CSV no tocan scopes ni roles. Si tu cambio roza autorización,
  te has salido del alcance.
- **No refactorices `ImportModal.tsx`.** El rediseño del layout es `UXR-F2-M01`/`M02`.
- **No toques `src/index.css`** en esta fase.
- Si encuentras un defecto de producto fuera de estos 4 findings, **documéntalo, no lo arregles**.
- Si una instrucción contradice `AGENTS.md` o `docs/standards/`, **detente y reporta la ambigüedad**.

---

## 7 · ENTREGA

1. Cambios de código acotados a los ficheros de §0, con sus tests.
2. Gate actualizado con evidencia real y estado honesto.
3. `05_PROGRESS_LOG.md` y `03_IMPLEMENTATION_PLAN.md` sincronizados.
4. **Sin commit ni push** salvo autorización explícita. Reporta `git status` al final.
5. Resumen de **máximo 20 líneas**: estado por microtarea, gate resultante, y confirmación explícita
   de si `UXR-F1-M04` desbloquea o no la Fase 2.
