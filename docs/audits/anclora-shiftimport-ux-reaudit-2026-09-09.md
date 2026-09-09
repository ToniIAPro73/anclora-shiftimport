# Anclora ShiftImport — UX/UI Product Re-Audit

**Skill:** `ux-product-experience-review` v1.5.0 (SKILL.md + runtime evidence; `skill.yaml` still declares 1.4.0 — logged as an engineering-support finding)
**Skill source:** `~/Developer/anclora/anclora-infrastructure/skills/ux-product-experience-review`
**Date:** 2026-09-09
**Repository:** `anclora-shiftimport` · Branch: `development`
**Old HEAD:** `36e7857` (2026-09-05) · **Current HEAD:** `42515c3` — 76 commits between audits, matching `origin/development` (no local/remote divergence)
**Canonical frontend URL:** `https://shiftimport.anclora.com`
**Mode:** `AUDIT_WITH_REPO_CONTEXT`

**Primary surface:** `APPLICATION` (override, matches auto-detection: auth routes, persistent state, CRUD, recurring tasks)
**Secondary surface:** `LANDING_PAGE` (public marketing/pricing site at the app's root domain — real, materially different from the app shell)
**Platform mode:** `WEB` (override)

**Status:** `PASS_WITH_GAPS` — see [Evidence Coverage](#evidence-coverage) and [Limitations](#limitations--gaps).

---

## 00. Index

1. Executive Summary
2. What Changed Since the Previous Audit
3. Methodology Delta
4. Surface Classification
5. Current Product Model
6. Product Promise vs Observed Experience
7. Safe Import — Deep Dive
8. Application Shell & Responsive
9. Light / Dark & i18n
10. Historical Regression Matrix
11. Scorecards
12. What Works Well
13. Findings — Product UX / Access
14. Supporting Engineering Findings
15. Quick Wins & Roadmap
16. DO_NOT_BREAK
17. Evidence Coverage
18. Limitations & Gaps
19. Final Answers

---

## 1. Executive Summary

Anclora ShiftImport's core promise — turn an existing PDF/Excel/CSV schedule into a reviewable, structured calendar without writing anything until the organization confirms it — **is real, live in production, and can be exercised end-to-end without an account** through a "Continuar sin cuenta" (guest) entry point at `/app`. That guest path gave this audit genuine `MEASURED_BROWSER` / `PRODUCTION` evidence for Safe Import, the calendar workspace, the format-recovery assistant, and the future-shift routing decision — the parts of the product the September 5 audit could only partially exercise.

**Biggest user friction:** at 390×844 the calendar's day grid and the "Propios/Empresa" stats ribbon are both wrapped in nested horizontal-scroll containers roughly 2–3× wider than the viewport, with no visible scrollbar, edge fade, or affordance. Four of seven weekday columns (Thursday–Sunday) are invisible unless the user discovers they can swipe sideways inside the grid. This is the same class of defect flagged as OLD-F6 on 2026-09-05 — it is **still present**, now measured precisely (`scrollWidth` 780px vs `clientWidth` 370px on `.month-grid-shell`; 1135px vs 370px on `.totals-ribbon`).

**Biggest quick win:** the "Procesar archivo" button in the import dialog stays visibly `disabled` even after the file has already been parsed and the results table is populated — a small state-clarity inconsistency, cheap to fix.

**Biggest structural opportunity:** none identified that would require reshaping the application shell — the desktop shell (role-aware sidebar, compact header, calendar-first workspace) is sound and should be preserved as the mobile layout is fixed.

**Overall assessment:** six of the seven retestable historical findings are **fixed** with direct code or browser evidence — a real, verifiable improvement, not a cosmetic one. The one that is not fixed (mobile overflow) is a genuine regression risk if left unaddressed, because it sits on the primary workspace of an `APPLICATION` surface. Large parts of the authenticated, multi-tenant product (RBAC, Team management, bulk provisioning, Employee Portal, scheduling publish, import history/auditability) could not be exercised live in this session — not because they don't exist, but because the local API layer requires an interactive Vercel OAuth login this read-only audit could not and should not complete. That coverage gap is the reason for `PASS_WITH_GAPS`, not a defect in the product itself.

---

## 2. What Changed Since the Previous Audit

The September 5 audit (`36e7857`) landed nine findings. The very next commits on `development` were `268489b docs(roadmap): add post-UX audit execution program` and `13ab171 docs(agents): align role model with runtime` — the team built a remediation program directly off that audit. In the 76 commits since, the roles/scopes model was formalized (P5.7 series: personas, RBAC, areas, planner scopes, ownership transfer, effective-dated assignments), and multiple UX-adjacent fixes shipped (dark/light theme consistency hotfix, input-focus preservation in the team modal, ownership-transfer guardrails).

This audit independently re-derived the product model from current code and browser evidence rather than trusting that roadmap — see [Historical Regression Matrix](#10-historical-regression-matrix) for the retest of each specific 2026-09-05 finding.

---

## 3. Methodology Delta

- The installed skill's `SKILL.md` header and runtime (`aos-runtime/lib/ux_product_experience_review.py`) both carry v1.5.0 behavior (`finding_scope`, `browser_environment` provenance, `TOOL_COMPATIBILITY_GAP`, `deployed_surface_covered`, `LEGAL_REVIEW_REQUIRED`), while `skill.yaml`'s `version` field still reads `1.4.0`. Per `CURRENT_INSTALLED_SKILL_WINS`, v1.5.0 (SKILL.md + runtime) governs this report; the version-field lag is logged under [Supporting Engineering Findings](#14-supporting-engineering-findings).
- `docs/VALIDATION.md` referenced by the master prompt does not exist in the skill package; only `docs/RELEASE_NOTES.md` does. Not fabricated.
- The master prompt's 46-section template predates the installed skill's actual **Output Report v2** structure (Section 37 of `SKILL.md`, 35 named sections). This report follows the current skill's schema and vocabulary (finding scope, evidence levels, `NOT_EVALUATED` vs `NOT_APPLICABLE`, adaptive scorecards) and folds the master prompt's mandatory additions — historical regression matrix, methodology delta, HTML integrity validation — in as extensions, since neither conflicts with the current schema.
- Composed AOS skills (`accessibility-audit`, `visual-regression-check`, `design-system-consumer-check`, `i18n-integrity-check`, `repo-preflight`, `aos-compliance-preflight`, `change-impact-analysis`) were **not** invoked as separate tool calls in this session — this agent has no dispatcher access to them. Where this report makes accessibility or i18n observations, they are direct `MEASURED_BROWSER`/`MEASURED_CODE` observations, not composed-skill output. Reported as `UNAVAILABLE`, not silently treated as `COMPLETED`.
- Credential/environment reality (see [Evidence Coverage](#17-evidence-coverage)) diverged from what a prior audit of this product may have assumed: `vercel dev` (this repo's own documented way to run `/api/*` locally per `docs/roadmap/**` and `qa/e2e-acceptance/playwright.local.config.ts`) requires an interactive OAuth device-flow login. This agent will not complete an account login on the user's behalf, so authenticated local API coverage was not achievable this session. A synthetic-seed database write (`scripts/seed-manual-demo.mjs`) was deliberately **not** executed, because without a working local API it would have produced a write with zero evidentiary benefit.

---

## 4. Surface Classification

| Field | Value | Source |
|---|---|---|
| `SURFACE_MODE` | `APPLICATION` | Override (matches auto-detection: auth routes, `/app` persistent workspace, CRUD, recurring calendar task) |
| `SURFACE_MODE_SOURCE` | `OVERRIDE` (confirmed by `CODE+BROWSER`) | — |
| `SURFACE_MODE_CONFIDENCE` | `HIGH` | — |
| `PLATFORM_MODE` | `WEB` | Override, uncontested |
| `PRIMARY_SURFACE` | `APPLICATION` | — |
| `SECONDARY_SURFACES` | `LANDING_PAGE` (root domain: hero, "cómo funciona," pricing, footer legal links) | `MEASURED_BROWSER` / `PRODUCTION` |
| `DOMAIN_PROFILE` | none supplied, none activated | — |

No `SURFACE_MODE_MISMATCH_WARNING` — auto-detection agrees with the override.

---

## 5. Current Product Model

Verified this session (`MEASURED_BROWSER`/`PRODUCTION` unless noted):

| Capability | Status | Evidence |
|---|---|---|
| Safe Import (upload → detect → preview → confirm) | **Present, live** | Browser: CSV upload through to guest-gated confirm |
| Format Assistant / employee-row matching | **Present, live** | Browser: "¿Cuál de estas filas eres tú?" resolved a synthetic CSV row |
| Future-shift routing choice (historical only vs. historical+draft) | **Present, live** | Browser: explicit radio choice shown before commit |
| Guest / local-first mode (no account) | **Present, live** | Browser: `/app` reachable via "Continuar sin cuenta", persists to `localStorage` per README |
| Organizations / Areas / Employees / Users / Memberships | **Present, code-verified** | `MEASURED_CODE`: `api/organizations`, `api/areas`, `api/employees`, `api/memberships`, Postgres schema in `scripts/seed-manual-demo.mjs` |
| Roles: OWNER / ADMIN / PLANNER / EMPLOYEE, scopes ORGANIZATION/AREA/SELF | **Present, code-verified, doc-aligned** | `MEASURED_CODE` + `DECLARED_DOCS` (README §"Roles y scopes") |
| Plan gating (Free / Personal / Team) | **Present, live** | Browser: pricing page comparison table; code: `canUseFeature`, `teamManagementLocked` |
| Bulk user/employee CSV import, one-time credential export | **Present, code-verified** | `MEASURED_CODE`: `api/imports`, README §"credenciales de un solo uso" — **not** browser-verified this session (`AUTH_BLOCKED`) |
| Scheduling drafts, publish, Employee Portal, approvals/change-requests | **Present, code-verified** (extensive `qa/e2e-acceptance` suite: R3/R4/R5 milestones, P5.7 series) | `MEASURED_CODE` + `DECLARED_DOCS` — **not** browser-verified this session (`AUTH_BLOCKED`) |
| Import history / auditability | **Not observed in guest scope** | Guest sidebar exposed only Calendario / Importar turnos / Añadir turno — history nav was not present for this scope. `UNKNOWN` whether it's account-gated or a separate screen; not `CANNOT_RETEST` from missing feature, but from missing account. |

No CRM, payroll, ERP, HRIS, or time-clock capability was found or assumed, consistent with the README's explicit "Qué no es (todavía)".

---

## 6. Product Promise vs Observed Experience

**Promised:** *importar → revisar → comparar → confirmar → planificar → publicar → consultar → confirmar → solicitar cambios → aprobar → auditar.*

**Observed (guest scope, `MEASURED_BROWSER`/`PRODUCTION`):** import → detect → **assisted row-matching when ambiguous** → editable preview → **explicit historical-vs-draft routing decision** → gated confirm with a plain-language reason ("Inicia sesión para importar. Esta vista previa no se guardará como turnos.").

**Verdict:** the promise holds for the segment this audit could observe directly. The system makes its own decisions visible before commit — the row-matching assistant states plainly *why* it needs input ("No se encontró ninguna fila que coincida de forma fiable con tu perfil. No se importará nada hasta que lo resuelvas."), and the future-shift routing choice is surfaced as a decision, not a silent default. This directly answers the audit's standing question about whether Safe Import *feels* safe: yes, in the paths this session could exercise, both before-write clarity and post-decision explanation are present.

The planificar → publicar → auditar segment of the promise could not be independently re-verified in the browser this session (`AUTH_BLOCKED`); it rests on `MEASURED_CODE` and the product's own extensive `qa/e2e-acceptance` documentation, which is legitimate but weaker evidence.

---

## 7. Safe Import — Deep Dive

Journey executed: guest → "Importar turnos" → format picker (CSV) → upload `test-data/fixtures/manual-qa-state-contract/01_READY_structured.csv` (synthetic, repo fixture, 5 rows, one employee) → format assistant → editable preview → future-shift routing choice → guest-gated stop.

| Stage | Observation | Evidence level |
|---|---|---|
| File select | Clear format menu (PDF/Excel/CSV/Image/Other) inside a "Bienvenido" first-run guide | `MEASURED_BROWSER` |
| Employee matching | System stated plainly that no row matched the current profile and blocked with an explicit reason, then offered a one-click resolution ("¿Cuál de estas filas eres tú?") | `MEASURED_BROWSER` |
| Format memory | "Guardar este formato para próximos meses" checkbox, checked by default | `MEASURED_BROWSER` |
| Preview | Every field of every detected row is an editable textbox (date, origin, type, start, end) with a per-row remove control | `MEASURED_BROWSER` |
| Future-shift routing | Explicit, named choice: "Importar solo los turnos históricos" vs. "Importar históricos y añadir los futuros a planificación en borrador," with copy stating drafts won't auto-publish | `MEASURED_BROWSER` |
| Pre-write gate | `alert` element states the precise reason nothing will be written yet and disables the only remaining primary action | `MEASURED_BROWSER` |
| Minor inconsistency | "Procesar archivo" stays visibly `disabled` even once parsing has already completed and the table is populated — no visual link between the disabled button and "processing already happened" | `MEASURED_BROWSER` |

**Negative-path coverage (not re-run live, but documented in-repo and directly inspected):** `qa/e2e-acceptance/TEST-MATRIX.md` enumerates unsupported formats, unknown employees, ambiguous matches, empty documents, malformed CSV, and "no shifts found" as required-to-error, never-silent-import cases, each with an exact expected error string. This is strong `DECLARED_DOCS` evidence the negative path is taken as seriously as the happy path.

---

## 8. Application Shell & Responsive

**Desktop (1440×900, dark, ES) — `MEASURED_BROWSER`/`PRODUCTION`:** a slim role-aware left rail ("Operación": Calendario / Importar turnos / Añadir turno), a compact top bar (theme, language, account menu), and the calendar as an unmistakably dominant primary workspace. No stacked navigation rows, no competing chrome. This matches the skill's premium doctrine (Section 9A): disciplined hierarchy, restrained surfaces, no glassmorphism or arbitrary gradients observed.

**Mobile (390×844, dark, ES) — `MEASURED_BROWSER`/`PRODUCTION`:** the same calendar becomes a nested horizontal-scroll region measured at `scrollWidth=780` vs `clientWidth=370`; the stats ribbon above it measures `scrollWidth=1135` vs `clientWidth=370`. Visually, only 3 of 7 weekday columns and a fragment of a 4th are visible, with no scrollbar, arrow, or fade cue that more content exists sideways. See Finding F-2026-09-09-01.

**Public landing, mobile (390×844):** the header collapses to a working "Abrir menú" control that opens a full-height panel with all primary links, theme/language toggles, sign-in, and the primary CTA — a clean, conventional pattern. This directly reverses OLD-F7.

---

## 9. Light / Dark & i18n

Both themes render on the guest calendar without loss of hierarchy or contrast in either direction; light mode was not "the reference state with dark bolted on" — both look considered (numeric stat columns, calendar cell borders, and the disabled/selected day state all remained legible in both).

ES↔EN toggle was exercised live on the guest calendar: "Septiembre 2026" → "September 2026," sidebar and stat labels translated, no raw i18n keys or mixed-language fragments observed in the screens actually visited. This is a narrow slice of the full i18n surface (guest calendar + landing + login only); the authenticated app's settings/team/import-history strings were not re-verified live this session.

---

## 10. Historical Regression Matrix

| ID | 2026-09-05 finding | Current status | Evidence this session |
|---|---|---|---|
| OLD-F1 | `window.confirm`/`window.alert` blocked import of a new employee; no persistent summary | **FIXED** | `MEASURED_CODE`: zero occurrences of `window.alert`/`window.confirm`/`window.prompt` anywhere in `src/`; live guest import used an in-page dialog + persistent alert/summary region throughout |
| OLD-F2 | Team paywall communicated only after filling and submitting the add-user form | **FIXED** | `MEASURED_CODE` (`MembersModal.tsx`): the entire add-user `<fieldset disabled={teamManagementLocked}>` is disabled *before* any input, with a persistent `PlanGateNotice` (`upgrade.teamManagementBlocked`) linked via `aria-describedby` — gate is visible before the user invests effort, not after submit. Not independently re-verified live (`AUTH_BLOCKED`; would need a real Personal-plan account) |
| OLD-F3 | "No se encontraron organizaciones" shown in employee/member contexts | **FIXED** | `MEASURED_CODE`: `members.noEmployeesFound` ("No se encontraron empleados."), `employeeSelect.noEmployees`/`noResults` are distinct, contextually correct strings; the organization-specific copy is confined to `orgSelector.noResults` |
| OLD-F4 | Shift-type color pickers had no accessible name | **FIXED** | `MEASURED_CODE` (`SettingsModal.tsx`): both color inputs carry `aria-label={t('settings.colorAria', {label})}` / `t('settings.newColorAria')`, translated in both ES and EN |
| OLD-F5 | Documentation out of date on roles and shift-type UI existence | **FIXED** | `MEASURED_CODE` + `DECLARED_DOCS`: `README.md` §"Roles y scopes" accurately states OWNER/ADMIN/PLANNER/EMPLOYEE and ORGANIZATION/AREA/SELF scopes; shift-type management UI verified present in `SettingsModal.tsx`. (A *different*, newly-discovered doc-drift item is logged separately — see F-ENG-2026-09-09-02.) |
| OLD-F6 | Stats bar clipped / planner overflow at mobile widths | **STILL PRESENT** | `MEASURED_BROWSER`/`PRODUCTION`, 390×844: `.totals-ribbon` `scrollWidth` 1135 vs `clientWidth` 370; `.month-grid-shell` `scrollWidth` 780 vs `clientWidth` 370. See Finding F-2026-09-09-01 for full detail. |
| OLD-F7 | Public mobile navigation lacked proper collapse behavior | **FIXED** | `MEASURED_BROWSER`/`PRODUCTION`, 390×844: "Abrir menú" opens a complete, legible full-height menu with all primary links and controls |
| OLD-F9 | Silent validation failure in onboarding when "También trabajaré como empleado" is checked without an employee name | **FIXED** | `MEASURED_CODE` (`OnboardingChoiceModal.tsx`): `validateStep()` blocks progression, calls `showError(...)` which sets a `role="alert"` message and focuses the empty field via ref; `aria-invalid`/`aria-describedby` wired |

**Summary:** 7 of 7 retestable findings retested. 6 fixed, 1 still present, 0 regressed, 0 not-retested. (OLD-F8 does not appear in the known baseline list and was not reconstructed from any other available source; treated as not applicable, consistent with the master prompt's own numbering.)

**Note on comparison validity:** this is a materially different measurement instrument than 2026-09-05 (surface-aware v1.5.0, explicit browser-environment provenance, finding-scope separation) — see [Methodology Delta](#3-methodology-delta). The count "6 fixed" reflects genuine code/browser evidence gathered this session, not an extrapolation from commit messages or roadmap documents claiming completion.

---

## 11. Scorecards

Grades: `EXCELLENT` / `GOOD` / `FAIR` / `POOR` / `CRITICAL` / `NOT_EVALUATED` (relevant, insufficient evidence) / `NOT_APPLICABLE` (structurally irrelevant to this surface).

### Common (all surfaces)

| Dimension | Grade | Basis |
|---|---|---|
| Clarity | GOOD | Import preview, format assistant, and future-shift routing choice all state system decisions in plain language before commit |
| Visual Hierarchy | GOOD | Desktop shell: single dominant workspace, no competing chrome (browser-observed, both themes) |
| Premium Quality | GOOD | No arbitrary gradients, glassmorphism, or generic-SaaS card stacking observed; calm, restrained, brand-consistent in both themes |
| System Feedback | GOOD | Every disabled/blocked state observed stated a reason in the same view |
| Error Recovery | GOOD | `DECLARED_DOCS`-heavy (extensive negative-case test matrix); the one browser-observed block (guest gate) explained itself plainly |
| Accessibility | NOT_EVALUATED | No composed `accessibility-audit` run this session; isolated code-level positives noted (aria-labeled color inputs, `role="alert"` validation) do not amount to full coverage |
| Responsive Task Completion | **POOR** | Core calendar task (viewing/adding a shift on Thu–Sun) not reliably completable at 390×844 without discovering a hidden horizontal scroll region |

### Application / Dashboard / Portal

| Dimension | Grade | Basis |
|---|---|---|
| Application Shell | GOOD | Desktop: compact, role-aware, calendar-dominant (browser-observed) |
| Viewport Economy | FAIR (split) | Desktop: workspace starts high, minimal persistent chrome (GOOD). Mobile: same screen loses most of its own grid to hidden scroll (POOR). Reported as one line per skill schema, explained in prose rather than averaged silently. |
| Primary Workspace | FAIR (split) | Same desktop/mobile split as above |
| Workflow Efficiency | NOT_EVALUATED | Would require observing a returning user across a real recurring-task session |
| Context Management | NOT_EVALUATED | Org/Area/Self scope switching requires a real multi-scope account (`AUTH_BLOCKED`) |

### Contextual (ShiftImport-specific)

| Dimension | Grade | Basis |
|---|---|---|
| Safe Import Confidence | GOOD | Direct browser evidence of pre-write clarity + explicit decision points |
| RBAC Clarity | NOT_EVALUATED | No live multi-role session available this session |
| Auditability (import history) | NOT_EVALUATED | Not present in guest scope; account-gated or a separate screen — `UNKNOWN` which |
| Employee Self-Service | NOT_EVALUATED | `AUTH_BLOCKED` |
| Bulk Provisioning Confidence | NOT_EVALUATED | `AUTH_BLOCKED` |

---

## 12. What Works Well

- **Pre-write transparency in Safe Import.** The system states, in the same screen, what it found, what it's unsure about, and what will happen if the user proceeds — including an explicit historical-vs-draft choice for future shifts. `DO_NOT_BREAK`: this pattern (decision surfaced before commit, plain-language reason for every disabled state) should be the template for any new import or bulk-action surface, not just preserved where it exists.
- **Guest/local-first mode as a genuine, low-friction way to experience the real product.** It is not a stripped-down demo; it's the same calendar, same import pipeline, same format assistant. `DO_NOT_BREAK`: keep this path reachable from `/login` without weakening the "sign in to persist" messaging.
- **Format-recovery assistant.** Plain-language explanation of *why* the system needs help, one-click resolution, and a persistent "remember this format" option. `DO_NOT_BREAK`.
- **Plan-gate discoverability pattern in `MembersModal`.** Disabling the whole form and explaining why, before the user has invested any typing, is exactly right and should be the template other gated surfaces follow. `DO_NOT_BREAK`.
- **Desktop application shell restraint.** Compact header, role-aware sidebar, calendar-first layout in both themes. `DO_NOT_BREAK` as mobile responsive work proceeds — the fix for F-2026-09-09-01 should not add the persistent multi-row chrome the desktop shell currently avoids.

---

## 13. Findings — Product UX / Access

### F-2026-09-09-01 — Calendar and stats ribbon are hidden inside unlabeled horizontal-scroll containers at mobile widths

- **Category:** RESPONSIVE · **Finding scope:** PRODUCT_UX · **Surface:** APPLICATION (guest workspace, `/app`)
- **Journey:** J-calendar-view (core, frequent) · **Screen:** Calendar (guest scope)
- **User type:** any authenticated or guest user on a phone · **Task criticality:** CORE
- **Friction type:** RESPONSIVE_FRICTION, DISCOVERABILITY_FRICTION
- **Severity:** CRITICAL · **Priority:** P1 · **Quick win:** No (needs a real layout decision, not a one-line fix)
- **Evidence level:** MEASURED_BROWSER · **Browser environment:** PRODUCTION
- **Evidence:** 390×844, dark, ES, `https://shiftimport.anclora.com/app`. `document.querySelector('.month-grid-shell')` → `scrollWidth: 780, clientWidth: 370`. `document.querySelector('.totals-ribbon')` → `scrollWidth: 1135, clientWidth: 370`. Screenshot: `prod-guest-calendar-390-dark-es.png` — only columns L/M/X (and a sliver of the 4th) are visible; no scrollbar, arrow, or edge fade is rendered.
- **Frequency:** every mobile session, every month view.
- **Current behavior:** the calendar grid and the stats ribbon are each wrapped in their own horizontally-scrollable container sized for roughly 7 and ~9 columns respectively, but the container itself is not widened, shrunk, reflowed, or given a visible affordance at narrow viewports — it silently clips.
- **Root UX cause:** a desktop-oriented fixed-column-width layout was placed inside an `overflow-x` container without a mobile-specific reflow (stacked days, swipeable week view, or a smaller per-cell width) and without any visual signal that horizontal content exists.
- **Why it matters / user impact:** the calendar is the product's primary workspace. A user who opens the app on a phone — plausibly the majority of individual/employee usage — cannot see or add shifts for Thursday through Sunday without accidentally discovering they can swipe inside a specific 300px-tall region of the page. This directly threatens the "predictability" and "confidence" the skill's premium doctrine calls for.
- **Recommended change:** on narrow viewports, replace the fixed 7-column grid with either (a) a single-column/day-list view with a lightweight week switcher, or (b) a horizontally swipeable week strip with a visible scroll indicator (dots, partial next-cell reveal, or a subtle edge gradient) so the user knows more days exist. Apply the same fix to the stats ribbon: collapse it to the current period's totals with a "show more" disclosure rather than a hidden 1135px-wide strip.
- **Why this change:** preserves the existing data model and desktop layout untouched while making the same information reachable at 390px without guesswork.
- **Expected benefit:** restores core-task completion (view/add shift) on mobile without discovery friction.
- **Effort:** MEDIUM · **Risk:** LOW (additive responsive change, no behavior change on desktop)
- **Dependencies:** none identified · **Do not break:** desktop shell's current calendar dominance and compact chrome (Section 12)
- **Acceptance criteria:**
  ```
  Given a user opens the calendar at a 390px-wide viewport
  When the month view renders
  Then all seven weekday columns (or an equivalent day-by-day view) are reachable
    without an undiscoverable, unlabeled horizontal scroll
  And the stats ribbon's key totals are visible without horizontal scrolling
  And no functionality available at 1440px is removed at 390px
  ```

### F-2026-09-09-02 — "Procesar archivo" stays disabled after the file has already been parsed

- **Category:** SYSTEM_STATE · **Finding scope:** PRODUCT_UX · **Surface:** APPLICATION (guest workspace, Safe Import)
- **Journey:** J-safe-import (core) · **Screen:** Import dialog · **User type:** any · **Task criticality:** CORE
- **Friction type:** FEEDBACK_FRICTION, CONSISTENCY_FRICTION
- **Severity:** MEDIUM · **Priority:** P3 · **Quick win:** Yes
- **Evidence level:** MEASURED_BROWSER · **Browser environment:** PRODUCTION
- **Evidence:** 1440×900, dark, ES. Snapshot at the moment the "Turnos Detectados" table already shows 5 parsed rows: `button "Procesar archivo" [disabled]` is still present immediately above the results.
- **Frequency:** every import where parsing completes before the assistant step.
- **Current behavior:** a visibly disabled primary-looking button sits directly above an already-populated results table, with no copy explaining that processing already happened automatically.
- **Root UX cause:** the button's disabled state doesn't distinguish "not yet actionable" from "already done, no action needed here."
- **Why it matters:** momentarily ambiguous — a careful user might wonder if they need to press a disabled button to proceed, or whether the visible rows are actually the final result.
- **Recommended change:** either remove the button once parsing has started automatically, or replace it with a short static status ("Procesado automáticamente") once the table is populated.
- **Expected benefit:** removes a small but avoidable moment of doubt in the product's most important flow.
- **Effort:** LOW · **Risk:** LOW · **Do not break:** the automatic-parsing behavior itself, which is good.

---

## 14. Supporting Engineering Findings

*(finding_scope: ENGINEERING_SUPPORT — does not affect the scorecards above)*

- **`skill.yaml` version lag.** `skill.yaml` declares `"version": "1.4.0"`; `SKILL.md` and the runtime already implement v1.5.0 behavior. Recommend bumping the manifest field to keep governance metadata trustworthy.
- **`.env.example` documentation drift.** The comment above `VITE_ENABLE_REMOTE_STORAGE` reads "hoy no hay auth ni aislamiento por usuario" ("today there is no auth or per-user isolation"), which is only true for the guest/local-storage mode. The multi-tenant Postgres-backed org layer (organizations, memberships, RBAC) is substantial and real; a reader of `.env.example` alone would materially underestimate the product's current auth model.
- **Local API dev loop requires interactive login.** `vercel dev` — this repo's own documented way to run `/api/*` locally (`docs/roadmap/**`, `qa/e2e-acceptance/playwright.local.config.ts`) — starts an OAuth device-flow login with no documented non-interactive path for a read-only agent/CI-style audit. This is the direct cause of this session's `AUTH_BLOCKED` coverage gaps for RBAC, Team, bulk provisioning, Employee Portal, and scheduling-publish journeys.

---

## 15. Quick Wins & Roadmap

**Quick wins:**
1. F-2026-09-09-02 (disabled "Procesar archivo" after auto-parse) — LOW effort, LOW risk.
2. Bump `skill.yaml` version to `1.5.0` to match `SKILL.md`/runtime.

**Phase 1 — Quick wins:** the two items above.

**Phase 2 — High impact:** F-2026-09-09-01 (mobile calendar/stats overflow) — this is the one item on this report that materially affects core task completion today and should be treated as the top priority for the next mobile-responsive pass.

**Phase 3 — Structural:** none identified this session. The desktop application shell does not need restructuring; it needs its layout logic extended to narrow viewports without adding new chrome.

---

## 16. DO_NOT_BREAK (consolidated)

- Pre-write transparency pattern in Safe Import (preview, decision points, plain-language gate reasons).
- Guest/local-first entry point and its "sign in to persist" messaging.
- Format-recovery assistant's one-click resolution and format-memory checkbox.
- `MembersModal` plan-gate pattern (disable-and-explain before input).
- Desktop application shell's compact chrome and calendar dominance.
- Automatic parsing-on-upload behavior in Safe Import (only the disabled-button artifact around it should change).

---

## 17. Evidence Coverage

| Field | Value |
|---|---|
| `SURFACE_MODE` / source / confidence | APPLICATION / OVERRIDE (browser-confirmed) / HIGH |
| `SECONDARY_SURFACES` | LANDING_PAGE (covered) |
| `BROWSER_AVAILABLE` | TRUE (`playwright-cli`) |
| `PRODUCTION_BROWSER_COVERED` | TRUE — public site, login/signup, guest `/app` (calendar, Safe Import, format assistant) |
| `STAGING_BROWSER_COVERED` / `PREVIEW_BROWSER_COVERED` | FALSE — none identified/attempted |
| `LOCAL_BUILD_BROWSER_COVERED` | FALSE — local frontend was started (`vite` on :5173) but not exercised, since it cannot reach `/api/*` without `vercel dev` (blocked); no evidentiary value beyond what production already gave |
| `DEPLOYED_SURFACE_COVERED` | TRUE for guest/public scope; **FALSE for authenticated multi-tenant scope** — `DEPLOYED_SURFACE_EVIDENCE_GAP` applies to RBAC/Team/bulk/portal/scheduling-publish |
| `PUBLIC_FLOWS_COVERED` | TRUE | `AUTHENTICATED_FLOWS_COVERED` | FALSE (`AUTH_BLOCKED` — no valid credentials, no working local API) |
| `OWNER_COVERED` / `ADMIN_COVERED` / `PLANNER_COVERED` | FALSE (`AUTH_BLOCKED`) | `EMPLOYEE_COVERED` (guest-as-self) | PARTIAL |
| `ORGANIZATION_SCOPE_COVERED` / `AREA_SCOPE_COVERED` | FALSE | `SELF_SCOPE_COVERED` | TRUE (guest) |
| `DESKTOP_COVERED` | TRUE (1440×900) | `MOBILE_PORTRAIT_COVERED` | TRUE (390×844) | `TABLET_COVERED` / `MOBILE_LANDSCAPE_COVERED` | FALSE — not attempted this session |
| `LIGHT_THEME_COVERED` / `DARK_THEME_COVERED` | TRUE / TRUE |
| `SAFE_IMPORT_COVERED` | TRUE | `UNKNOWN_FORMAT_COVERED` / `LEARNED_FORMAT_COVERED` | PARTIAL (assistant exercised; true unknown-format/OCR path not re-run live, `DECLARED_DOCS` only) |
| `IDEMPOTENCY_COVERED` / `IMPORT_HISTORY_COVERED` / `SAFE_DELETE_COVERED` | FALSE |
| `SCHEDULING_COVERED` / `PUBLISH_COVERED` / `TEAM_MANAGEMENT_COVERED` / `EMPLOYEE_MANAGEMENT_COVERED` / `BULK_*_COVERED` / `CREDENTIAL_EXPORT_COVERED` / `AREAS_COVERED` / `SHIFT_TYPES_COVERED` (live) / `EMPLOYEE_PORTAL_COVERED` / `APPROVAL_FLOW_COVERED` | FALSE (`AUTH_BLOCKED`); code-level existence confirmed for all (Section 5) |
| `APPLICATION_SHELL_COVERED` / `VIEWPORT_ECONOMY_MEASURED` | TRUE (desktop + mobile) |
| `PREMIUM_PRODUCT_SURFACE_COVERED` | TRUE (both themes, desktop) |
| `ACCESSIBILITY_COMPOSED` / `I18N_COMPOSED` / `DESIGN_SYSTEM_COMPOSED` / `VISUAL_REGRESSION_COMPOSED` | UNAVAILABLE (no dispatcher access to these skills this session) |
| `HISTORICAL_FINDINGS_RETESTED` | 7 / 7 known baseline items | `HISTORICAL_FINDINGS_NOT_RETESTED` | 0 |

---

## 18. Limitations & Gaps

1. **No authenticated multi-tenant browser coverage.** `vercel dev` requires an interactive OAuth login this agent will not perform. Everything downstream of a real org/role account (RBAC, Team, bulk provisioning, Employee Portal, approvals, scheduling publish, import history) rests on `MEASURED_CODE`/`DECLARED_DOCS`, not `MEASURED_BROWSER`. This is the single largest gap in this audit.
2. **No composed AOS skills executed.** `accessibility-audit`, `i18n-integrity-check`, `design-system-consumer-check`, and `visual-regression-check` were not dispatched; any accessibility/i18n observations here are narrow, direct observations, not full coverage.
3. **Tablet and mobile-landscape viewports not attempted** this session.
4. **Unknown-format/OCR recovery path** (image/PDF with no matching learned profile) was not re-run live; evidence for it is `DECLARED_DOCS` from `qa/e2e-acceptance/TEST-MATRIX.md`.
5. **Import History / Auditability screen** was not located in guest scope; `UNKNOWN` whether it exists only for authenticated accounts or under a different entry point.
6. **The database seed script was deliberately not executed.** Running it would have written synthetic data to a non-production database for zero evidentiary benefit, since the local API layer it would have supported could not be started without an interactive login. Documented as a judgment call, not silently skipped.

---

## 19. Final Answers

1. **Can an OWNER, ADMIN, PLANNER or EMPLOYEE complete their tasks simply, safely and predictably today?** For the paths this audit could observe directly (guest Safe Import, calendar, format recovery) — yes, on desktop; **no**, reliably, on a phone, because of F-2026-09-09-01. For the authenticated multi-tenant paths, the code and the product's own extensive test suite say yes; this audit could not independently confirm it live.
2. **Does ShiftImport feel like a premium operations tool, or a functional app accumulating complexity?** On the evidence gathered, premium: the desktop shell stayed calm and calendar-first in both themes, Safe Import states its own decisions in plain language, and no generic-SaaS visual patterns were observed. The mobile calendar defect is the one place where the experience currently falls short of that standard.
3. **What's fixed, what remains, what regressed, what's new since 2026-09-05?** 6 of 7 retestable findings fixed with real evidence (OLD-F1, F2, F3, F4, F5, F7, F9 minus F6); OLD-F6 (mobile overflow) still present; nothing regressed; two new findings (one product, one process) surfaced this session.
4. **Is the difference between the two audits a real product improvement, a coverage difference, a methodology evolution, or all three?** All three, and they should not be conflated: the six fixes are real, code-and-browser-verified improvements. The lower total finding count is *not* evidence the product got broadly better — it reflects both real fixes and this audit's narrower live-authenticated coverage (a genuine gap, documented above) plus a stricter evidence model (v1.5.0) that refuses to grade what it couldn't measure.

---

*Read-only audit. No application code, configuration, or database state was modified. One local dev server (`vite`/`proxy-server.mjs`) was started and stopped; no database writes occurred.*
