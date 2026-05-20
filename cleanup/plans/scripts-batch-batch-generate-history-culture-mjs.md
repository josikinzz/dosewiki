# CLN-021 Refactor the history/culture generator into a standard batch pipeline shape

- **Status**: ✅ DONE
- **File**: `scripts/batch/batch-generate-history-culture.mjs`
- **Current size**: 674 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Batch pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This file repeats the same oversized pattern as the other batch generators: CLI handling, prompt loading, OpenRouter transport, parsing, progress output, and persistence.

## Target End State

- History/culture generation uses the same shared pipeline seams as the other batch commands.
- The script mainly declares section-specific behavior and delegates the rest.
- Progress and persistence are not embedded inline.

## Ordered Work Plan

1. Safety net and inventory
- Snapshot current dry-run and single-substance behavior before changing structure.
- Extract quote loading, prompt loading, and YAML parsing into reusable helpers.
- Push common retry, progress, and result-summary logic into the shared batch library.
- Keep only the history/culture-specific generation contract in the entry script.
- Verify `--all` and `--new-only` logic after the split.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The file is a thin command wrapper.
- [x] The section-specific behavior is easy to find.
- [x] Batch infrastructure is shared instead of duplicated.
- [x] The central tracker entry for CLN-021 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting the history/culture generator into dedicated CLI, loader, prompt/parser, OpenRouter, and persistence modules under `scripts/batch/history-culture/`.
- Reused shared batch banner/summary output and Convex field sanitization helpers instead of keeping local copies.
- Added `lib/batchGenerateHistoryCulture.test.ts` to cover YAML extraction and fresh-slate prompt construction.
- Verification run:
  - `npm run test -- lib/batchGenerateHistoryCulture.test.ts`
  - `node scripts/batch/batch-generate-history-culture.mjs --dry-run --substance=lsd`
  - `npm run typecheck`
  - `wc -l scripts/batch/batch-generate-history-culture.mjs scripts/batch/history-culture/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
