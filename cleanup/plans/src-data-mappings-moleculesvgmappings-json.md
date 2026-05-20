# CLN-016 Constrain molecule SVG mappings behind validation and optional sharding

- **Status**: ⬜ TODO
- **File**: `src/data/mappings/moleculeSvgMappings.json`
- **Current size**: 2177 LOC
- **Category**: Data artifact
- **Priority**: P1
- **Effort**: M
- **Strategy**: Data normalization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The mapping is large enough that it needs schema validation and clear provenance rather than living as an opaque blob.

## Target End State

- The mapping is validated automatically.
- If manual editing remains common, it is split into smaller reviewable units.
- The generation or curation workflow is documented.

## Ordered Work Plan

1. Safety net and inventory
- Define the expected mapping schema and required invariants.
- Document the source of truth for molecule asset names and mapping keys.
- Split the file by asset family or alphabetical range if manual maintenance is still needed.
- Add a check that detects stale asset references.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Large mapping changes can be validated automatically.
- [ ] Humans can review targeted slices when needed.
- [ ] The central tracker entry for CLN-016 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
