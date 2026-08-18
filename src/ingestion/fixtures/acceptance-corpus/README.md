# Anclora ShiftImport Synthetic Test Corpus v1.0

## Purpose

Canonical synthetic QA corpus for **Anclora ShiftImport** M0 acceptance and regression testing.
It is designed to validate the import pipeline without relying on real employee data.

All organizations, people, IDs and shift assignments are fictitious.

## Test levels

- **L1 FORMAT**: detect PDF/image/CSV/XLSX/etc. and reject unsupported types.
- **L2 EXTRACTION**: source document -> all canonical assignments -> golden comparison.
- **L3 PRODUCT**: source + UserProfile -> only the selected person's assignments -> review stage.

## Canonical contract

Every supported fixture uses `schema_version: "1.0"` and a normalized `assignments[]`
contract defined in `schemas/expected-assignment.schema.json`.

Optional metadata (`team`, `role`, `area`) never replaces the canonical fields.

## Primary fixtures

- GS-01 multi-month PDF: two months in one file.
- GS-02 rotating raster scan: clean + degraded.
- GS-03 hospitality hybrid PDF.
- GS-04 restaurant XLSX.
- GS-05 hospital XLSX.
- GS-06 irregular/ragged CSV with explicit week_start.
- GS-07 DOCX: intentionally unsupported in M0.
- GS-08 dense image: clean, low-resolution, skewed, low-contrast, perspective.
- GS-09 mobile calendar: clean, cropped, heavily compressed.
- GS-10 domain edge cases: midnight crossing, 00:00, 24:00, split shift, vacation, sick leave, absence, free, unknown code, blank cell.

## Negative fixtures

- GN-01 UNKNOWN_EMPLOYEE
- GN-02 AMBIGUOUS_EMPLOYEE
- GN-03 EMPTY_DOCUMENT
- GN-04 MALFORMED_INPUT
- GN-05 UNSUPPORTED_FORMAT
- GN-06 NO_SHIFTS_FOUND
- GN-07 UNSUPPORTED_LAYOUT

## M0 acceptance intent

Recommended thresholds:
- Clean assignment accuracy >= 99%
- Degraded assignment accuracy >= 95%
- Wrong employee assignments = 0 tolerated
- Silent corruption = 0 tolerated

The corpus is product-specific and should live in the ShiftImport repository (for example
`tests/fixtures/shiftimport-corpus/`), not as an AOS source of truth.
