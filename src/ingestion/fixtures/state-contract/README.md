# State-contract fixtures

Six canonical scenarios exercising `ImportState` (`src/ingestion/diagnostics.ts`)
end to end, via `analyzeDocumentFile` + `buildImportDiagnosis`/`diagnosisFromError`.
All content is synthetic (no real employee data), per `AGENTS.md`.

`ImportState` has exactly six values, so each fixture below maps 1:1 to one
value — no parallel taxonomy is introduced (see `AGENTS.md` "Reglas para
cambios"). `ImportDiagnosis.recovery` (`{ eligible, strategy, reason }`) is
the single source of truth for whether the assistant can help right now;
`ImportModal` never recomputes this.

| # | Fixture | State | recovery.eligible | Assistant |
|---|---------|-------|--------------------|-----------|
| 01 | Complete roster CSV | `READY` | false (nothing to recover) | no |
| 02 | Unknown employee against a known PDF layout | `NEEDS_USER_INPUT` | true (`answer-question`) | yes |
| 03 | Mixed complete/incomplete work shifts | `PARTIAL` | true when unresolved codes remain, else false for pure time gaps | yes when actionable |
| 04 | XLSX with zero recognizable employees | `BLOCKED` | false (structurally nothing to ask — excel has no question engine yet) | no |
| 05 | `.txt` upload | `UNSUPPORTED` | false | no |
| 06 | CSV with malformed quoting | `FAILED` | false | no |

Note on `BLOCKED`: in this codebase's actual state machine, a diagnostic can
only be `recoverable: true` when `questions.length > 0`, and whenever
`questions.length > 0` the zero-shifts branch resolves to `NEEDS_USER_INPUT`,
never `BLOCKED` (`diagnostics.ts` `buildImportDiagnosis`, step 3). So
`BLOCKED` is, by construction, always non-recoverable here — it means "read
successfully, explained, but nothing actionable to ask yet" (fixture 04 is
exactly this, and is also the regression fixture for the XLSX
zero-employees bug fixed alongside this corpus: it used to `throw
NO_SHIFTS_FOUND` and surface as a terminal `FAILED`). The
"understood enough to ask, not yet resolved" case the wider spec calls
"BLOCKED recoverable" is what this repo's `NEEDS_USER_INPUT` already models
(fixture 02) — reusing the existing taxonomy rather than adding a second one
for the same concept.

**Decision (accepted 2026-09-04):** `BLOCKED` stays terminal in this
codebase. Recovery is expressed only through `NEEDS_USER_INPUT` (assistant,
`recovery.eligible=true`) and `PARTIAL` (editable preview + assistant for
the unresolved part). `ImportModal.tsx`'s `showAssistant` reads
`diagnosis.recovery.eligible` + `recovery.strategy === 'answer-question'`
directly — it no longer lists `ImportState` values itself, so this decision
lives in exactly one place (`diagnostics.ts`).
