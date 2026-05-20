# CLN-007 Modularize dosage and duration prepopulation heuristics

- **Status**: ✅ DONE
- **File**: `scripts/prepopulate/prepopulate-dosage-duration.mjs`
- **Current size**: 835 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Script modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

Normalization maps, route selection heuristics, dose and duration transforms, article filtering, and persistence all live together.

## Target End State

- Configuration maps live apart from transformation logic.
- Dose-source selection and duration-source selection are isolated and testable.
- The script entrypoint only loads data, invokes the pipeline, and writes results.

## Ordered Work Plan

1. Safety net and inventory
- Add fixture tests for route normalization, safest-dose selection, duration source precedence, and merge behavior.
- Extract normalization constants and route/unit helpers into a small config module.
- Split dose-selection and duration-selection heuristics into separate strategy modules.
- Move article filtering and writeback concerns into a persistence or runner layer.
- Keep CLI flags and dry-run behavior unchanged while shrinking the shell.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Heuristic selection logic is directly testable.
- [x] The entry script is under the cleanup threshold.
- [x] Data writes stay isolated from domain calculations.
- [x] The central tracker entry for CLN-007 is updated with implementation notes, verification status, and any follow-on blockers.

## Execution Notes

- Completed on 2026-04-23 by extracting route/unit normalization, dosage selection heuristics, duration selection heuristics, processing, and summary reporting into `scripts/prepopulate/dosage-duration/`.
- Reduced `scripts/prepopulate/prepopulate-dosage-duration.mjs` to a small CLI shell that only parses flags, loads JSON, runs the pipeline, and conditionally writes output.
- Added `lib/prepopulateDosageDuration.test.ts` to cover route normalization, safest-dose selection, tier merge behavior, duration precedence, and schema-shape transformation.
- Verification run:
  - `npm run test -- lib/prepopulateDosageDuration.test.ts`
  - `node scripts/prepopulate/prepopulate-dosage-duration.mjs --dry-run --substance=lsd`
  - `npm run typecheck`
  - `wc -l scripts/prepopulate/prepopulate-dosage-duration.mjs scripts/prepopulate/dosage-duration/*.mjs`

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
