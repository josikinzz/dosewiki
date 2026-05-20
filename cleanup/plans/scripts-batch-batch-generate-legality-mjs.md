# CLN-027 Reduce the legality generator to a thin section-specific wrapper

- **Status**: ✅ DONE
- **File**: `scripts/batch/batch-generate-legality.mjs`
- **Current size**: 572 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Batch pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The file still repeats generic batch-generator concerns instead of isolating legality-specific behavior.

## Target End State

- The command delegates generic batch work to shared modules.
- Legality-specific prompt, parsing, and persistence rules are the only custom logic left inline.
- Sanitization and retry logic are not duplicated here.

## Ordered Work Plan

1. Safety net and inventory
- Capture dry-run and single-substance baseline behavior.
- Extract prompt and quote loading plus YAML parsing into small helpers.
- Reuse shared batch utilities for retries, summaries, and progress handling.
- Keep only the legality-specific field merge path in the entry script.
- Verify representative CLI flows after the split.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The legality command is no longer a generic batch framework in disguise.
- [x] Shared helpers own the infrastructure concerns.
- [x] The file stays under the budget.
- [x] The central tracker entry for CLN-027 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting the legality generator into dedicated CLI, loader, parser/prompt, OpenRouter, and persistence modules under `scripts/batch/legality/`.
- Reused shared batch banner/summary output and Convex field sanitization helpers instead of carrying duplicated infrastructure inside the command.
- Added `lib/batchGenerateLegality.test.ts` to cover YAML extraction and fresh-slate legality prompt construction.
- Verification run:
  - `npm run test -- lib/batchGenerateLegality.test.ts`
  - `node scripts/batch/batch-generate-legality.mjs --dry-run --substance=lsd`
  - `npm run typecheck`
  - `wc -l scripts/batch/batch-generate-legality.mjs scripts/batch/legality/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
