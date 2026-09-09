# UXR-F1 — Quick Wins Gate Document

## Summary
- **Status**: GATE PASS_WITH_GAPS
- **Date**: 2026-09-09
- **Fase**: UXR-F1 (Quick wins)
- **Target Branch**: `development`
- **HEAD**: `83ddb82` (sin commit en esta pasada — cambios en el árbol de trabajo)
- **Findings cubiertos**: CX-F03, CX-F08, CX-F09, CX-E01
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`

---

## 1 · Objectives & Scope

**Entra**: nombres accesibles en preview de import (CX-F03), sincronización de
`document.documentElement.lang` (CX-F08), separación de importe/moneda/intervalo en pricing EN
(CX-F09), y alineación de la cabecera del fixture de empleados con el parser (CX-E01).

**No entra explícitamente**: CX-F01/F02/F04/F05/F06/F07 (fases 2-3). Ningún cambio de precio
comercial (sólo presentación). Ninguna reescritura del parser de `bulk-import-csv.ts` (sólo el dato
del fixture).

## 2 · Criterios de entrada (gate de admisión)

- [x] Fase UXR-F0 en `GATE PASS` o `GATE PASS_WITH_GAPS` documentado — `UXR-F0-BASELINE-HARNESS-GATE.md`
      cerró `PASS_WITH_GAPS` el 2026-09-09.
- [x] Baseline de evidencia de Fase 0 vigente para el HEAD actual (`UXR-F0-M08`) — 48 capturas
      archivadas bajo `qa/e2e-acceptance/artifacts/ux-remediation-baseline/`.
- [x] `hide-scrollbars=false` y rutas absolutas confirmadas disponibles (`UXR-F0-M05`, `UXR-F0-M06`) —
      DONE en Fase 0 (Chromium real vía `@playwright/test` nunca oculta scrollbars por diseño; rutas
      absolutas fijadas en los escenarios).

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [x] UXR-F1-M01 · AC-1 — foco en hora final anuncia campo y turno asociado. Evidencia: `aria-label`
      `t('importModal.rowEndAria', {row})` verificado con Playwright real (`page.getByLabel(...)`
      resuelve el input correcto) + test unitario de renderizado.
- [x] UXR-F1-M01 · AC-2 — papelera con foco identifica la fila; destino de foco predecible al borrar.
      Evidencia: 2 tests Playwright (borrar fila intermedia → foco en la papelera que ocupa el hueco;
      borrar la última fila → foco en el contenedor `role="status"` de estado vacío), ambos verdes.
- [x] UXR-F1-M02 · AC-1 — interfaz EN → `document.documentElement.lang = en`. Evidencia: test unitario
      + Playwright real en `/app` y `/pricing` (guest, ES/EN, 4/4 verde).
- [x] UXR-F1-M02 · AC-2 — ciclo ES→EN→ES + recarga mantiene coherencia de `lang`. Evidencia: test
      unitario que hace ES→EN→ES→EN, desmonta y remonta el provider (simulando recarga con EN
      persistido) y confirma `lang="en"` tras el mount fresco.
- [x] UXR-F1-M03 · AC-1 — EN no muestra "Desde" ni "/mes/mo" simultáneos. Evidencia: test de
      `PricingPage` que recorre las 3 tarjetas en EN y falla si aparece "Desde" o más de un "/mo".
- [x] UXR-F1-M03 · AC-2 — comparación de roles usa "Planner", no "Manager". Evidencia: test de
      `PricingPage` (ES "Planificador", EN "Planner", ausencia de "Manager" en ambos).
- [~] UXR-F1-M04 · AC-1 — fixture designada alcanza preview sin fallo de headers. Evidencia parcial:
      test contractual en `bulk-import-csv.test.ts` (45/45 filas vía `parseEmployeesCsv` real) — PASS.
      La verificación por la UI real de `MembersModal` queda `NOT_EVALUATED` (requiere `vercel dev`+Neon,
      no levantado en esta pasada).

### 3.2 No regresión — DO_NOT_BREAK

- [x] Preview sigue sin escribir durante el parse — sin cambios en `handleConfirm`/flujo de escritura;
      sólo se tocó renderizado y manejo de foco.
- [x] Ningún futuro se publica automáticamente — sin cambios en `import-temporal.ts` ni en la lógica
      de borrador (fuera de alcance de esta fase).
- [x] Edición precommit y borrado de una sola fila intactos (CX-F03) — `handleUpdateShift`/
      `handleRemoveShift` conservan su lógica; sólo se añadió `setPendingRemovalFocusIndex` como
      efecto colateral. Verificado: los 1466 tests pasan, incluidos los existentes de `ImportModal`.
- [x] Orden de tabulación intacto (CX-F03) — test Playwright de tab order (date→origin→type→start→
      end→trash) verde; ningún `tabIndex` positivo añadido (el único `tabIndex={-1}` es el contenedor
      de estado vacío, fuera del flujo de tabulación normal).
- [x] Persistencia de locale intacta (CX-F08) — `saveLocale(locale)` sigue en el mismo `useEffect`,
      sin cambios; test unitario cubre el ciclo completo.
- [x] Traducciones existentes intactas (CX-F08) — sólo se añadieron claves nuevas, ninguna existente
      se modificó ni se eliminó (excepto `pricing.comparison.roles`, cambio intencional de CX-F09).
- [x] Distinción Free/Personal/Team intacta (CX-F09) — `PLAN_IDS`/`PLANS` conservan sus 3 ids, límites
      y features sin cambio; sólo el campo de precio se reestructuró.
- [x] No se cambia ningún precio comercial (CX-F09) — verificado en test: `0`/`4.99`/`19` idénticos al
      `priceHypothesis` anterior, byte a byte en el render (`0 €`, `4,99 €/mes`, `Desde 19 €/mes` en
      ES sin cambio).
- [x] Dataset sintético del fixture y casos de incidencia deliberados intactos (CX-E01) — sólo la
      cabecera cambió (verificado por hexdump antes/después); BOM y las 45 filas de datos sin tocar.

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [x] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [x] `npx tsc --noEmit` — 0 errores.
- [x] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [x] `npm run build` — success.

**Antes** (HEAD `83ddb82`, árbol limpio — cambios de Fase 1 aparcados con `git stash` para medir):
```
npm test   → Test Files  156 passed (156) · Tests  1459 passed (1459)
npx tsc --noEmit → 0 errores (exit 0)
npm run lint     → 0 errores, 0 warnings (exit 0)
npm run build    → tsc && vite build → built in 3.66s (exit 0)
```

**Después** (cambios de Fase 1 aplicados):
```
npm test   → Test Files  157 passed (157) · Tests  1466 passed (1466)   [+1 fichero, +7 tests]
npx tsc --noEmit → 0 errores (exit 0)
npm run lint     → 0 errores, 0 warnings (exit 0)
npm run build    → tsc && vite build → built in 4.30s (exit 0)
```

Un fallo intermedio (`PricingPage.test.tsx`, 2 tests) apareció al primer `npm test` con los 4 nuevos
tests de locale-toggle: contaminación de orden entre tests por `localStorage` real de jsdom (el
fichero no usaba `setupLocalStorageMock`, a diferencia de otros tests del repo) — persistía el locale
EN de un test al siguiente. Corregido limpiando `anclora_shiftimport_locale_v1` en el `beforeEach` del
fichero; no es una regresión de producto. Reproducible/reparado, documentado aquí en vez de ocultado.

### 3.4 Matriz de evidencia visual

- [~] 8 viewports × 2 temas × 2 locales para: preview de import (CX-F03), landing/`/app` con cambio
      de locale (CX-F08), `PricingPage` (CX-F09). **Ejecutado con la matriz reducida ya establecida
      por Fase 0** (1440×900 + 390×844 × 2 temas × 2 locales = 8 combinaciones por pantalla, no las 8
      completas) — decisión de alcance heredada de `UXR-F0-M08` §3.4, no una desviación nueva de esta
      fase. 16 capturas generadas (8 `import-preview` + 8 `pricing`) bajo
      `qa/e2e-acceptance/artifacts/ux-remediation-baseline/uxr-f1-evidence/` (gitignorado, manifiesto
      con sha256/HEAD/fecha), reutilizando sin modificar el spec de Fase 0. CX-F08 (cambio de locale
      en `/app`) verificado por atributo DOM, no por captura — ver §3.5.
- [x] `hide-scrollbars=false` en toda medición de overflow — Chromium real vía `@playwright/test`,
      nunca oculta scrollbars (mismo estado que Fase 0).

### 3.5 Accesibilidad

- [x] Axe sin violaciones nuevas en preview de import (CX-F03) — `@axe-core/playwright`,
      `setLegacyMode(true)`, 5 filas, ES/claro y EN/oscuro, 0 violaciones tras corregir 2 hallazgos
      descubiertos en el proceso (campo "Origen" sin nombre — `critical`; `<th>` vacío de acciones —
      best-practice). JSON archivado en
      `qa/e2e-acceptance/artifacts/ux-remediation-baseline/axe-uxr-f1-m01/`.
- [x] Recorrido completo por teclado con foco visible y orden lógico en preview de import — test
      Playwright: date→origin→type→start→end→trash, sin saltos; borrado por teclado (foco+Enter)
      funcional en las 5 filas.
- [x] `document.documentElement.lang` coincide con el locale efectivo en todas las vistas medidas
      (CX-F08).

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Accessibility (APPLICATION) | POOR | FAIR |
| Accessibility (LANDING_PAGE) | FAIR | GOOD |
| Offer Clarity (LANDING_PAGE) | FAIR | GOOD |

`NOT_EVALUATED` — esta tabla es un objetivo declarado por la spec, no una puntuación reproducida aquí:
volver a puntuar estas dimensiones exige repetir la metodología completa de la auditoría Codex
(45 secciones, journeys, evidencia por dimensión), fuera del alcance de un gate de fase. Los hallazgos
concretos que la sustentan (nombres accesibles añadidos, `lang` sincronizado, axe sin violaciones
nuevas) están verificados arriba (§3.1, §3.5).

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| Capturas import-preview (8) | `qa/e2e-acceptance/artifacts/ux-remediation-baseline/uxr-f1-evidence/import-preview-*.png` + `manifest.json` | `ux-remediation-baseline.spec.ts` (Fase 0, reutilizado sin modificar), run `uxr-f1-evidence` | 2026-09-09 |
| Capturas pricing (8) | `qa/e2e-acceptance/artifacts/ux-remediation-baseline/uxr-f1-evidence/pricing-*.png` + `manifest.json` | ídem | 2026-09-09 |
| Axe JSON import-preview (ES/claro, EN/oscuro) | `qa/e2e-acceptance/artifacts/ux-remediation-baseline/axe-uxr-f1-m01/axe-import-preview-*.json` | spec temporal de evidencia (no comiteado, fuera del alcance de ficheros tocables de esta fase; reproducible con `@axe-core/playwright` sobre `playwright.uxr-f0-baseline.config.ts`) | 2026-09-09 |
| Test unitario `document.documentElement.lang` | `src/lib/i18n-react.test.tsx` | implementación de UXR-F1-M02 | 2026-09-09 |
| Tests `PricingPage` (mezcla de idioma, roles) | `src/pages/PricingPage.test.tsx` | implementación de UXR-F1-M03 | 2026-09-09 |
| Test contractual fixture CX-E01 | `src/lib/bulk-import-csv.test.ts` | implementación de UXR-F1-M04 | 2026-09-09 |
| Salida `npm test`/`tsc`/`lint`/`build` antes/después | ver §3.3 (inline) | ejecución directa sobre HEAD `83ddb82` | 2026-09-09 |

## 5 · Gate Status

**PASS_WITH_GAPS** — las 4 microtareas de Fase 1 tienen evidencia adjunta y AC cumplidos, con dos
huecos declarados (ninguno bloqueante para Fase 2):

1. **UXR-F1-M04**: verificación manual por la UI real de `MembersModal` (ADMIN) — `NOT_EVALUATED`.
   Requiere `vercel dev` + Neon, no levantado en esta pasada. La dependencia dura de Fase 2
   (fixture cargable por el parser real, ruta de usuario) sí está cubierta por el test contractual.
2. **UXR-F1-M02**: verificación manual con cuenta ADMIN — `NOT_EVALUATED` por el mismo motivo (sólo
   GUEST verificado). No afecta al mecanismo en sí (`I18nProvider` es agnóstico de rol).
3. **§3.6 Scorecards**: objetivo declarado, no repuntuado (ver nota en 3.6).

Ningún AC se marcó `PASS` sin evidencia adjunta; ningún resultado `PARTIAL`/`NOT_EVALUATED` se
convirtió en `PASS` por conveniencia. Hallazgo adicional fuera de alcance (drift preexistente del
`thead` sticky en `ImportModal.tsx` al borrar varias filas) documentado en
`sdd/features/ux-remediation-codex-2026-09/05_PROGRESS_LOG.md`, no corregido aquí — candidato natural
para Fase 2 (CX-F01/CX-F02).
