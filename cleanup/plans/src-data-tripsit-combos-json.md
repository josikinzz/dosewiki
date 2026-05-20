# CLN-013 Document and constrain the TripSit combos dataset as a generated data asset

- **Status**: ⬜ TODO
- **File**: `src/data/tripsit-combos.json`
- **Current size**: 9053 LOC
- **Category**: Data artifact
- **Priority**: P1
- **Effort**: M
- **Strategy**: Data containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The dataset is large enough that it needs explicit ownership, generation rules, and review boundaries instead of being treated like ordinary source code.

## Target End State

- The file is clearly documented as a generated or imported dataset.
- Only the minimal consumable structure remains in the repo, or the dataset is sharded if reviewability demands it.
- Update provenance is tracked.

## Ordered Work Plan

1. Safety net and inventory
- Document the upstream source, refresh process, and expected schema for the combos dataset.
- Evaluate whether the dataset should be sharded by interaction severity or other natural partitions.
- Add a schema validation step so large updates fail fast instead of being reviewed as raw blob diffs.
- Keep only the form of the data that the runtime or scripts actually need.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The dataset is governed as data, not as hand-edited source.
- [ ] Validation and provenance are explicit.
- [ ] The central tracker entry for CLN-013 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
