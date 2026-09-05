# 00-ROADMAP-MASTER — Anclora ShiftImport MVP v2

Baseline: [00-BASELINE.md](./00-BASELINE.md) @ HEAD `3d866e0`, branch `development`.

Microfases adapted from the master prompt's suggested breakdown, fused where the baseline shows a part is already fully closed, split where the baseline shows real remaining work. "Repo status" reflects what exists TODAY, before any microfase work starts — it is not a Gate result.

## R0 — Product & Architecture Rebaseline

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R0-M00 | Repository Preflight | DONE (this session) | — | 1 | G0 |
| R0-M01 | Product Contract Rebaseline (README ES/EN → B2B/B2B2E, drop "Phase 0"/B2C language) | MISSING — docs contradict code | R0-M00 | 4 | G0, G14 |
| R0-M02 | Domain Glossary & Boundaries (Org/Employee/Area/Import/Shift/Membership vocab, canonical terms) | PARTIAL — vocab exists in code, not centrally documented | R0-M00 | 4 | G0, G14 |
| R0-M03 | Authorization Model Baseline (2 roles → OWNER/ADMIN/PLANNER/EMPLOYEE + ORGANIZATION/AREA/SELF scopes, OWNER backfill decision) | PARTIAL — only ADMIN/EMPLOYEE exist today | R0-M02 | 8 | G1, G2, G3, G4 |
| R0-M04 | Shift / Request State Model (formalize Shift lifecycle DRAFT/PUBLISHED/LOCKED/COMPLETED as forward design; document Acknowledgement and Change Request as separate future state machines) | MISSING for future states; import-time shift creation is DONE | R0-M02 | 5 | G1, G3, G14 |
| R0-M05 | Architecture & Module Boundaries (decide `api/_lib/data.js` split strategy, decide dashboard routing approach for R3/R4) | NEEDS_HARDENING — data.js is 1524 lines, no router split | R0-M03, R0-M04 | 6 | G1, G15 |
| R0-M06 | Documentation Reconciliation (sync docs/standards, docs/product with R0-M01..M05 decisions) | PARTIAL | R0-M01..M05 | 4 | G14 |
| R0-M07 | R0 Final Gate | — | R0-M00..M06 | 1 | G0-G15 (subset per spec) |

## R1 — Safe Import Completion

Baseline shows R1 is the most mature area of the product. Most microfases below are ALREADY DONE and require a hardening/verification pass + spec-as-documentation, not new implementation. Only gaps get real task lists.

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R1-M00 | Import Engine Baseline (document `src/ingestion/` architecture as the spec of record) | DONE — document only | R0-M07 | 2 | G14 |
| R1-M01 | Format Detection Contract (structureHash, format_profiles lifecycle) | DONE | R1-M00 | 2 | G14, G10 |
| R1-M02 | Employee Resolution Contract (external_employee_id matching, team-roster detection) | DONE | R1-M00 | 2 | G14, G10 |
| R1-M03 | Analyze Stage | DONE | R1-M00 | 2 | G14, G10 |
| R1-M04 | Review Stage | DONE | R1-M03 | 2 | G14, G6, G10 |
| R1-M05 | Compare Stage (X new / Y modified / Z duplicate / N ignored / M error summary before confirm) | PARTIAL — verify UI surfaces this exact breakdown pre-confirm | R1-M04 | 3 | G6, G10, G11 |
| R1-M06 | Confirm Stage (no writes before confirm except necessary temp metadata) | DONE — verify invariant holds | R1-M05 | 2 | G3, G10 |
| R1-M07 | Idempotency | DONE — migration 0011 | R1-M06 | 1 | G2, G3, G10 |
| R1-M08 | Atomicity (import write is all-or-nothing) | NEEDS VERIFICATION — confirm transaction boundaries in `data.js` import path | R1-M06 | 3 | G2, G3, G10 |
| R1-M09 | Import History | DONE — migration 0010 | R1-M07 | 1 | G2, G10 |
| R1-M10 | Safe Delete / Logical Rollback | DONE — migration 0010 | R1-M09 | 1 | G2, G10 |
| R1-M11 | Learned Format Lifecycle | DONE — candidate/validated/verified/legacy/deprecated + race fixed (c863223) | R1-M01 | 1 | G14, G10 |
| R1-M12 | Unknown Format Recovery (NEEDS_USER_INPUT/BLOCKED/FAILED) | DONE — formalized 1ee5b8b, fb471bd | R1-M11 | 1 | G14, G10, G11 |
| R1-M13 | Individual vs Team Import | DONE | R1-M02 | 1 | G10 |
| R1-M14 | Import UX Premium (loading/empty/error/disabled states, no layout shift, reduced-motion) | NEEDS VERIFICATION | R1-M05 | 5 | G6, G7, G8, G9 |
| R1-M15 | Import E2E Matrix | PARTIAL — acceptance-corpus + qa/e2e-acceptance exist, CI-gating unconfirmed | R1-M06..M14 | 4 | G11, G13 |
| R1-M16 | R1 Final Gate | — | R1-M00..M15 | 1 | G0-G15 (subset per spec) |

## R2 — Organization Foundation

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R2-M00 | Existing Multi-Tenant Audit | DONE — covered in 00-BASELINE.md | R0-M07 | 1 | G14 |
| R2-M01 | Organization Settings | PARTIAL — `api/organizations/reset.js`, `api/onboarding.js` exist; full settings surface unverified | R2-M00 | 4 | G4, G6, G10 |
| R2-M02 | Employee Lifecycle | DONE — pending_access/active/inactive, migrations 0001/0005/0006, bulk-link fix 3d866e0 | R2-M00 | 1 | G3, G10 |
| R2-M03 | Areas | DONE — migration 0008 | R2-M00 | 1 | G2, G10 |
| R2-M04 | User ↔ Employee Linking | DONE — bug fixed 3d866e0 | R2-M02 | 1 | G3, G10 |
| R2-M05 | Bulk Provisioning | DONE — `MembersModal.tsx`, `credentials-export.ts` | R2-M04 | 1 | G10, G12 |
| R2-M06 | OWNER / ADMIN / PLANNER / EMPLOYEE roles | DONE — migration 0013/0014, backfill and invariant verified on Neon dev | R0-M03 | 6 | G2, G3, G4 |
| R2-M07 | ORGANIZATION / AREA / SELF Scopes | DONE — migration 0015, centralized resolver, scoped data queries and PLANNER UI | R2-M06 | 4 | G3, G4 |
| R2-M08 | API Authorization Enforcement (server-side, never UI-only) | DONE — centralized authentication/context and endpoint inventory verified | R2-M07 | 6 | G4, G12 |
| R2-M09 | Organization Audit Events | DONE — migration 0016, emission helper and OWNER/ADMIN endpoint | R2-M08 | 3 | G2, G10 |
| R2-M10 | Onboarding Reconciliation | DONE — onboarding crea OWNER y conserva la transacción existente | R2-M01, R2-M06 | 2 | G10 |
| R2-M11 | Cross-Tenant Isolation E2E | DONE — 5/5 E2E API/UI con seed/teardown Neon dev | R2-M08 | 3 | G11, G12, G13 |
| R2-M12 | R2 Final Gate | DONE — roles/scopes/auditoría/aislamiento y regresión R1 verificados | R2-M00..M11 | 1 | G0-G15 (subset per spec) |

## R3 — Future Scheduling

All MISSING at schema and app level. Full task lists required.

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R3-M00 | Scheduling Domain Baseline | DONE — PASS | R2-M12 | 3 | G1, G3 |
| R3-M01 | Schedule Schema | DONE — PASS | R3-M00 | 4 | G2 |
| R3-M02 | ScheduleVersion | DONE — PASS | R3-M01 | 4 | G2, G3 |
| R3-M03 | ShiftAssignment | DONE — PASS | R3-M02 | 4 | G2, G3 |
| R3-M04 | Draft Creation | DONE — PASS | R3-M03 | 4 | G4, G5 |
| R3-M05 | Assignment Editing | DONE — PASS | R3-M04 | 4 | G4, G5 |
| R3-M06 | Overlap Validation | DONE — PASS | R3-M05 | 3 | G3, G10 |
| R3-M07 | Rest Rule Baseline | DONE — PASS; product/legal approved 11h on 2026-09-04 | R3-M06 | 2 | G3, G10 |
| R3-M08 | Weekly Planner UI | DONE — PASS; `/app/schedule` route, API snapshot and grid, responsive/a11y smoke verified | R0-M05, R3-M07 | 3 | G6, G9 |
| R3-M09 | Accessible Table Alternative | DONE — PASS; semantic table, keyboard flow, persisted grid/table toggle and axe smoke verified | R3-M08 | 3 | G7 |
| R3-M10 | Publication | DONE — PASS; atomic publish, schedule provenance, inactive exclusion and confirmation UI verified | R3-M08 | 3 | G2, G3, G4, G5, G10 |
| R3-M11 | Published Version Locking | DONE — PASS; published/locked/completed immutability, independent new-draft copy and conditional UI verified | R3-M10 | 3 | G3, G5, G10 |
| R3-M12 | Version History | DONE — PASS; complete version metadata listing and read-only version viewer verified | R3-M11 | 2 | G2, G10 |
| R3-M13 | Authorization / Scope | DONE — PASS; role/scope matrix audited with negative role and cross-tenant tests | R2-M07, R3-M12 | 2 | G4, G12 |
| R3-M14 | Future Import → Draft Integration | DONE — PASS | R1-M16, R3-M04, R3-M05, R3-M13 | 5 | G3, G4, G5, G10, G12, G13, G15 |
| R3-M15 | E2E | DONE — PASS; browser flow verified twice, negative authz/cross-tenant and Safe Import regression verified | R3-M00..M14 | 2 | G11, G13 |
| R3-M16 | R3 Final Gate | DONE — PASS; matriz E2E compacta 16/16 y regresión unitaria PASS; R4 habilitado | R3-M00..M15 | 2 | G0-G15 (subset per spec) |

## R4 — Employee Portal

All MISSING. Depends on R0-M05 routing decision and R3 schedule data existing.

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R4-M00 | Employee IA / Navigation | DONE — PASS; shell EMPLOYEE aislado y bifurcación post-login verificada | R0-M05 | 3 | G1, G6 |
| R4-M01 | Today | DONE — PASS; endpoint SELF server-side y estados Today integrados | R4-M00, R3-M10 | 4 | G5, G6 |
| R4-M02 | My Week | DONE — PASS; semana SELF con siete buckets y navegación accesible | R4-M01 | 4 | G5, G6 |
| R4-M03 | Shift Detail | DONE — PASS; detalle SELF con 404 uniforme, navegación Hoy/My Week y foco restaurado | R4-M02 | 3 | G5, G6 |
| R4-M04 | Acknowledgement | DONE — PASS; estado independiente, endpoint SELF idempotente y UI integrada | R4-M03 | 4 | G2, G3, G5 |
| R4-M05 | Comments | DONE — PASS; comentarios SELF append-only, API C/R y composer integrado | R4-M04 | 3 | G2, G5 |
| R4-M06 | Change Request | DONE — PASS; solicitudes SELF con lifecycle independiente y cancelación propia | R4-M04 | 5 | G2, G3, G5 |
| R4-M07 | Request Status | DONE — PASS | R4-M06 | 3 | G5, G6 |
| R4-M08 | Employee Notifications Baseline | DONE — PASS | R4-M06 | 4 | G5 |
| R4-M09 | Mobile Bottom Navigation | DONE — PASS | R4-M00 | 2 | G6, G9 |
| R4-M10 | Responsive / Dark / Light | DONE — PASS | R4-M00..M09 | 3 | G9 |
| R4-M11 | Accessibility | DONE — PASS | R4-M00..M10 | 3 | G7 |
| R4-M12 | Employee E2E | DONE — PASS | R4-M00..M11 | 4 | G11, G13 |
| R4-M13 | R4 Final Gate | DONE — PASS | R4-M00..M12 | 1 | G0-G15 (subset per spec) |

## R5 — Approval Lite

All MISSING.

| Microfase | Objetivo | Repo status | Dependencias | Nº tasks (est.) | Gates |
|---|---|---|---|---:|---|
| R5-M00 | Approval Domain | DONE — PASS | R4-M13 | 3 | G1, G3 |
| R5-M01 | ApprovalPolicy (NO_APPROVAL / AREA_RESPONSIBLE / ORGANIZATION_ADMIN) | DONE — PASS | R5-M00, R2-M07 | 5 | G2, G3 |
| R5-M02 | Request Routing | DONE — PASS | R5-M01, R4-M06 | 3 | G3, G5 |
| R5-M03 | Approver Inbox | MISSING | R5-M02 | 4 | G5, G6 |
| R5-M04 | Approve | MISSING | R5-M03 | 3 | G4, G5 |
| R5-M05 | Reject with mandatory reason | MISSING | R5-M03 | 3 | G4, G5 |
| R5-M06 | Audit Trail | MISSING | R5-M04, R5-M05 | 3 | G2, G10 |
| R5-M07 | Apply Approved Change | MISSING | R5-M04 | 4 | G3, G5 |
| R5-M08 | Concurrency / Idempotency | MISSING | R5-M07 | 3 | G3, G10 |
| R5-M09 | Authorization | MISSING | R5-M01, R2-M08 | 3 | G4, G12 |
| R5-M10 | E2E | MISSING | R5-M00..M09 | 4 | G11, G13 |
| R5-M11 | R5 Final Gate | — | R5-M00..M10 | 1 | G0-G15 (subset per spec) |
| R5-M12 | MVP Release Gate | — | R0-M07, R1-M16, R2-M12, R3-M16, R4-M13, R5-M11 | 1 | full matrix per §20 of master prompt |

## POST-MVP (documented as macro specs only, no tasks yet)

| Doc | Scope |
|---|---|
| `POST-MVP/R6-WORKFLOW-ENGINE.md` | Workflow / WorkflowVersion / WorkflowRun / WorkflowStepRun, up to 3 steps initially |
| `POST-MVP/R7-ATTENDANCE.md` | AttendanceEvent / WorkSession, immutable events, no GPS/screenshots/biometrics |
| `POST-MVP/R8-RECONCILIATION-REPORTING.md` | Planned vs actual, discrepancy reporting |
| `POST-MVP/R9-ADVANCED-ORG-MODEL.md` | WorkCenter / Team / ReportingLine / CustomRole / RolePermission / RoleAssignment / Delegation — configurable, not a rigid hierarchy |

## Execution order

R0-M00 (done) → R0-M01 → R0-M02 → R0-M03 → R0-M04 → R0-M05 → R0-M06 → R0-M07 → R1-M00 → … → R1-M16 → R2-M00 → … → R2-M12 → R3-M00 → … → R3-M16 → R4-M00 → … → R4-M13 → R5-M00 → … → R5-M12 (MVP Release Gate).

Per master-prompt contract: one microfase executes at a time; Gate FAIL blocks progression; no push/merge/promote without explicit instruction.
