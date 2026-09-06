# Progress Status — MVP v2 Roadmap Execution

Última actualización: 2026-09-06, Gate P5.4 en `development`.

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

- **P0 — Baseline Truth & MVP Release Gate: MVP_NOT_READY.**
  - P0-M01: PASS — `13ab171`.
  - P0-M02: PASS — `313a7a2`.
  - P0-M03: PASS — `a765bcd` + `fcfd783`.
  - P0-M04: PASS — `809efbd`.
  - P0-M05: este snapshot documental.
  - P0-M06: PASS — `ceacb23`.
  - P0-M07: PASS — smoke compacto 4/4 PASS (43,3 s) + smoke API 72/72 PASS (16,3 s) + recorrido continuo 1/1 PASS (1m50,7 s) con 19
    capturas por hito, ES/light/desktop y pasada visual EN/dark/móvil.
  - P0-M08: PASS — aislamiento cross-tenant 4/4 PASS (OWNER/ADMIN/PLANNER/EMPLOYEE, 37,9 s) y matriz consolidada rol×scope×capacidad archivada en
    `P0-POST-AUDIT-COMPACT-EVIDENCE.md`.
  - P0-M09: PASS — idempotencia dirigida 1/1 PASS (12,6 s), invariantes 11/11 PASS mediante
    `scripts/verify-mvp-invariants.mjs` y migraciones desde cero 32/32 PASS en schema efímero
    mediante `scripts/verify-migrations-from-scratch.mjs`, todo contra Neon development.
  - P0-M10: PASS — `MVP_NOT_READY` formalizado en `R5-M12-mvp-release-gate.md`; no se emite `MVP_READY`.
- P1 — Trusted Import Completion: `PASS_WITH_GAPS`, commit `7f65138`; los intentos bloqueados y
  fallidos dejan resultado persistente y la migración `0033` fue validada en development.
- P2 — Plan Entitlement UX: `PASS_WITH_GAPS`, commit `c256928`; las capacidades bloqueadas por
  plan se anticipan con estado visible y explicación.
- P3 — Dialog Replacement & Copy Correctness: `PASS_WITH_GAPS`, commit `f797b2f`; los journeys de
  negocio ya no usan diálogos nativos y los errores quedan persistentes.
- P4 — Accessibility & Responsive Hardening: `PASS_WITH_GAPS`, commit `cc767b9`; runner compacto
  `test:p4` 1/1, tests dirigidos 45/45, lint y build PASS. El gap restante es el archivado de
  capturas comparativas, documentado en `docs/roadmap/P4-ACCESSIBILITY-RESPONSIVE-GATE.md`.
- P5 — Role Reality & Employee Self-Service: `PASS`; D-03, D-04 y D-05 están aprobadas y
  registradas en `sdd/decisions/`. Gate y evidencia en
  `docs/roadmap/P5-ROLE-REALITY-GATE.md`; smoke compacto `test:p5-role` 1/1 PASS.
- P5.1 — Premium Application Shell & Collapsible Sidebar: `PASS`; shell role-aware, topbar
  compacto, contexto y navegación mensual reubicados, drawer responsive y menú de cuenta. Gate,
  inventario y evidencia en `docs/roadmap/P5.1-PREMIUM-APPLICATION-SHELL-GATE.md` y
  `P5.1-SHELL-NAVIGATION-INVENTORY.md`.
- P5.2 — Operational Navigation & Time-Scope Consolidation: `PASS`; Importar/Añadir/Planificar,
  Approval Lite en navegación, shell y frontera temporal verificadas.
- P5.3 — Plan-Aware Organization Onboarding & Initial Governance: `PASS`; plan, OWNER válido,
  áreas y ADMIN opcionales, y separación User↔Employee preservados.
- P5.4 — Employee Self-Service Completion: `PASS_WITH_GAPS`; `Hoy`/`Semana`/`Solicitudes`/`Más`
  mantienen la IA del portal, con creación de ChangeRequest, self-import y alta histórica bajo
  SELF. Tests, lint, build y smoke E2E compacto pasan; queda pendiente la matriz de capturas
  visuales manuales para el Gate final del programa. P6 permanece sin iniciar.
- P8 — CRC Tryp Research: BLOCKED desde el origen porque el NotebookLM redirige a login y no
  existe una exportación accesible. No se inventará contenido de esa fuente.

## Por hacer en el roadmap MVP v2 histórico

- **R5-M12 — MVP Release Gate**: `MVP_NOT_READY` formalizado en §20.1; bloqueadores trazados a
  P0 (pasada funcional completa EN/dark/mobile y checklist final) y P1 (persistencia de intentos
  no completados). Los hallazgos axe `button-name`, `landmark-one-main` y `region` ya están
  corregidos y cubiertos por el runner focalizado.
- **POST-MVP R6–R9**: Workflow Engine, Attendance, Reconciliation & Reporting y Advanced Org Model;
  no se implementan antes de validar el MVP.

## Hallazgos y gaps conservados

- R1-M09: persistencia de intentos bloqueados/fallidos pendiente de P1.
- R3: la batería E2E exhaustiva quedó sustituida por una matriz compacta determinista; el gate
  documenta los timeouts del harness como warning no funcional.
- La evidencia de esta reducción está archivada en
  `P0-POST-AUDIT-COMPACT-EVIDENCE.md`; el perfil compacto reduce esperas sin rebajar los criterios
  de aceptación del programa.
- Gaps de auditoría aún abiertos para el programa: formatos no CSV, import de equipo, modo
  invitado, OAuth y recuperación de contraseña.
- Se conservan como fuera de alcance: billing, verificación de email, infraestructura de correo,
  rate limit distribuido, integración del design system y refactor global de `src/App.tsx`.

## Decisiones pendientes

- **D-03, D-04 y D-05**: aprobadas, implementadas y cerradas con `PHASE_P5_GATE = PASS`; evidencia
  en `docs/roadmap/P5-ROLE-REALITY-GATE.md`.
- **D-07 / P8**: la fuente CRC Tryp sigue inaccesible; se requiere exportación, fuentes originales,
  acceso autenticado autorizado o cancelación explícita de P8.
