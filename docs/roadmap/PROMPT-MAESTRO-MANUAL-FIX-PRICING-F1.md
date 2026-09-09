# PROMPT MAESTRO — Corrección puntual del manual: captura de Precios (derivada de UXR-F1)
## Alcance: 1 imagen + regeneración del PDF. No es una reconstrucción del manual.

> **Uso**: entregar íntegramente como prompt inicial a un agente IA con acceso de lectura/escritura
> al repositorio `anclora-shiftimport`, rama `development`.

---

## 0 · ROL Y MISIÓN

Eres un **editor técnico**. Tu única tarea es sustituir **una captura de pantalla** del manual de
usuario porque quedó obsoleta tras `UXR-F1-M03` (Fase 1 de la remediación UX, commit `cbd642d`), y
regenerar el PDF a partir de ella. **No es una revisión del manual completo.**

### Qué puedes tocar
✅ `docs/manual/screenshots/pricing-dark.png` (regenerar) · `public/manuals/anclora-shiftimport-manual-usuario-es.pdf`
(regenerar) · `docs/manual/MANUAL_CHANGELOG.md` (añadir una nota breve, no reescribir la existente).

### Qué NO puedes tocar
❌ Ninguna otra de las ~40 capturas de `docs/manual/screenshots/`.
❌ El texto de `docs/manual/manual-usuario.md` — está verificado que no necesita cambios (ver §2).
❌ El número de versión de la portada (`Versión 3.0`) — esto es una corrección, no una nueva edición.
❌ `src/`, `api/`, `db/` — no hay ningún cambio de producto que hacer aquí.
❌ Cualquier credencial, `vercel dev` con Neon, o dato real. Esta captura es 100% invitado/pública.

---

## 1 · QUÉ PROBLEMA RESUELVES — VERIFICADO, NO SUPUESTO

La captura actual (`docs/manual/screenshots/pricing-dark.png`, generada el 9/9 a las 12:09, **antes**
del commit de Fase 1 a las 20:49) muestra dos cosas que ya no son ciertas en el producto:

1. **`4,99 €/mes /mes` y `Desde 19 €/mes /mes`** — el sufijo "/mes" aparece **duplicado**. Causa
   verificada: `priceHypothesis: '4,99 €/mes'` (string ya compuesto) + `PricingPage.tsx` le
   concatenaba `t('pricing.perMonth')` (`/mes`) otra vez encima. La auditoría original sólo señaló
   esto en inglés (`Desde 19 €/mes/mo`); en español el mismo bug estaba presente pero pasaba
   desapercibido por ser la misma palabra repetida.
2. **`Roles Admin/Manager`** en la fila de comparativa — terminología antigua, sustituida por
   `Roles Admin/Planificador` (`ADR-2026-09-07-P5.7-team-roles-scopes.md`).

**Tras `UXR-F1-M03`** (ya en `development`), `src/lib/plans.ts` usa un `PlanPrice` estructurado y
`src/pages/PricingPage.tsx` renderiza importe, prefijo e intervalo cada uno una vez. El resultado en
vivo es `4,99 €/mes` (sin duplicar) y `Roles Admin/Planificador`. La captura del manual ya no
representa el producto.

**Verificado, para que no lo repitas**: el texto en prosa que acompaña a esa captura, sección
27 "Planes, privacidad y restablecimiento" de `docs/manual/manual-usuario.md`, **no menciona
importes ni "Manager"** — ya dice *"Los precios mostrados pueden ser orientativos y cambiar; este
manual no fija condiciones comerciales."* No hay ninguna frase que reescribir. El único artefacto
desactualizado es la imagen.

---

## 2 · CÓMO REGENERAR LA CAPTURA — SIN LEVANTAR BACKEND

`docs/manual/screenshots/` se genera normalmente con `scripts/capture-manual-screenshots.mjs`, que
recorre ~40 pantallas y **para las autenticadas necesita `vercel dev` + Neon sembrado**
(`scripts/seed-manual-demo.mjs`). **No ejecutes ese script completo** — regenerarías las otras ~40
capturas sin necesidad y arriesgarías tocar cosas fuera de alcance.

`/pricing` es una superficie pública/invitado: verificado en `src/App.tsx` (la comprobación de
sesión que redirige a `/login` cuando el estado es desconocido excluye explícitamente `/` y
`/pricing`). No necesita el 401 sintético ni ningún backend. El tema por defecto es oscuro
(`DEFAULT_THEME_MODE = 'dark'` en `src/lib/theme.ts`) y el locale por defecto es español
(`DEFAULT_LOCALE = 'es'` en `src/lib/i18n.ts`), que es justo lo que necesitas para que la nueva
captura sea comparable a la que sustituyes.

**Procedimiento** (reutiliza Chromium ya instalado en `qa/e2e-acceptance/node_modules`, sin añadir
dependencias):

```bash
cd /Users/toni/Developer/anclora/anclora-shiftimport
npm run dev -- --port 5199 --strictPort &
sleep 3
```

Luego, con Playwright (mismo patrón que `scripts/capture-manual-screenshots.mjs`: viewport
**1440×900 CSS px, `deviceScaleFactor: 1.5`**, sin `fullPage` — la captura anterior ya es de un solo
viewport y el diseño denso de `/pricing` cabe entero en 900px de alto):

```js
import { chromium } from './qa/e2e-acceptance/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
await page.goto('http://localhost:5199/pricing', { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/manual/screenshots/pricing-dark.png' });
await browser.close();
```

Después, cierra el servidor de `vite dev` que arrancaste.

**Verificación antes de aceptar la captura** — no la des por buena a ciegas:
- [ ] El precio de Personal se lee `4,99 €/mes` **una sola vez**, no `4,99 €/mes /mes`.
- [ ] El precio de Team se lee `Desde 19 €/mes` **una sola vez**.
- [ ] La fila de comparativa dice `Roles Admin/Planificador`, no `Admin/Manager`.
- [ ] Los tres planes (Free, Personal, Team) y la tabla comparativa completa son legibles, igual que
      en la captura anterior — compara ambas una junto a otra antes de sustituir.
- [ ] Tema oscuro, español — coherente con el resto de capturas del manual.

---

## 3 · REGENERAR EL PDF

```bash
node scripts/generate-manual-pdf.mjs
```

Autocontenido: lee `docs/manual/manual-usuario.md` + las imágenes de `docs/manual/screenshots/` y
escribe `public/manuals/anclora-shiftimport-manual-usuario-es.pdf`. No necesita servidor. Sí necesita
`poppler` (`pdfinfo`, `pdftotext`) instalado en el sistema — si no está disponible, **repórtalo, no
lo instales sin preguntar** (paquete de sistema, no dependencia npm).

Verifica que el PDF resultante:
- [ ] Se genera sin error (dos pasadas, según el propio script).
- [ ] Incluye la sección 27 con la imagen nueva embebida (ábrelo y comprueba visualmente esa página).
- [ ] No cambia de tamaño ni de forma anómala respecto al PDF anterior (misma paginación aproximada).

---

## 4 · REGISTRO DEL CAMBIO

`docs/manual/MANUAL_CHANGELOG.md` documenta actualmente **la reconstrucción 3.0** como un único
evento; no tiene un histórico de entradas fechadas por corrección menor. **No reescribas ese
documento.** Añade al final una sección nueva y breve, en el mismo estilo:

```markdown
## Corrección puntual — 2026-09-09 (post UXR-F1)

- **Alcance**: 1 captura (`screenshots/pricing-dark.png`) + regeneración del PDF. Ninguna otra
  captura ni el texto en prosa se modificaron.
- **Motivo**: `UXR-F1-M03` (commit `cbd642d`, Fase 1 de la remediación UX Codex 2026-09-09) corrigió
  el sufijo de intervalo duplicado en Precios (`4,99 €/mes /mes` → `4,99 €/mes`) y la terminología de
  roles (`Admin/Manager` → `Admin/Planificador`). La captura anterior (generada antes de ese commit)
  mostraba ambos defectos; ya no representaba el producto.
- **No se cambió**: el número de versión de portada (sigue en 3.0) — esto es una corrección de un
  artefacto obsoleto, no una nueva edición del manual.
- **Verificación**: `node scripts/generate-manual-pdf.mjs` completado sin error; PDF revisado
  visualmente en la sección 27.
```

Ajusta la fecha si la ejecutas otro día.

---

## 5 · REGLAS DE INTEGRIDAD

- **No toques las otras ~40 capturas** aunque notes que alguna también parece antigua — no es tu
  alcance; si ves algo, documéntalo aparte, no lo corrijas aquí.
- **No reescribas la prosa del manual.** Ya está verificado que no lo necesita (§1).
- **No subas la versión de portada.** Es una corrección de imagen, no una edición nueva.
- **No inventes un valor de precio ni una etiqueta de rol** — la captura debe reflejar exactamente lo
  que el código en `development` renderiza hoy, ni más ni menos.
- **No ejecutes el script completo de 40 capturas** ni levantes `vercel dev`/Neon: esta pantalla es
  pública y no lo necesita.
- Si al abrir `/pricing` ves algo que no coincide con lo descrito en §1 (por ejemplo, el bug seguiría
  presente, o hay un tercer defecto no documentado), **detente y repórtalo** en vez de capturar y
  seguir adelante.

---

## 6 · ENTREGA

1. `docs/manual/screenshots/pricing-dark.png` reemplazada.
2. `public/manuals/anclora-shiftimport-manual-usuario-es.pdf` regenerado.
3. Nota breve añadida a `docs/manual/MANUAL_CHANGELOG.md`.
4. **Sin commit ni push** salvo autorización explícita del usuario. Reporta `git status` al final —
   debe mostrar exactamente esos 3 ficheros, nada más.
5. Resumen de **máximo 10 líneas**: confirmación de las 5 comprobaciones de §2, resultado de la
   regeneración del PDF, y si algo no coincidió con lo esperado.
