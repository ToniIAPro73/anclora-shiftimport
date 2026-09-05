# Progress Status — MVP v2 Roadmap Execution

Última actualización: 2026-09-05, cierre documental P0 en `development`.

Este documento es un snapshot de progreso, no una spec. Para continuar el programa posterior a la
auditoría UX/UI, léase junto con [`00-BASELINE.md`](./00-BASELINE.md),
[`00-ROADMAP-MASTER.md`](./00-ROADMAP-MASTER.md) y el [roadmap P0–P8](../ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md).

## Baseline verificado

- Rama canónica: `development` (excepción AOS `EX-SI-001` vigente).
- HEAD de referencia al iniciar el programa: `36e78573c01f968a71cef6066249d0ce2f008576`.
- `origin/development` coincidía con ese HEAD; worktree limpio antes de añadir el programa.
- R0–R5 estaban cerrados; el único gate histórico pendiente era R5-M12.

## Hecho

### Fase de specs histórica

- `00-BASELINE.md`, `00-ROADMAP-MASTER.md` y 86 specs R0–R5 + POST-MVP generadas.

### R0 — Product & Architecture Rebaseline: COMPLETO (PASS)

- Gate agregado: PASS, commit `3b6b54e` (`R0-FINAL-GATE-REPORT.md`).
- Contratos, glosario, límites de módulos y modelo OWNER/ADMIN/PLANNER/EMPLOYEE con scopes
  documentados. La decisión de routing se corrigió contra el `route.ts` existente.
- El backfill de OWNER quedó inicialmente como warning absorbido por R2-M06 y después fue
  ejecutado con sign-off de producto.

### R1 — Safe Import Completion: COMPLETO (PASS)

- Gate agregado: PASS, commit `46968a3` (`R1-FINAL-GATE-REPORT.md`).
- Hallazgos reales corregidos: resumen Compare con las cinco categorías (R1-M05), atomicidad de
  `upsertShifts` (R1-M08) y `prefers-reduced-motion` del spinner (R1-M14).
- Hallazgo abierto heredado: los imports bloqueados/fallidos no se persistían en histórico
  (R1-M09). Se absorbe en P1 del programa post-auditoría; no se considera resuelto por este
  snapshot.

### R2 — Organization Foundation: COMPLETO (PASS)

- Gate agregado: PASS, commit `974fe68` (`R2-M12-r2-final-gate.md`).
- Incluye áreas, linking User↔Employee, provisioning, OWNER/ADMIN/PLANNER/EMPLOYEE, scopes,
  autorización server-side, auditoría, onboarding y aislamiento cross-tenant.
- Hallazgo de datos histórico: 16 empleados vinculados atascados en `pending_access` fueron
  reconciliados en Neon development con aprobación explícita, antes del cierre de R2.

### R3 — Future Scheduling: COMPLETO (PASS)

- Gate agregado: PASS, commit `6a50266` (`R3-M16-r3-final-gate.md`).
- Scheduling futuro, drafts, publicación, scopes, multiweek, idempotencia y rollback validados.

### R4 — Employee Portal: COMPLETO (PASS)

- Gate agregado: PASS, commit `f75d302` (`R4-M13-r4-final-gate.md`).
- Portal Hoy/Semana/Solicitudes/Más, acknowledgements y change requests validados.

### R5 — Approval Lite: COMPLETO (PASS)

- Gate agregado: PASS, commit `4b4a346` (`R5-M11-r5-final-gate.md`).
- ApprovalPolicy, routing, decisiones, aplicación, auditoría y concurrencia validados.

## Programa post-auditoría

- **P0 — Baseline Truth & MVP Release Gate: EN EJECUCIÓN.**
  - P0-M01: PASS — `13ab171`.
  - P0-M02: PASS — `313a7a2`.
  - P0-M03: PASS — `a765bcd` + `fcfd783`.
  - P0-M04: PASS — `809efbd`.
  - P0-M05: este snapshot documental.
  - P0-M06: PASS — `ceacb23`.
  - P0-M07: PARCIAL — smoke compacto 4/4 PASS (43,3 s) + smoke API 72/72 PASS (16,3 s) + recorrido continuo 1/1 PASS (1m37,2 s); faltan
    capturas/axe/responsive ES/EN completas.
  - P0-M08: PARCIAL — matriz compacta de roles/tenant PASS; falta completar la tabla
    rol×scope×endpoint exigida por el Gate.
  - P0-M09: PARCIAL — idempotencia en smoke compacto e invariantes 11/11 PASS mediante
    `scripts/verify-mvp-invariants.mjs`; falta cerrar la evidencia agregada del Gate.
  - P0-M10: pendiente — no se emite todavía `MVP_READY`.
- P1–P7: pendientes; se ejecutan secuencialmente tras el Gate P0.
- P8 — CRC Tryp Research: BLOCKED desde el origen porque el NotebookLM redirige a login y no
  existe una exportación accesible. No se inventará contenido de esa fuente.

## Por hacer en el roadmap MVP v2 histórico

- **R5-M12 — MVP Release Gate**: pendiente de ejecución agregada; P0-M07..M10 lo absorben.
- **POST-MVP R6–R9**: Workflow Engine, Attendance, Reconciliation & Reporting y Advanced Org Model;
  no se implementan antes de validar el MVP.

## Hallazgos y gaps conservados

- R1-M09: persistencia de intentos bloqueados/fallidos pendiente de P1.
- R3: la batería E2E exhaustiva quedó sustituida por una matriz compacta determinista; el gate
  documenta los timeouts del harness como warning no funcional.
- La evidencia de esta reducción está archivada en
  `P0-POST-AUDIT-COMPACT-EVIDENCE.md`; el perfil compacto reduce esperas sin rebajar los criterios
  de aceptación del programa.
- Gaps de auditoría aún abiertos para el programa: validación browser de roles ADMIN/PLANNER/
  EMPLOYEE, formatos no CSV, import de equipo, modo invitado, OAuth y recuperación de contraseña.
- Se conservan como fuera de alcance: billing, verificación de email, infraestructura de correo,
  rate limit distribuido, integración del design system y refactor global de `src/App.tsx`.

## Decisiones que mantienen bloqueos

- **D-04**: el comportamiento exacto del self-import de EMPLOYEE cuando el fichero contiene otras
  personas y su alcance temporal no está decidido. P5 quedará BLOCKED hasta recibir esa decisión.
- **D-07 / P8**: la fuente CRC Tryp sigue inaccesible; se requiere exportación, fuentes originales,
  acceso autenticado autorizado o cancelación explícita de P8.
