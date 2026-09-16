# Anclora ShiftImport — Agent Project Context

AGENT_PROJECT_CONTEXT_VERSION=1.0
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

## 2. Mandatory Bootstrap

When starting work in this repository, agents must read sources in this exact order:

1. Current explicit instruction from Toni (highest operational priority).
2. Workspace agent policy (`../../ANCLORA_WORKSPACE_AGENT_POLICY.md` — currently `WORKSPACE_POLICY_STATUS=PENDING_GLOBAL_INSTALLATION`, with `../../AGENTS.md` as interim workspace guidance).
3. Repository agent rules (`../AGENTS.md`).
4. `.anclora/AGENT_PROJECT_CONTEXT.md` (this file — bootstrap, index, routing, and authority map).
5. `.anclora/PRODUCTION_RUNTIME.md` (canonical runtime contract: topology, database, migrations, QA, Git).
6. `.anclora/AOS_ADOPTION.md` (governance declaration, canonical AOS sources, decisions, exceptions).
7. Repository-specific agent instructions (`../CLAUDE.md`, `../GEMINI.md`, etc., when present).
8. Task-specific canonical sources (see Section 4: Task Routing).

*Note: `AGENTS.md` references this file as entry bootstrap; agents must not enter an infinite processing loop.*

## 3. Core Project Contracts

This repository maintains two specialized, coordinated contracts alongside this bootstrap:

- **PRODUCTION_RUNTIME**: [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md)
  - Governs real runtime architecture, Vite frontend + Vercel Functions backend, Neon database connection, custom forward-only SQL migrations (`db/migrate.mjs`), Resend email, session auth, local `.env` files, production-backed local model, persistent QA user contract, and Git workflow.
- **AOS_ADOPTION**: [`.anclora/AOS_ADOPTION.md`](AOS_ADOPTION.md)
  - Governs Anclora Operating System (AOS) alignment, governance level (Level 3 - local product authority), canonical AOS references, local official knowledge declarations, decision elevation policies, active exceptions (EX-SI-001), and upgrade procedures.

*Neither contract is duplicated within this bootstrap file.*

## 4. Task Routing

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

## 5. Source Authority

Knowledge sources are structured in a strict domain-first authority hierarchy:

1. **NORMATIVE (Global AOS Authority)**:
   - AOS Constitution: [`../../anclora-governance/constitution/`](../../anclora-governance/constitution/)
   - Master Decisions: [`../../anclora-governance/knowledge/MASTER_DECISIONS.md`](../../anclora-governance/knowledge/MASTER_DECISIONS.md)
   - Canonical Standards: [`../../anclora-governance/standards/`](../../anclora-governance/standards/)
2. **DELEGATED CANONICAL (Anclora Vault Authority)**:
   - Architecture & Contracts: [`../../anclora-vault/00-governance/contracts/`](../../anclora-vault/00-governance/contracts/)
   - Product Dossier: `../../anclora-vault/20-products/shiftimport/dossier.md`
   - Operational Registry: [`../../anclora-vault/00-governance/registry/`](../../anclora-vault/00-governance/registry/)
3. **LOCAL CANONICAL (Repository Authority)**:
   - Runtime, Infrastructure & Operations: [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md)
   - Governance Adoption & Exceptions: [`.anclora/AOS_ADOPTION.md`](AOS_ADOPTION.md)
   - Product Specifications & Decisions: [`../sdd/`](../sdd/)
   - Local Rules: [`../AGENTS.md`](../AGENTS.md)
4. **HISTORICAL CONTEXT / NON-NORMATIVE**:
   - Historical documentation, commit logs, legacy backend files (`server.mjs`, `proxy-server.mjs`).
   - *Note: `MEMORY.md` is not present in this repository. Historical context derives from git history and `docs/` archives, which are strictly non-normative.*

## 6. Ecosystem Dependencies

Dependencies on other workspace repositories are categorized by role:

- **Governance Dependency**: [`../../anclora-governance/`](../../anclora-governance/) (AOS source of truth).
- **Contract & Registry Dependency**: [`../../anclora-vault/`](../../anclora-vault/) (canonical ecosystem contracts).
- **Provenance / Historical Ancestor**: `anclora-groundsync` (ShiftImport is a commercial derivative; GroundSync remains independent and must never be modified from this repository).

### Infrastructure Isolation Rule:
Do not assume that this repository shares infrastructure, databases, credentials,
hosting, authentication or storage with another Anclora product. Read
`.anclora/PRODUCTION_RUNTIME.md` before making infrastructure decisions.

## 7. Local Knowledge Map

Key local directories and verified documentation paths:

- **Product Identity**: [`../README.md`](../README.md)
- **Product Specifications (SDD)**: [`../sdd/`](../sdd/)
- **Database Environments & Baseline**: `docs/db-environments.md`, `docs/database/`
- **Database Migrations & Runner**: `db/migrations/`, `db/migrate.mjs`
- **Serverless API**: `api/` & `api/_lib/`
- **QA & E2E Suites**: `qa/e2e-acceptance/`
- **Architectural & Multi-tenant Docs**: `docs/fase1-multitenant.md`

## 8. Agent Operating Reminder

Essential operational invariants:

- **Runtime & DB**: Read [`.anclora/PRODUCTION_RUNTIME.md`](PRODUCTION_RUNTIME.md). Local development connects to the Production database (`holy-cake-85660318`, branch `main`). Do not create development or ephemeral databases.
- **Local Seeding**: `SEED_ALLOW_ENV="development"` satisfies the local guard only; seeding writes to Production. Treat local seeding as a Production write.
- **Migrations**: Schema changes are authorized via `npm run db:migrate` (`CUSTOM_FORWARD_ONLY` strategy). Confirmations are not required; backward compatibility is preferred.
- **QA Testing**: Locate, reuse, or create the persistent production QA user. Never delete it after testing.
- **Git Flow**: Work directly on `development`. Do not create feature branches by default. Commit after validation and push to `origin/development`, then STOP. Do not promote without explicit approval.
- **Governance**: Elevation to AOS is required for multi-repo or constitutional changes.

## 9. Machine-Readable Bootstrap

```text
AGENT_PROJECT_CONTEXT_VERSION=1.0
STATUS=ACTIVE

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

WORKSPACE_POLICY_STATUS=PENDING_GLOBAL_INSTALLATION
```
