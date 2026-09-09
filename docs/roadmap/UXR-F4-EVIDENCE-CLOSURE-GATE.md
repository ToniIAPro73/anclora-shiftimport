# UXR-F4 — Evidence Closure Gate Document

## Summary
- **Status**: GATE PENDING
- **Date**: <vacío hasta cierre>
- **Fase**: UXR-F4 (Cierre de evidencia)
- **Target Branch**: `development`
- **Findings cubiertos**: ninguno directo (son huecos de cobertura e históricos, no findings nuevos
  de la auditoría Codex 2026-09-09) — cierra F1, F2, F5, F6, F8, F9 (históricos) y los 10 flags de
  `evidence_coverage` en `false`
- **Spec fuente**: `sdd/features/ux-remediation-codex-2026-09/`

---

## 1 · Objectives & Scope

**Entra**: retest de F2/F9 (`NOT_RETESTED`), cierre de F1/F5/F6/F8 (`PARTIALLY_FIXED`), y cierre de
los 10 flags `false` de `evidence_coverage` (`STAGING_BROWSER_COVERED`, `PREVIEW_BROWSER_COVERED`,
`OWNER_COVERED`, `PLANNER_COVERED`, `TEAM_IMPORT_COVERED`, `IDEMPOTENCY_COVERED`,
`SAFE_DELETE_COVERED`, `PUBLISH_COVERED`, `APPROVAL_COVERED`, `CREDENTIAL_EXPORT_COVERED`).

**No entra explícitamente**: ningún finding CX-F0x/CX-E01 nuevo (ya cerrados en Fase 1-3). Ninguna
promoción de `PARTIAL`/`NOT_EVALUATED` a `PASS` por conveniencia narrativa — regla de integridad de
`00_PRODUCT_SPEC.md`.

## 2 · Criterios de entrada (gate de admisión)

- [ ] Fase UXR-F3 en `GATE PASS` o `GATE PASS_WITH_GAPS` documentado.
- [ ] Fase UXR-F2 en `GATE PASS` o `GATE PASS_WITH_GAPS` (dependencia de `UXR-F4-M06` sobre
      `UXR-F2-M04`).
- [ ] Cuentas sintéticas OWNER/PLANNER/Personal/sin-org disponibles (`UXR-F0-M07` + provisión ad hoc
      de `UXR-F4-M01`/`M02`).
- [ ] Autorización explícita de mutación de datos sintéticos para `UXR-F4-M03`, `M08`, `M09`.

## 3 · Criterios de salida (gate de aceptación)

### 3.1 Funcionales — todos los AC de las microtareas de la fase

- [ ] UXR-F4-M01 · AC-1 — retest F2 declarado explícitamente (nunca `NOT_RETESTED` de nuevo).
- [ ] UXR-F4-M02 · AC-1 — retest F9 declarado explícitamente (nunca `NOT_RETESTED` de nuevo).
- [ ] UXR-F4-M03 · AC-1 — importación confirmada persiste tras recarga/reconsulta.
- [ ] UXR-F4-M04 · AC-1 — `AGENTS.md`/`README.md` coherentes con el modelo real verificado.
- [ ] UXR-F4-M05 · AC-1 — editor/tabla/métricas retesteados individualmente (histórico F6).
- [ ] UXR-F4-M06 · AC-1 — landing vs. resumen de import sin contradicción (histórico F8).
- [ ] UXR-F4-M07 · AC-1 — `OWNER_COVERED`/`PLANNER_COVERED` → `true` o `PARTIAL` documentado.
- [ ] UXR-F4-M08 · AC-1 — `PUBLISH_COVERED`/`APPROVAL_COVERED` → `true` con evidencia por paso.
- [ ] UXR-F4-M09 · AC-1 — reimportación sin duplicados (idempotencia por fingerprint).
- [ ] UXR-F4-M09 · AC-2 — borrado de turno importado: turnos manuales y de otros imports sobreviven.
- [ ] UXR-F4-M10 · AC-1 — `TEAM_IMPORT_COVERED` → `true`.
- [ ] UXR-F4-M11 · AC-1 — credencial de un solo uso no recuperable tras cerrar la pantalla.
- [ ] UXR-F4-M12 · AC-1 — `STAGING_BROWSER_COVERED`/`PREVIEW_BROWSER_COVERED` → `true` o
      `ENVIRONMENT_BLOCKED` explícito.

### 3.2 No regresión — DO_NOT_BREAK

- [ ] Ningún futuro se publica automáticamente (verificado en el ciclo completo de `UXR-F4-M08`).
- [ ] Una sola OWNER por organización en todo momento (`ADR-2026-09-07` D7).
- [ ] Anti-autoaprobación respetada en `UXR-F4-M08` (`ADR-2026-09-07` D11).
- [ ] Conflicto de re-importación = organization + employee + fingerprint, nunca sólo fecha
      (`UXR-F4-M09`).
- [ ] Turnos manuales e imports ajenos sobreviven a cualquier borrado/reimportación (`UXR-F4-M09`,
      condición transversal de la Fase 4).
- [ ] Credenciales de un solo uso nunca recuperables tras el primer cierre (`UXR-F4-M11`).

### 3.3 Calidad automatizada (umbral: cero tolerancia)

- [ ] `npm test` — 100% verde, sin tests eliminados ni `.skip` nuevos.
- [ ] `npx tsc --noEmit` — 0 errores.
- [ ] `npm run lint` — 0 errores, 0 warnings (`--max-warnings 0`).
- [ ] `npm run build` — success.

### 3.4 Matriz de evidencia visual

- [ ] Journeys OWNER/PLANNER completos capturados (`UXR-F4-M07`).
- [ ] Ciclo publicar→consultar→acuse→solicitar→resolver capturado paso a paso (`UXR-F4-M08`).
- [ ] `hide-scrollbars=false` en toda medición de overflow que aplique.

### 3.5 Accesibilidad

- [ ] N/A directo (fase de verificación de cobertura, sin nueva UI) — hereda el estado de
      accesibilidad ya verificado en Fase 1-3.

### 3.6 Scorecards — objetivo de mejora declarado

| Dimensión | Antes (auditoría) | Objetivo de la fase |
|---|---|---|
| Task Completion (APPLICATION) | NOT_EVALUATED | FAIR (con `UXR-F4-M08`/`M09` como evidencia end-to-end) |
| Error Recovery | FAIR | GOOD |
| Onboarding | NOT_EVALUATED | FAIR (con `UXR-F4-M02`) |

## 4 · Evidencia adjunta

| Artefacto | Ruta | Quién lo generó | Fecha |
|---|---|---|---|
| *(vacío — se rellena al implementar)* | | | |

## 5 · Gate Status

**PENDING** — pasa a `PASS` o `PASS_WITH_GAPS` sólo cuando las 12 microtareas de Fase 4 tengan
evidencia adjunta en §4 y las casillas de §3 estén marcadas con justificación. Un flag que quede
`ENVIRONMENT_BLOCKED` con motivo documentado (p.ej. `UXR-F4-M12` sin entorno staging accesible) no
impide `PASS_WITH_GAPS`, pero sí impide `PASS` sin calificar.
