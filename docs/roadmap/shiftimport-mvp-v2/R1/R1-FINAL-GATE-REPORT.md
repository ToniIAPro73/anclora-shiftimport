# R1 Final Gate Report

## T01 — Aggregate of R1-M00..M15

| Microfase | Gate result | Notable finding |
|---|---|---|
| R1-M00 Import Engine Baseline | PASS | Full `src/ingestion/` module inventory, no discrepancy |
| R1-M01 Format Detection Contract | PASS_WITH_WARNINGS | `verified` status declared, never triggered (non-blocking); E2E deferred to M15 |
| R1-M02 Employee Resolution Contract | PASS | No cross-tenant leak confirmed |
| R1-M03 Analyze Stage | PASS | i18n/accessibility confirmed compliant |
| R1-M04 Review Stage | PASS | Focus/keyboard confirmed compliant |
| **R1-M05 Compare Stage** | **PASS** | **Real gap fixed**: team import preview was missing duplicates/ignored/errors counts pre-confirm — now shows all 5 required categories |
| R1-M06 Confirm Stage | PASS | Write-before-confirm invariant verified, no violation |
| **R1-M08 Atomicity** | **PASS** | **Real gap fixed**: `upsertShifts` had no wrapping transaction — a mid-batch failure left partial writes; now atomic via `sql.transaction` |
| R1-M07 Idempotency | PASS | Both idempotency scenarios structurally guaranteed by unique indexes |
| R1-M09 Import History | PASS_WITH_WARNINGS | Failed imports are never persisted to history (no code path sets `status='failed'`) — real gap, deliberately not fixed here (needs product decision on failure semantics), carried forward as a known item below |
| R1-M10 Safe Delete / Logical Rollback | PASS | Already exhaustively tested, no gap |
| R1-M11 Learned Format Lifecycle | PASS | No regression since c863223 |
| R1-M12 Unknown Format Recovery | PASS | `BLOCKED`-terminal decision ratified, pipeline parity confirmed |
| R1-M13 Individual vs Team Import | PASS | Contract diff documented |
| **R1-M14 Import UX Premium** | **PASS** | **Real gap fixed**: `prefers-reduced-motion` not respected by the import spinner — fixed with a reusable `.icon-spin` class |
| R1-M15 Import E2E Matrix | PASS | CI already covers the acceptance-corpus; Playwright suite gap is a deliberate scope boundary, not a regression |

All 16 individual Gates: PASS or PASS_WITH_WARNINGS with the warning explicitly documented and non-blocking. No FAIL, no BLOCKED.

## Security check (section 11)

No cross-tenant leak found anywhere in R1 (R1-M02, R1-M07, R1-M09, R1-M10 each explicitly verified organization-scoping). No security-relevant warning is open.

## T01 — Full suite at R1 close

- `npm test`: **96 test files, 983 tests, all passing**.
- `npm run build` (`tsc && vite build`): **PASS**. Pre-existing chunk-size warning, unrelated to R1 changes.
- `npm run lint`: **PASS**, zero warnings.

## Real fixes shipped in R1 (not just documentation)

1. **R1-M05**: team import now surfaces new/modified/duplicate/ignored/error counts before confirm (previously only 3 of 5 required categories were shown).
2. **R1-M08**: `upsertShifts` batch writes are now atomic — a bad shift anywhere in a batch no longer leaves earlier shifts committed.
3. **R1-M14**: the import flow's loading spinner now respects `prefers-reduced-motion`.

## Known items carried forward (not blocking R1 close)

- **R1-M09**: failed imports are not persisted to history (no `status='failed'` code path exists). Requires a product decision on failure semantics (whole-batch vs per-employee granularity) before implementation. Not assigned to a specific future microfase in the current R2-R5 roadmap — flag for product/backlog triage before R1's gap is considered fully resolved, or address opportunistically if a future microfase touches the confirm-write path again.
- **R1-M01**: `format_profiles.status` includes a declared `verified` value with no code path that ever sets it — reserved for a future automatic-promotion trigger (e.g. after N successful uses). Not blocking, not scheduled.
- **R1-M15**: Playwright `qa/e2e-acceptance/` suite is not CI-gated (requires new GitHub Actions secrets + browser install). Intentional scope boundary, not a regression.

## Aggregate Gate result

**PASS.** All 16 individual R1 Gates closed. Three real, concrete gaps were found during verification and fixed in-session (not deferred): the 5-category compare summary, shift-write atomicity, and reduced-motion compliance. One real gap (failed-import history) is deliberately left open pending a product decision, documented transparently rather than silently accepted or forced through without design. Full test/build/lint suite green at close. R2-M00 may begin.
