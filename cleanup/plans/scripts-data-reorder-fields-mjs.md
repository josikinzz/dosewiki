# CLN-006 Turn the field reorder script into a small orchestration shell

- **Status**: ✅ DONE
- **File**: `scripts/data/reorder-fields.mjs`
- **Current size**: 854 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Script modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The script embeds canonical field order data, a long list of reorder helpers, hashing and audit logic, and CLI execution in one monolith.

## Target End State

- Canonical field order data is derived from or generated beside the schema rather than hand-maintained inline.
- Reorder helpers are grouped by article domain.
- The top-level script only handles args, I/O, and summary output.

## Ordered Work Plan

1. Safety net and inventory
- Add characterization tests for reorder stability and no-data-loss guarantees using fixture articles.
- Move canonical order definitions into section-specific modules or generated metadata sourced from the schema.
- Group reorder helpers by domain such as dosage, duration, effects, pharmacology, legality, and history.
- Extract audit helpers like primitive counting and content hashing into a verification module.
- Reduce `main()` to argument parsing, calling the reordering pipeline, and printing a concise report.
- Keep `--dry-run` and `--verbose` behavior stable with fixture-backed tests.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The entry script is under 250 LOC.
- [x] Manual field order definitions are not duplicated across the script.
- [x] The verification path proves reordering is deterministic and lossless.
- [x] The central tracker entry for CLN-006 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting canonical order metadata into `scripts/data/reorder-fields/orders.mjs`, extracting pure reorder helpers under `scripts/data/reorder-fields/`, and reducing `scripts/data/reorder-fields.mjs` to a small CLI shell.
- Added `lib/reorderFields.test.ts` to verify stable key ordering, preservation of unexpected fields, and deterministic no-data-loss reordering.
- Verification run:
  - `npm run test -- lib/reorderFields.test.ts`
  - `node scripts/data/reorder-fields.mjs --dry-run`
  - `npm run typecheck`
  - `wc -l scripts/data/reorder-fields.mjs scripts/data/reorder-fields/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
