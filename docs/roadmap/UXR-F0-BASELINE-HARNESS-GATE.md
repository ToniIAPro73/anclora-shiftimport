# UXR-F0 — Baseline & Harness Gate Document

## Summary
- **Status**: GATE PENDING
- **Date**: <vacío hasta cierre>
- **Fase**: UXR-F0 (Línea base y harness)
- **Target Branch**: `development`
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

## 2 · Criterios de entrada (gate de admisión)

- [ ] Spec `sdd/features/ux-remediation-codex-2026-09/` completa y no en `DRAFT` de contenido (puede
      seguir en `DRAFT → GATE PENDING` de estado, ver `00_PRODUCT_SPEC.md`).
- [ ] Acceso confirmado a un entorno `LOCAL_BUILD` reproducible (`npm run dev` o `npm run build` +
      servidor estático).
- [ ] Sin dependencias previas (esta es la primera fase).

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [ ] UXR-F0-M01 · AC-1 — dos ejecuciones consecutivas del procedimiento de baseline producen
      capturas idénticas.
- [ ] UXR-F0-M01 · AC-2 — el procedimiento es suficiente para que fases posteriores generen baseline
      sin pasos no documentados.
- [ ] UXR-F0-M02 · AC-1 — `i18n-integrity-check` detecta las claves ES/EN del catálogo TS real.
- [ ] UXR-F0-M03 · AC-1 — el inventario de rutas internas cubre `MembersModal`/`ImportModal`/`AppShell`.
- [ ] UXR-F0-M04 · AC-1 — `design-system-consumer-check` resulta `PASS` o `NOT_APPLICABLE` explícito.
- [ ] UXR-F0-M05 · AC-1 — `hide-scrollbars=false` fijado en todo procedimiento de captura de overflow.
- [ ] UXR-F0-M06 · AC-1 — rutas de subida absolutas resueltas sin error.
- [ ] UXR-F0-M07 · AC-1 — organización sintética con exactamente 1 OWNER y ≥1 PLANNER con scope
      definido.
- [ ] UXR-F0-M07 · AC-2 — cuentas provisionadas con historial y formato poblados (no vacías).
- [ ] UXR-F0-M08 · AC-1 — 32 capturas (8×2×2) archivadas con fecha/HEAD de referencia.

### 3.2 No regresión — DO_NOT_BREAK

- [ ] N/A directo (fase de harness, sin cambio de comportamiento de producto) — pero: la
      organización sintética de `UXR-F0-M07` no interfiere con datos de otras organizaciones de
      prueba, y mantiene la invariante de una sola OWNER por organización (`ADR-2026-09-07` D7).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [ ] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [ ] `npx tsc --noEmit` — 0 errores.
- [ ] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [ ] `npm run build` — success.

*(Fase 0 no toca `src/`/`api/` en la mayoría de sus microtareas — este bloque se ejecuta como
verificación de que el harness no ha introducido regresión alguna, aun cuando se espera que el diff
de código sea nulo o mínimo.)*

### 3.4 Matriz de evidencia visual

- [ ] 8 viewports × 2 temas × 2 locales congelados como baseline de referencia.
- [ ] `hide-scrollbars=false` confirmado en el procedimiento documentado.

### 3.5 Accesibilidad

- [ ] N/A directo en esta fase (sin cambio de UI de producto).

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Viewport Economy (medición) | `VIEWPORT_ECONOMY_MEASURED: PARTIAL` | Baseline congelada (precondición, no mejora de rating todavía) |
| Cobertura OWNER/PLANNER | `OWNER_COVERED`/`PLANNER_COVERED`: `false` | Cuentas provisionadas (ejecución de journeys en Fase 4) |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| *(vacío — se rellena al implementar)* | | | |

## 5 · Gate Status

**PENDING** — pasa a `PASS` o `PASS_WITH_GAPS` sólo cuando las 8 microtareas de Fase 0 tengan
evidencia adjunta en §4 y las casillas de §3 estén marcadas con justificación. Un gate con evidencia
parcial se declara `PASS_WITH_GAPS`, nunca `PASS`.
