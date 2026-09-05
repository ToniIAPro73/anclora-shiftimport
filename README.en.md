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
  → plan → publish → view → confirm
  → request changes → approve → audit
```

Safe import, future scheduling, the employee portal, and approvals are implemented on top of an operational multi-tenant organization layer. Import still requires review and confirmation before writing; future scheduling is published explicitly, and the employee portal supports viewing, acknowledging, and requesting changes.

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
- **Roles and scopes**: `OWNER` / `ADMIN` / `PLANNER` / `EMPLOYEE`, with `ORGANIZATION` / `AREA` / `SELF` scopes according to role and membership configuration.
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

MVP v2 releases R0–R5 are implemented. The post-UX-audit verification and improvement program is tracked in [`docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](./docs/roadmap/ROADMAP-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md), with its normative specification in [`docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md`](./docs/specs/SPEC-SHIFTIMPORT-POST-UX-AUDIT-CRC-TRYP-END-TO-END.md). The R6–R9 post-MVP backlog remains in [`docs/roadmap/shiftimport-mvp-v2/POST-MVP/`](./docs/roadmap/shiftimport-mvp-v2/POST-MVP/).

## Documentation and governance

- Brand and governance contracts: [`docs/standards/`](./docs/standards/)
- Canonical ecosystem registry: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Commercial product of the Anclora ecosystem.

</div>
