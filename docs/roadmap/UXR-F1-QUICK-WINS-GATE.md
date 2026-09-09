# UXR-F1 — Quick Wins Gate Document

## Summary
- **Status**: GATE PENDING
- **Date**: <vacío hasta cierre>
- **Fase**: UXR-F1 (Quick wins)
- **Target Branch**: `development`
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

- [ ] Fase UXR-F0 en `GATE PASS` o `GATE PASS_WITH_GAPS` documentado.
- [ ] Baseline de evidencia de Fase 0 vigente para el HEAD actual (`UXR-F0-M08`).
- [ ] `hide-scrollbars=false` y rutas absolutas confirmadas disponibles (`UXR-F0-M05`, `UXR-F0-M06`).

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [ ] UXR-F1-M01 · AC-1 — foco en hora final anuncia campo y turno asociado.
- [ ] UXR-F1-M01 · AC-2 — papelera con foco identifica la fila; destino de foco predecible al borrar.
- [ ] UXR-F1-M02 · AC-1 — interfaz EN → `document.documentElement.lang = en`.
- [ ] UXR-F1-M02 · AC-2 — ciclo ES→EN→ES + recarga mantiene coherencia de `lang`.
- [ ] UXR-F1-M03 · AC-1 — EN no muestra "Desde" ni "/mes/mo" simultáneos.
- [ ] UXR-F1-M03 · AC-2 — comparación de roles usa "Planner", no "Manager".
- [ ] UXR-F1-M04 · AC-1 — fixture designada alcanza preview sin fallo de headers.

### 3.2 No regresión — DO_NOT_BREAK

- [ ] Preview sigue sin escribir durante el parse.
- [ ] Ningún futuro se publica automáticamente.
- [ ] Edición precommit y borrado de una sola fila intactos (CX-F03).
- [ ] Orden de tabulación intacto (CX-F03).
- [ ] Persistencia de locale intacta (CX-F08).
- [ ] Traducciones existentes intactas (CX-F08).
- [ ] Distinción Free/Personal/Team intacta (CX-F09).
- [ ] No se cambia ningún precio comercial (CX-F09).
- [ ] Dataset sintético del fixture y casos de incidencia deliberados intactos (CX-E01).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [ ] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [ ] `npx tsc --noEmit` — 0 errores.
- [ ] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [ ] `npm run build` — success.

### 3.4 Matriz de evidencia visual

- [ ] 8 viewports × 2 temas × 2 locales para: preview de import (CX-F03), landing/`/app` con cambio
      de locale (CX-F08), `PricingPage` (CX-F09).
- [ ] `hide-scrollbars=false` en toda medición de overflow.

### 3.5 Accesibilidad

- [ ] Axe sin violaciones nuevas en preview de import (CX-F03).
- [ ] Recorrido completo por teclado con foco visible y orden lógico en preview de import.
- [ ] `document.documentElement.lang` coincide con el locale efectivo en todas las vistas medidas
      (CX-F08).

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Accessibility (APPLICATION) | POOR | FAIR |
| Accessibility (LANDING_PAGE) | FAIR | GOOD |
| Offer Clarity (LANDING_PAGE) | FAIR | GOOD |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| *(vacío — se rellena al implementar)* | | | |

## 5 · Gate Status

**PENDING** — pasa a `PASS` o `PASS_WITH_GAPS` sólo cuando las 4 microtareas de Fase 1 tengan
evidencia adjunta en §4 y las casillas de §3 estén marcadas con justificación.
