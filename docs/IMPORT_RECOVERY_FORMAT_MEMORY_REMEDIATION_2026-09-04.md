# Ingestion Pipeline Remediation: State Contract, Recovery Strategy & Format Memory v1

**Date:** 2026-09-04  
**Status:** Completed  
**Branch:** `development` (HEAD: `35525b5`)  
**Scope:** Ingestion pipeline state contract, recovery metadata, Format Memory lifecycle (learn, candidate, admin validate, reuse, tenant isolation), XLSX zero-employee handling, team roster parity, and end-to-end testing against real Neon Development database.

---

## 1. Executive Summary

This remediation completes the architectural stabilization of the Anclora ShiftImport ingestion pipeline and Format Memory system. Initiated during a prior engineering session, this phase formalized the state machine, eliminated silent error swallowing, added single-source-of-truth recovery metadata, and proved the end-to-end Format Memory learning loop via Playwright E2E testing against the live Neon dev environment.

All tests passed with zero failures, zero linter warnings, and successful production build validation.

---

## 2. Root Cause Analysis

Prior to this remediation:
1. **Divergent Recovery Decision Logic:** UI components (`ImportModal.tsx`) made ad-hoc decisions about whether to show the assistant or error screens, creating discrepancies with `ImportDiagnosis.state`. In particular, `BLOCKED` (intended to be a terminal, non-recoverable state) was sometimes conflated with `NEEDS_USER_INPUT` (which requires interactive clarification).
2. **Technical Parser Errors on Clean Empty Files:** When an XLSX file lacked matching employee rows (e.g. zero employee match), `parseXlsxWorkbook` threw an unhandled `IngestionError('NO_SHIFTS_FOUND')`, which `diagnosisFromError` mapped to `PARSER_FAILURE` (`FAILED`) instead of a structured empty result that cleanly classifies as `BLOCKED`.
3. **Silent Persistence Swallowing:** In `ProfileAssistantPanel.tsx` and `ImportModal.tsx`, format profile saves called `saveFormatProfileRemote(...).catch(() => {})`. If remote persistence failed (e.g., network error or schema mismatch), the failure was completely invisible to users and operators, though local shift import proceeded.
4. **VLM Trigger Overhead:** The VLM visual fallback trigger evaluated fallback rules even when deterministic assistant questions were fully capable of resolving the layout.

---

## 3. Architecture & State Contract

### 3.1 State Contract Matrix

The canonical state contract governs all document ingestion outcomes across 6 discrete states:

| State | Recovery Eligible | Recovery Strategy | Assistant Available | Preview Available | Terminal | Description / Fixture |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`READY`** | `false` | `'none'` | No | Yes | Non-terminal | Document parsed completely with zero unresolved ambiguities. Ready to confirm. |
| **`NEEDS_USER_INPUT`** | `true` | `'answer-question'` | Yes | No | Non-terminal | Document structure or tokens require user clarification before shifts can be extracted. |
| **`PARTIAL`** | `false`* | `'none'` | No | Yes | Non-terminal | Usable shifts extracted, but some items/times are unmapped (`safeToImportPartial: true`). User can review/edit. |
| **`BLOCKED`** | `false` | `'none'` | No | No | **Terminal** | Non-recoverable condition (e.g., month mismatch, employee not found in document, clean zero shifts). |
| **`UNSUPPORTED`** | `false` | `'none'` | No | No | **Terminal** | File format or structure is not supported by any known parser. |
| **`FAILED`** | `false` | `'none'` | No | No | **Terminal** | Unhandled exception, corrupted file, or fatal parser failure. |

*\*Note: When `PARTIAL` contains unclassified tokens that can be learned, recovery can transition via assistant, but once shifts are generated with time gaps, recovery strategy is `'none'` while remaining safely editable.*

### 3.2 Recovery Metadata Schema

Defined in `src/ingestion/diagnostics.ts`:
```typescript
export interface ImportRecovery {
  eligible: boolean;
  strategy: 'answer-question' | 'retry-different-format' | 'manual-entry' | 'none';
  reason?: string;
}

export interface ImportDiagnosis {
  state: ImportState;
  recovery: ImportRecovery;
  // ... other fields
}
```

The recovery metadata is computed strictly server-side/pipeline-side via `computeRecovery(state, questions, options)` and is attached to every `ImportDiagnosis`. The UI never recomputes recovery eligibility.

---

## 4. Key Implementation Details

### 4.1 Ingestion Diagnostics (`src/ingestion/diagnostics.ts`)
- Added `ImportRecovery` type and `computeRecovery()` helper.
- Standardized `finishDiagnosis()` and `diagnosisFromError()` to always include `recovery`.
- Ensured `BLOCKED`, `UNSUPPORTED`, and `FAILED` always produce `eligible: false`.

### 4.2 File Parsing (`src/ingestion/parsers/file.ts`)
- In `parseXlsxWorkbook()`, when zero shifts are detected for an employee, instead of throwing `IngestionError('NO_SHIFTS_FOUND')`, it returns `{ shifts: [], detectedEmployeeName: ... }`.
- Downstream diagnosis receives an empty shift array and classifies the result cleanly as `BLOCKED` with reason `NO_SHIFTS_FOUND`.

### 4.3 VLM Fallback Trigger (`src/ingestion/vlm-trigger.ts`)
- Added check `isAssistantActionable()`: if deterministic assistant questions already exist and can resolve the document, VLM fallback is skipped with reason `assistant-actionable`.

### 4.4 Format Memory & Non-blocking Persistence Alerts
- **Observability:** Replaced empty `.catch(() => {})` blocks in `ProfileAssistantPanel.tsx` and `ImportModal.tsx` with structured logger calls (`console.warn('[FormatMemory] Failed to persist profile candidate:', err)`).
- **User Feedback:** Added non-blocking alert banners using newly added localized keys (`formatMemorySaveFailed`, `formatMemoryUnavailable` in `src/lib/i18n.ts`). Shift import continues uninterrupted even if format profile saving fails.

### 4.5 Team / Bulk Ingestion Audit (`TeamImportModal.tsx`)
- Audited `parseXlsxTeamWorkbook`, `detectTeamRoster`, and `detectImportFlow`.
- Confirmed zero-employee workbooks yield empty results and set `uploadError` gracefully without unhandled exceptions or breaking the UI modal.

---

## 5. Test Verification Matrix

### 5.1 Unit & Integration Suite (`Vitest`)
- **Total Test Files:** 95 passed (95 total)
- **Total Tests:** 967 passed (967 total)
- **Execution Time:** ~77s
- **Key Suites:**
  - `src/ingestion/fixtures/state-contract/state-contract.test.ts` (12/12 passing)
  - `src/ingestion/diagnostics.test.ts` (13/13 passing)
  - `src/ingestion/parsers/file.test.ts` (10/10 passing)
  - `src/ingestion/vlm-trigger.test.ts` (22/22 passing)
  - `src/components/shift-dashboard/ImportModal.test.tsx` (26/26 passing)
  - `src/components/shift-dashboard/ProfileAssistantPanel.test.tsx` (12/12 passing)
  - `src/components/shift-dashboard/TeamImportModal.test.tsx` (14/14 passing)

### 5.2 Code Quality & Build Validation
- **ESLint:** `npm run lint` exited 0 (0 errors, 0 warnings with `--max-warnings 0`).
- **TypeScript & Vite:** `npm run build` exited 0 (clean compilation and production asset generation).

### 5.3 End-to-End Format Memory Suite (`Playwright`)
Executed against local Vercel Dev server (`http://localhost:3199`) and real Neon Development database (`holy-cake-85660318`):
```text
Running 5 tests using 1 worker
  ✓ 1 EMPLOYEE (Ana): first import teaches the format, candidate created (54.7s)
  ✓ 2 ADMIN (Carlos): confirms the candidate in "Formatos aprendidos", status becomes validated (43.4s)
  ✓ 3 EMPLOYEE (Ana): re-importing the SAME fixture asks zero questions, reaches READY, use-count increments (58.0s)
  ✓ 4 Scenario A — second user, same organization: reuses the profile, zero questions (46.8s)
  ✓ 5 Scenario B — different organization: cannot see or use the profile (isolation) (43.6s)

5 passed (4.3m)
```
- **Metrics Verified in E2E:**
  - `questions_first_import`: 2
  - `candidate_created`: true (`candidate` status)
  - `admin_confirmed`: true (`validated` status)
  - `questions_second_import`: 0
  - `profile_use_count`: incremented from 0 to 1
  - `successful_use_count`: incremented from 0 to 1
  - `tenant_isolation`: Org B could not see or reuse Org A's profile candidate/format.

---

## 6. Repository Integrity & Governance
- No commits or branch promotions performed.
- All modifications are confined to working copy for human review.
- Zero PII introduced. Synthetic test fixtures used exclusively.
