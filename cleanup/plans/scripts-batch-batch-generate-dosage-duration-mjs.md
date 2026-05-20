# CLN-008 Finish the dosage/duration generator split into reusable pipeline modules

- **Status**: ✅ DONE
- **File**: `scripts/batch/batch-generate-dosage-duration.mjs`
- **Current size**: 827 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Batch pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The file still bundles CLI parsing, article loading, prompt loading, OpenRouter transport, YAML parsing, merge logic, progress writing, and batch coordination.

## Target End State

- The entrypoint drops below 250 LOC.
- Prompt loading, quote loading, generation, merge logic, and batch orchestration are separate modules.
- The shared batch helpers absorb duplicated sanitize and retry behavior.

## Ordered Work Plan

1. Safety net and inventory
- Add fixture coverage for YAML extraction and merge behavior, especially the pharmacology-owned field preservation rules.
- Extract quote loading, prompt loading, and persistence into dedicated modules.
- Move YAML parsing plus merge behavior into pure helpers with direct tests.
- Use shared batch-runner utilities for concurrency, progress reporting, and retry handling wherever possible.
- Retain CLI compatibility and verify dry-run plus representative single-substance flows.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The generator entrypoint is thin.
- [x] Preservation of bioavailability and half-life fields is covered by tests.
- [x] Remaining batch logic is shared rather than copied.
- [x] The central tracker entry for CLN-008 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting CLI/config, article selection and preservation logic, quote/prompt loading, OpenRouter transport, YAML parsing, and persistence/progress writing into `scripts/batch/dosage-duration/`.
- Reused existing shared batch helpers for CLI parsing, runner framing, and Convex key sanitization instead of keeping local copies.
- Added `lib/batchGenerateDosageDuration.test.ts` to cover YAML extraction, review-context construction, and preservation of `bioavailability` / `half_life` fields during merges.
- Verification run:
  - `npm run test -- lib/batchGenerateDosageDuration.test.ts`
  - `node scripts/batch/batch-generate-dosage-duration.mjs --dry-run --substance=lsd`
  - `npm run typecheck`
  - `wc -l scripts/batch/batch-generate-dosage-duration.mjs scripts/batch/dosage-duration/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
