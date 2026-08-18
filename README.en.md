<!-- markdownlint-disable MD001 MD013 MD033 MD041 MD060 -->

<div align="center">

<img src="./public/brand/anclora-shiftimport.png" alt="Anclora ShiftImport" width="132" />

# Anclora ShiftImport

### Smart shift-schedule importer for shift workers

Turns work schedules in PDF, image, or compatible formats into a structured, reviewable, exportable personal calendar.

[Español](./README.md) · **English**

<br />

![Anclora](https://img.shields.io/badge/Anclora-ecosystem-111827)
![Category](https://img.shields.io/badge/category-Premium-C07860)
![Status](https://img.shields.io/badge/status-Phase%200-6AAD49)

</div>

---

> [!IMPORTANT]
> Private Anclora ecosystem repository. Commercial code: do not publish operational details, credentials, or sensitive logic outside authorized channels.

## What it is

Anclora ShiftImport solves one concrete problem: shift workers receive a schedule created by someone else (PDF, image, or another compatible format) and want it in their personal calendar without retyping every shift.

The product flow is:

```text
Import schedule → review → calendar
```

Import is the product: it detects shifts, shows them in an editable preview, and only writes to the calendar after user confirmation.

## What it is not

ShiftImport is not an HRIS, a schedule generator, legal time tracking, payroll, or enterprise workforce planning. It is a personal (B2C / prosumer) productivity tool for shift workers.

## Category in the ecosystem

| Field | Value |
|---|---|
| Category | Premium |
| Brand accent | `#6AAD49` |
| Canonical repository | `anclora-shiftimport` |
| Product type | B2C / Prosumer |
| Domain | Shift work / personal productivity |
| Technical origin | Derived from `anclora-groundsync` (Git history preserved) |

`anclora-groundsync` remains operational as an independent product; ShiftImport is its commercial derivative.

## Key features

- Schedule import from PDF (PDF.js) with editable preview
- OCR extraction (Tesseract.js) and Excel import (ExcelJS)
- Monthly shift dashboard with manual entry
- Statistics and PDF reports (jsPDF)
- Local-first persistence (`localStorage`); cloud sync disabled by default

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Data | PDF.js, ExcelJS, Tesseract.js |
| PDF | jsPDF |
| Persistence | Local-first; Express/Neon backend under remediation (Phase 0) |

## Local setup

```bash
npm install
npm run dev
```

Validation: `npm run lint && npm run build`.

## Privacy

- Local-first persistence: shifts live in the user's browser by default.
- The original imported file is not persisted.
- Test fixtures are synthetic; no real schedules are committed.

## Supported languages

The product operates in Spanish only (`lang="es"`, no language switcher). This documentation is offered in English as a courtesy.

## Documentation and governance

- Brand and governance contracts: [`docs/standards/`](./docs/standards/)
- Canonical ecosystem registry: `anclora-vault/00-governance/registry/ecosystem-repos.json`

---

<div align="center">

### Anclora Group

Commercial product of the Anclora ecosystem.

</div>
