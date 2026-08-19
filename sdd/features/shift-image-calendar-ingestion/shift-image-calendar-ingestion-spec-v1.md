# Feature Spec: Shift Image Calendar Ingestion

## 1. Objective
Enable users to import shifts by uploading an image of a monthly calendar. The system will use OCR and heuristics to detect dates, times, and month headers.

## 2. Requirements
- **OCR Engine**: Tesseract.js (Frontend only).
- **Header Detection**: Identify the Month (Spanish/English) and Year (fall back to current if missing).
- **Grid Reconstruction**: Map text blocks to specific calendar days (1-31).
- **Time Parsing**: Detect patterns like `HH:MM`, `HH.MM`, `HH-MM` or consecutive time lines.
- **Exclusion Logic**: Ignore non-shift markers like "Libre" or "TD".
- **Validation**: Identify ambiguous blocks (e.g., misrecognized characters like "1T:00").
- **Preview UI**: High-tech dashboard with image on left and editable table on right.

## 3. Data Flow
1. File input -> `Tesseract.recognize` -> Raw blocks with coordinates.
2. `reconstructCalendarStructure` -> Group blocks into virtual grid cells.
3. `parseCalendarShifts` -> Convert grid data into proposed `Shift` objects (temp state).
4. User Review -> Edit/Validate in the Preview Modal.
5. Confirmation -> Push to `shifts` state and `localStorage`.

## 4. Edge Cases
- Low quality/dark images (OCR noise).
- Misaligned columns (Grid detection failure).
- Overnight shifts detected by end < start logic.
- Duplicate detection before final import.

## 5. Import Diagnosis & Guided Recovery (Phase 1B)

The import pipeline never fails silently. Every import attempt resolves to a
canonical state derived by `src/ingestion/diagnostics.ts`
(`buildImportDiagnosis`), consumed by `ImportModal` — the UI never hardcodes
behavior from raw parser exceptions.

### 5.1 Canonical import states
- `READY` — shifts parsed, no blocking diagnostics.
- `NEEDS_USER_INPUT` — a blocking, recoverable diagnostic awaits a user
  answer (employee row, unknown shift codes, day mapping, month conflict).
- `PARTIAL` — some days/rows resolved, some not; the unresolved ones are
  named (day numbers) and importing the resolved part is allowed.
- `BLOCKED` — zero importable shifts with no recovery path open
  (`NO_SHIFTS_FOUND` with the best available reason).
- `UNSUPPORTED` — format/layout not importable in place.
- `FAILED` — parser failure (crash mapped to `PARSER_FAILURE`, never a raw
  exception in the UI).

### 5.2 Diagnostic contract
Each `ImportDiagnostic` carries: `code` (shared with
`src/lib/ingestion-errors.ts` — no duplicate code names), `severity`,
`blocking`, `recoverable`, `messageKey` (i18n, es/en), `details`,
`affectedDays`/`tokens` when known, `recovery` action
(`answer-question`/`choose-period`/`reupload`/`none`),
`safeToImportPartial` and the pipeline `stage`. Diagnostics carry document
tokens and day numbers only — never person names, employee ids or file
contents (PII boundary).

### 5.3 Guided recovery rules
- **Unknown shift codes** (e.g. `N`, `G12`, `X`): never silently dropped,
  never auto-classified as Regular. A blocking `UNKNOWN_SHIFT_CODES`
  diagnostic plus one `shift-code` assistant question per code
  (Trabajo/Descanso/Vacaciones/Otro; work requires start/end times). The
  answer becomes a learned code mapping: `tokenAliases` + `codeTimes` on the
  `UserFormatProfile` (times are required so a bare code cell can rebuild
  its shift on re-parse) plus the shift-type alias overrides
  (`applyTokenAliasesToShiftTypes`). Re-parse applies the codes immediately
  (`buildCodeOverridesFromAnswers`); repeat documents of the same layout
  resolve them via the matched profile. Dismissing the assistant downgrades
  the diagnostic to an explicit exclusion notice — the drop is surfaced,
  never silent.
- **Month/year conflict**: the month/year selects are the authoritative user
  context. Document evidence (`detectedContext`, only when period detection
  actually succeeded, never for TYPE_MULTI multi-month documents) that
  conflicts with the selection raises a blocking `MONTH_MISMATCH`; the user
  explicitly chooses "use selected" (out-of-month dates are excluded via
  `filterShiftsToContext`), "use detected" (reparse) or cancel. No
  cross-month import, no silent override.
- **Zero shifts**: `BLOCKED` + `NO_SHIFTS_FOUND` with the best concrete
  reason (no cell values / all codes unknown / employee row missing / no
  date alignment / unsupported layout / cause undetermined). Never rendered
  as READY/CORRECT; confirm stays disabled with an explanation.
- **Employee recovery**: unchanged (UNKNOWN/AMBIGUOUS_EMPLOYEE → row
  selection question); persisted profiles keep only the structural
  `manual-row` strategy + rowIndex, never the printed label.

### 5.4 Out of scope (known, classified for follow-up)
- GS-04/GS-05 XLSX parser crash (surfaces as `FAILED`/`PARSER_FAILURE`).
- GS-06 irregular CSV parser defect.
- OCR extraction inconsistencies.
