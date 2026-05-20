# CLN-020 Reduce manual index maintenance burden with generation or sectional ownership

- **Status**: ⬜ TODO
- **File**: `src/data/indexes/psychoactiveIndexManual.json`
- **Current size**: 745 LOC
- **Category**: Data artifact
- **Priority**: P1
- **Effort**: M
- **Strategy**: Index containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A manual index of this size is difficult to review and likely mixes curated exceptions with ordinary generated structure.

## Target End State

- Generated portions and manually curated exceptions are separated.
- The repo stores only the data that genuinely needs manual ownership.
- Index validation catches drift.

## Ordered Work Plan

1. Safety net and inventory
- Separate automatically derivable index fields from true manual overrides.
- Move manual exceptions into a smaller dedicated file and generate the combined output.
- Add validation for slug existence, duplicate entries, and category consistency.
- Document the regeneration and review workflow.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The manual index file is substantially smaller or replaced by a curated-overrides layer.
- [ ] Index review focuses on meaningful manual changes.
- [ ] The central tracker entry for CLN-020 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
