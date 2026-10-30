# Anclora ShiftImport — Agent Project Context

AGENT_PROJECT_CONTEXT_VERSION=2.0
STATUS=ACTIVE

## 1. Project Identity

APPLICATION_NAME=Anclora ShiftImport
REPOSITORY=anclora-shiftimport
PROJECT_ROLE=Application (Intelligent Shift Calendar Importer & Multi-Tenant Management Suite)
PRODUCT_FAMILY=Anclora Group (Shift Workers Platform / Prosumer B2C & B2B/B2B2E)

Anclora ShiftImport is an intelligent shift schedule ingestion platform and operational
management suite. It converts complex shift calendars from PDF, images, or spreadsheets
into structured, interactive, and exportable calendars, featuring local-first personal
storage and multi-tenant PostgreSQL organization workspaces.

## 2. Bootstrap (minimal router)

```text
AUTHORITY=anclora-governance
AGENT_PROJECT_CONTEXT_ROLE=MINIMAL_ROUTER
```

Authority, QA, token economy, Git, promotion and the verification matrix are defined by Governance
([`AOS_ADOPTION_STANDARD`](../../anclora-governance/standards/AOS_ADOPTION_STANDARD.md),
[`AGENT_EXECUTION_POLICY`](../../anclora-governance/standards/AGENT_EXECUTION_POLICY.md),
[`AGENT_OPERATING_STANDARD`](../../anclora-governance/standards/AGENT_OPERATING_STANDARD.md)) and are not
duplicated here. Entry point: [`../AGENTS.md`](../AGENTS.md). Repository facts: [`PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md).
Adoption and exceptions: [`AOS_ADOPTION.md`](AOS_ADOPTION.md). Load each only when the task needs it.

## 3. Task Routing

Before starting work, identify the task domain and read the corresponding primary authority:

| Task Domain | Primary Authority to Read First | Secondary / Operational Sources |
| :--- | :--- | :--- |
| **Runtime / Hosting / Env** | [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md) | `.env.local`, `.env.development.local` (mode 0600) |
| **Database / Schema Changes** | [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md) | `db/migrations/`, `db/migrate.mjs`, `docs/db-environments.md` |
| **QA / E2E Testing** | [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md) | `qa/e2e-acceptance/`, `scripts/smoke-api.mjs` |
| **Product Feature / Scope** | [`../sdd/`](../sdd/) | `docs/roadmap/`, `docs/fase1-multitenant.md` |
| **Ingestion Pipeline / Parsers** | `src/ingestion/` | `src/ingestion/diagnostics.ts`, `src/lib/shift-types.ts` |
| **AOS Governance / Compliance** | [`.anclora/AOS_ADOPTION.md`](AOS_ADOPTION.md) | [`../../anclora-governance/`](../../anclora-governance/) |
| **Ecosystem Contracts** | [`../../anclora-vault/00-governance/contracts/`](../../anclora-vault/00-governance/contracts/) | `../../anclora-vault/20-products/shiftimport/dossier.md` |
| **Branding / Design System** | [`../docs/standards/`](../docs/standards/) | `../../anclora-design-system/` |
| **Git Workflow / Push Rules** | [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md) | `../AGENTS.md` |

## 4. Ecosystem Dependencies

Dependencies on other workspace repositories are categorized by role:

- **Governance Dependency**: [`../../anclora-governance/`](../../anclora-governance/) (AOS source of truth).
- **Contract & Registry Dependency**: [`../../anclora-vault/`](../../anclora-vault/) (canonical ecosystem contracts).
- **Provenance / Historical Ancestor**: `anclora-groundsync` (ShiftImport is a commercial derivative; GroundSync remains independent and must never be modified from this repository).

### Infrastructure Isolation Rule:
Do not assume that this repository shares infrastructure, databases, credentials,
hosting, authentication or storage with another Anclora product. Read
`.anclora/PRODUCTION_RUNTIME.md` before making infrastructure decisions.

## 5. Local Knowledge Map

Key local directories and verified documentation paths:

- **Product Identity**: [`../README.md`](../README.md)
- **Product Specifications (SDD)**: [`../sdd/`](../sdd/)
- **Database Environments & Baseline**: `docs/db-environments.md`, `docs/database/`
- **Database Migrations & Runner**: `db/migrations/`, `db/migrate.mjs`
- **Serverless API**: `api/` & `api/_lib/`
- **QA & E2E Suites**: `qa/e2e-acceptance/`
- **Architectural & Multi-tenant Docs**: `docs/fase1-multitenant.md`

## 6. Product invariants worth repeating

- **Local Seeding**: `SEED_ALLOW_ENV="development"` satisfies the local guard only; seeding writes to Production. Treat local seeding as a Production write.
- **QA**: reuse the persistent QA identity; never delete it after testing.

## 7. Machine-Readable Bootstrap

```text
AGENT_PROJECT_CONTEXT_VERSION=3.0
STATUS=ACTIVE
AUTHORITY=anclora-governance
APPLICATION_NAME=Anclora ShiftImport
REPOSITORY=anclora-shiftimport

PRODUCTION_RUNTIME=.anclora/PRODUCTION_RUNTIME.md
AOS_ADOPTION=.anclora/AOS_ADOPTION.md
REPOSITORY_AGENT_RULES=AGENTS.md

RUNTIME_SOURCE=PRODUCTION_RUNTIME
GOVERNANCE_SOURCE=AOS_ADOPTION
PRODUCT_SOURCE=SDD
MEMORY_CLASSIFICATION=HISTORICAL_NON_NORMATIVE

INFRASTRUCTURE_INFERENCE_ALLOWED=false
CROSS_PRODUCT_INFRASTRUCTURE_ASSUMPTION_ALLOWED=false
```
