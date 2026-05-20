# CLN-009 Break the harm-potential generator into loader, generator, and persistence layers

- **Status**: ✅ DONE
- **File**: `scripts/batch/batch-generate-harm-potential.mjs`
- **Current size**: 781 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Batch pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The script still owns CLI behavior, quote loading, prompt loading, OpenRouter calls, YAML normalization, harm-potential normalization, and full batch orchestration.

## Target End State

- The file becomes a thin batch command wrapper.
- Normalization of generated harm-potential data is isolated and tested.
- Shared OpenRouter and batch-runner utilities handle the generic pipeline concerns.

## Ordered Work Plan

1. Safety net and inventory
- Add direct tests for YAML parsing and `normalizeHarmPotential()` edge cases.
- Extract quote loading and prompt loading into small dedicated modules.
- Move normalization and persistence logic into pure or near-pure helpers.
- Replace copied sanitize and retry helpers with shared batch-library utilities.
- Verify `--all`, `--limit`, and dry-run behavior against representative fixtures.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Normalization rules are documented in code and directly tested.
- [x] The entry script is well below the cleanup threshold.
- [x] The command no longer changes for unrelated pipeline concerns.
- [x] The central tracker entry for CLN-009 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by splitting the harm-potential generator into dedicated CLI, loader, OpenRouter, normalization/parser, and persistence modules under `scripts/batch/harm-potential/`.
- Reused shared batch CLI parsing, summary output, and Convex field sanitization instead of keeping local copies in the command wrapper.
- Added `lib/batchGenerateHarmPotential.test.ts` to cover YAML parsing, schema normalization, and prompt construction.
- Verification run:
  - `npm run test -- lib/batchGenerateHarmPotential.test.ts`
  - `node scripts/batch/batch-generate-harm-potential.mjs --dry-run --substance=lsd`
  - `npm run typecheck`
  - `wc -l scripts/batch/batch-generate-harm-potential.mjs scripts/batch/harm-potential/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
