# Pricing & Plan Model — Fase 1.2G

Status: commercial hypothesis, **not validated**. No billing (Stripe or otherwise)
exists yet. This document exists so future phases know what is decided
architecture vs. what is still a guess, and so nobody accidentally treats a
placeholder price as a committed one.

## 1. Decided architecture (implemented, not a hypothesis)

- Three plan ids: `free`, `personal`, `team`. Stored on `organizations.plan`
  (migration `db/migrations/0004_organization_plan.sql`), constrained by a
  DB `CHECK`.
- Plan is orthogonal to Role. Role (`ADMIN`/`MANAGER`/`EMPLOYEE`, per
  membership) answers "what can you do inside this org"; Plan answers "what
  can this org do at all". Neither module references the other.
- Single backend enforcement authority: `api/_lib/plans.js` (`PLANS`,
  `canUseFeature`, `checkLimit`, `requireFeature`, `requireWithinLimit`,
  `PlanLimitError`). The frontend mirror (`src/lib/plans.ts`) is
  display/UX only — it never gates a request, since a client can lie about
  its own state. The backend re-checks on every enforced endpoint regardless
  of what the UI shows.
- Commercial-intent routing (`/pricing` → `/signup?plan=<id>`) is a UX
  convenience only. The query param pre-selects which onboarding flow
  auto-triggers; the actual plan value persisted is independently
  whitelisted server-side per endpoint (`api/onboarding/personal.js` only
  ever accepts `free`/`personal`; `api/onboarding/company.js` is hardcoded
  to `team`). The param is never trusted as an authorization signal.

## 2. Implemented capability (real, enforced today)

- Personal-org onboarding persists `free` (default) or `personal` (if
  requested) — never `team`.
- Company-org onboarding persists `team` unconditionally. This is a
  **pre-billing trial grant**, not a real subscription: every company org
  today gets full Team capability with no payment step, because there is no
  payment step to gate on. See §4.
- Employee-count cap: `free`/`personal` orgs are capped at 1 active
  employee (`createEmployee` in `api/_lib/data.js`, enforced via
  `requireWithinLimit`). `team` is unlimited.
- Team management gate: inviting a member (`addMember`) requires the
  `teamManagement` feature, which only `team` has. `free`/`personal` are
  rejected with `PlanLimitError` (`code: 'PLAN_LIMIT'`, HTTP 403).
- Multi-employee PDF/CSV roster import is not separately gated — it is a
  frontend loop over the same single-employee employee-creation endpoint,
  so it is already covered transitively by the employee-count cap above.
- Frontend UX for blocked actions: `UpgradePrompt` (a modal, no checkout)
  shown whenever the backend returns `code: 'PLAN_LIMIT'`, wired into
  `MembersModal` (add member) and `TeamImportModal` (inline employee
  creation during roster import).
- Public `/pricing` page: three plan cards + capability comparison table,
  CTA routing per plan, works for both anonymous and authenticated visitors
  (authenticated visitors are routed to `/app`, never through a second
  signup).

## 3. Commercial hypothesis (NOT validated, easy to change)

These numbers exist only so the pricing page has something concrete to
show. They are guesses, not a pricing strategy:

| Plan | Price shown | Positioning |
|---|---|---|
| Free | 0 € | Try it, 1 employee, capped imports, no history |
| Personal | 4,99 €/mes | Full history for a single person, still 1 employee |
| Team | Desde 19 €/mes | Multi-employee, team management, unlimited |

None of this is backed by market research, willingness-to-pay testing, or a
cost model. Treat every number in this table as disposable.

## 4. Explicitly deferred (future work, not started)

- Stripe or any payment processor integration. **Out of scope for this
  phase by explicit instruction** — no checkout, no webhooks, no
  subscription lifecycle exists.
- Downgrade/expiry logic for the company-org trial grant (§2) — today a
  `team` org stays `team` forever; there is no time limit or paywall event.
  When billing lands, this trial grant needs a real expiry or conversion
  path.
- Metered limits (`maxMonthlyImports`) are defined in the plan model but not
  yet enforced anywhere — only `maxEmployees` and `teamManagement` are
  actually checked server-side today.
- Self-service plan upgrade/downgrade UI (the only "upgrade" surface today
  is a link to `/pricing`, which does not let a user actually change plan).

## 5. Pending validation

- Whether Free/Personal/Team is the right segmentation at all.
- Whether 1-employee is the right Free/Personal cap, or too restrictive to
  let a prospect evaluate the product.
- Whether the Team price anchor (19 €/mes) is remotely close to
  willingness-to-pay for the target SMB segment.
- Whether the "Team" plan needs employee-count tiers instead of one flat
  unlimited tier.

Any change to the numbers in §3, or to which capabilities are gated in §2,
should update this document in the same commit.
