# CLN-030 Split DrugBank parsing by chemical, pharmacology, and interaction concerns

- **Status**: ✅ DONE
- **File**: `scripts/parsers/drugbank.ts`
- **Current size**: 551 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Parser decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The file combines chemical-information parsing, pharmacology extraction, interaction parsing, food interactions, and narrative overview assembly.

## Target End State

- `DrugBankParser` becomes a thin adapter.
- Chemical information, pharmacology, and interaction parsing live in separate focused modules.
- Helper text cleaning is shared without making the parser re-grow.

## Ordered Work Plan

1. Safety net and inventory
- Add fixture-based tests for representative chemical, pharmacology, and interaction sections.
- Extract chemical-information parsing into a dedicated module with multiline-formula handling covered by tests.
- Move pharmacology parsing and overview narrative assembly into separate modules.
- Split drug and food interaction parsing so each can evolve independently.
- Retain a stable parser result shape and compare output snapshots after the split.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] `scripts/parsers/drugbank.ts` is below budget and mainly composes modules.
- [x] Each parsing concern has direct tests.
- [x] Text-cleaning helpers are reused intentionally rather than duplicated.
- [x] The central tracker entry for CLN-030 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/parsers/drugbank.ts` is now a 48 LOC adapter over focused helpers in `scripts/parsers/drugbank/`.
- Chemical-information parsing, pharmacology parsing, interaction parsing, and overview narrative collection now live in separate modules instead of one mixed parser file.
- Added `lib/drugbankParser.test.ts` to cover multiline formula normalization, structured pharmacology extraction, interaction severity capture, food interactions, and overview narrative preservation.
