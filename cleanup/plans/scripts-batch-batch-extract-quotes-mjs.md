# CLN-026 Separate quote extraction workflow stages into dedicated modules

- **Status**: ✅ DONE
- **File**: `scripts/batch/batch-extract-quotes.mjs`
- **Current size**: 592 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Batch pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

Prompt loading, source-file inspection, OpenRouter transport, output formatting, save logic, and batch coordination all live in one quote extractor.

## Target End State

- Quote extraction uses a small command shell over loader, formatter, and persistence modules.
- Category metadata is configuration rather than embedded flow control.
- Large-file handling and resume logic are directly testable.

## Ordered Work Plan

1. Safety net and inventory
- Add fixtures that cover category selection, resume behavior, large-file warnings, and output formatting.
- Move category configuration into its own module with a clear schema.
- Extract source loading, prompt assembly, and output persistence into separate helpers.
- Shrink `processSubstance()` and `processAll()` by delegating file system and formatting concerns.
- Retain CLI compatibility and verify representative category runs.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Category rules are data-driven.
- [x] The main command is comfortably below 250 LOC.
- [x] Resume and large-file behavior are protected by tests.
- [x] The central tracker entry for CLN-026 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting the quote extractor into dedicated CLI, category configuration, source loading, formatting/output, OpenRouter, and runner modules under `scripts/batch/extract-quotes/`.
- Category behavior is now configuration-driven through `scripts/batch/extract-quotes/categories.mjs`, and the command shell only coordinates selection, preview, and summary output.
- Added `lib/batchExtractQuotes.test.ts` to cover category metadata, excluded-source messaging, output formatting, and large-file detection behavior.
- Verification run:
  - `npm run test -- lib/batchExtractQuotes.test.ts`
  - `node scripts/batch/batch-extract-quotes.mjs --category=legality --dry-run --limit=3`
  - `npm run typecheck`
  - `wc -l scripts/batch/batch-extract-quotes.mjs scripts/batch/extract-quotes/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
