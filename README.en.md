<!-- markdownlint-disable MD001 MD013 MD033 MD041 MD060 -->

<div align="center">

<img src="./public/brand/anclora-shiftimport.png" alt="Anclora ShiftImport" width="132" />

# Anclora ShiftImport

### B2B/B2B2E platform for operational shift management, built around Safe Import

Turns existing work schedules (PDF, image, Excel/CSV) into reliable operational data — organized by organization, area, and employee — through a safe, reviewable, auditable import pipeline.

[Español](./README.md) · **English**

<br />

![Anclora](https://img.shields.io/badge/Anclora-ecosystem-111827)
![Category](https://img.shields.io/badge/category-Premium-C07860)
![Status](https://img.shields.io/badge/status-MVP%20in%20progress-6AAD49)

</div>

---

> [!IMPORTANT]
> Private Anclora ecosystem repository. Commercial code: do not publish operational details, credentials, or sensitive logic outside authorized channels.

## What it is

Anclora ShiftImport is a B2B/B2B2E platform for organizations that manage employee shifts. Its functional differentiator is **Safe Import**: a premium ingestion and normalization engine that reads existing schedules across formats (PDF, image, Excel, CSV) and turns them into structured operational data — no retyping, and nothing is written until the organization confirms what it is about to import.

The target product flow is:

```text
import → review → compare → confirm
  → (roadmap) plan → publish → view → confirm
  → (roadmap) request changes → approve → audit
```

The first four stages (**import → review → compare → confirm**) are implemented today, on top of an already-operational multi-tenant organization layer. Future scheduling, the employee portal, and approvals are on the roadmap (see [`docs/roadmap/shiftimport-mvp-v2/`](./docs/roadmap/shiftimport-mvp-v2/)) and **are not implemented yet**.

## What it is not (yet)

In its current MVP, ShiftImport does not aim to be an ERP, a full HRIS, a corporate WFM suite, payroll, a BPMN engine, an advanced time-clock system, or a workplace-surveillance platform. These capabilities are documented as post-MVP backlog (see `docs/roadmap/shiftimport-mvp-v2/POST-MVP/`) and are not built before the MVP is validated.

## Category in the ecosystem

| Field | Value |
|---|---|
| Category | Premium |
| Brand accent | `#6AAD49` |
| Canonical repository | `anclora-shiftimport` |
| Product type | B2B / B2B2E |
| Domain | Operational shift management for organizations |
| Technical origin | Derived from `anclora-groundsync` (Git history preserved) |

`anclora-groundsync` remains operational as an independent product; ShiftImport is its commercial derivative.

## Key features (current state)

- **Safe Import**: schedule import from PDF (PDF.js), Excel/CSV, and multi-employee detection, with analyze/review/compare/confirm stages before any data is written.
- **Learned formats**: per-organization format memory (`format_profiles`) that recognizes previously seen structures and speeds up repeat imports.
- **Unknown format recovery**: an assisted flow when a document isn't recognized automatically, with explicit progress, blocked, and error states.
- **Import history and safe delete**: every import is recorded; deletion is logical (auditable), not destructive.
- **Idempotency**: re-importing the same document does not duplicate shifts.
- **Multi-tenant organizations**: each organization's data, employees, and shifts are isolated.
- **Optional areas**: an organization can be subdivided into areas, without being required to.
- **Employee lifecycle**: `pending_access` / `active` / `inactive` states, with optional linking to a user account.
- **Roles**: `ADMIN` / `EMPLOYEE` today (see roadmap `R0-M03` / `R2-M06` for the 4-role model with organization/area/self scopes).
- **Bulk provisioning**: CSV-based bulk user creation, with downloadable one-time credentials (never persisted server-side).
- **Spanish and English UI**, with light and dark themes.

See [`docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md`](./docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md) for the full capability inventory (DONE / PARTIAL / MISSING) with code evidence.

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Vercel serverless functions (`api/`), no dedicated Express server in production |
| Database | PostgreSQL (Neon), raw SQL, forward-only migrations in `db/migrations/` |
| Ingestion | PDF.js, ExcelJS, in-house format-detection engine + VLM fallback |
| PDF (reports) | jsPDF |
| Persistence | Neon/Postgres backend is the source of truth; shift and organization data is persisted server-side, not only in the browser |

## Local setup

```bash
npm install
npm run dev
```

Validation: `npm run lint && npm run build`. See [`SETUP.md`](./SETUP.md) and [`backend-setup.md`](./backend-setup.md) for database configuration.

## Privacy

- The original imported file is not persisted.
- One-time credentials generated during bulk provisioning are downloadable by the admin and are not stored server-side after the response.
- Test fixtures are synthetic; no real schedules are committed.

## Supported languages

The product operates in Spanish and English, with a language switcher and key parity verified by test (`i18n-coverage.test.ts`).

## Roadmap

The detailed microfase roadmap (R0 through R5, plus the R6-R9 post-MVP backlog) lives in [`docs/roadmap/shiftimport-mvp-v2/`](./docs/roadmap/shiftimport-mvp-v2/), starting with [`00-BASELINE.md`](./docs/roadmap/shiftimport-mvp-v2/00-BASELINE.md) and [`00-ROADMAP-MASTER.md`](./docs/roadmap/shiftimport-mvp-v2/00-ROADMAP-MASTER.md).

## Documentation and governance

- Brand and governance contracts: [`docs/standards/`](./docs/standards/)
- Canonical ecosystem registry: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Commercial product of the Anclora ecosystem.

</div>
