# UXR — Master Gate Document: UX Remediation Codex 2026-09

## Summary
- **Status**: MASTER GATE PENDING
- **Date**: <vacío hasta cierre>
- **Target Branch**: `development`
- **Specification Document**: `sdd/features/ux-remediation-codex-2026-09/`
- **Fuente de findings**: `docs/audits/anclora-shiftimport-ux-reaudit-codex-2026-09-09.json`
  (`PASS_WITH_GAPS`, HEAD `42ff86995ad8a486af79d9d900ab3b069fff4a8e`)

---

## 1 · Resumen ejecutivo

Esta spec convierte los 10 findings (`CX-F01`…`CX-F09`, `CX-E01`) y las brechas de cobertura de la
re-auditoría UX/UI Codex del 2026-09-09 en un plan ejecutable de 36 microtareas repartidas en 5
fases. Ningún finding queda huérfano; los 9 históricos F1–F9 y los 10 flags de `evidence_coverage`
en `false` tienen destino explícito (ver `sdd/features/ux-remediation-codex-2026-09/00_PRODUCT_SPEC.md`
§6-7). Ninguna microtarea amplía permisos, scopes o roles; ninguna reabre las decisiones de producto
vigentes (`PD-2026-09-06-P5.5-future-import-draft-scheduling.md`,
`ADR-2026-09-07-P5.7-team-roles-scopes.md`).

**Este gate maestro, y los 5 gates de fase que agrega, están en `GATE PENDING` en el momento de
entrega de esta spec.** Ningún código de producto ha sido modificado.

## 2 · Resumen de entrega por fase

| Fase | Descripción | Microtareas | Estado | Gate Document |
|---|---|---|---|---|
| UXR-F0 | Línea base y harness | 8 (`M01`-`M08`) | **PENDING** | `UXR-F0-BASELINE-HARNESS-GATE.md` |
| UXR-F1 | Quick wins (CX-F03, CX-F08, CX-F09, CX-E01) | 4 (`M01`-`M04`) | **PENDING** | `UXR-F1-QUICK-WINS-GATE.md` |
| UXR-F2 | Alto impacto (CX-F01, CX-F04, CX-F05) | 6 (`M01`-`M06`) | **PENDING** | `UXR-F2-HIGH-IMPACT-GATE.md` |
| UXR-F3 | Estructura (CX-F02, CX-F06, CX-F07) | 6 (`M01`-`M06`) | **PENDING** | `UXR-F3-STRUCTURE-GATE.md` |
| UXR-F4 | Cierre de evidencia (históricos + flags) | 12 (`M01`-`M12`) | **PENDING** | `UXR-F4-EVIDENCE-CLOSURE-GATE.md` |

Total: **36 microtareas**, 0 en `PASS`, 36 en `PENDING`.

## 3 · Dependencias críticas de la ruta larga

1. `UXR-F0-M05` (scrollbars visibles) y `UXR-F0-M06` (rutas absolutas) bloquean toda medición fiable
   de overflow de Fase 2-3.
2. `UXR-F1-M04` (fixture CX-E01 corregido) es dependencia dura declarada por la propia auditoría de
   `UXR-F2-M05`/`M06` (CX-F05) — sin fixture cargable, la clasificación de provisioning no se puede
   validar por la ruta de usuario real.
3. `UXR-F2-M05` → `UXR-F2-M06` → `UXR-F3-M05` → `UXR-F3-M06` → `UXR-F4-M10` es la cadena más larga
   (CX-F05 lib → CX-F05 UI → entrada unificada en Equipo → contexto conservado → cierre de
   `TEAM_IMPORT_COVERED`).
4. `UXR-F0-M07` (cuentas OWNER/PLANNER) alimenta tanto `UXR-F4-M07` como `UXR-F3-M03`/`M08` (el
   ciclo publicar→acuse→solicitud→resolución necesita roles con permiso de publicación).
5. `UXR-F2-M04` (CX-F04 UI) y `UXR-F3-M02` (CX-F02) son precondición de `UXR-F4-M06` y `UXR-F4-M05`
   respectivamente (verificación de cierre de históricos F8 y F6).

## 4 · Findings cubiertos (verificación de completitud)

Los 10 findings de la auditoría Codex 2026-09-09 están cubiertos:
`CX-F01, CX-F02, CX-F03, CX-F04, CX-F05, CX-F06, CX-F07, CX-F08, CX-F09, CX-E01`.
Ver tabla de trazabilidad completa en
`sdd/features/ux-remediation-codex-2026-09/06_FINAL_REPORT.md` §B.

## 5 · Fuera de alcance (declarado, no una omisión)

- Billing/Stripe, cambios de precio comercial, integraciones de calendario externo, VLM/OCR nuevos,
  app móvil nativa, rediseño global.
- Reinstauración de `PortalShell` como segunda superficie productiva.
- Certificación legal o de accesibilidad (cualquier hallazgo con matiz legal se etiqueta
  `COMPLIANCE_REVIEW`, no se resuelve aquí).
- Resolución del registro de gobernanza de contratos de diseño (`MODAL_CONTRACT.md`,
  `LOCALIZATION_CONTRACT.md`, `ANCLORA_PREMIUM_APP_CONTRACT.md`) respecto a si aplican formalmente a
  `anclora-shiftimport` — nota no bloqueante documentada en
  `sdd/features/ux-remediation-codex-2026-09/00_PRODUCT_SPEC.md` §4.4.

## 6 · Level 4 Master Verification Results

*(vacío hasta que las 5 fases alcancen su gate individual — no se declara verificación agregada sin
que cada fase la haya producido primero)*

- **Vitest**: pendiente.
- **ESLint**: pendiente.
- **TypeScript**: pendiente.
- **Vite Production Build**: pendiente.
- **Zero PII committed**: a verificar en cada fase (todos los datos de validación son sintéticos por
  diseño de esta spec).
- **Git Commit Discipline**: pendiente — ningún commit se ha realizado desde esta spec; la
  implementación futura debe seguir commits semánticos pequeños por microtarea, sin promoción a
  `staging`/`production` sin autorización.

## 7 · Gate Status

**MASTER GATE PENDING** — ninguna fase ha alcanzado `PASS`. Este gate maestro pasa a
`MASTER GATE PASS` (o `PASS_WITH_GAPS` si algún flag queda `ENVIRONMENT_BLOCKED`/`NOT_EVALUATED`
justificado) sólo cuando los 5 gates de fase (`UXR-F0`…`UXR-F4`) hayan sido actualizados con
evidencia real y ninguno esté por debajo de `PASS_WITH_GAPS`.
