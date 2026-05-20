# CLN-014 Normalize the title/IUPAC/SMILES mapping into owned data modules

- **Status**: ⬜ TODO
- **File**: `src/data/mappings/titleIupacSmiles.json`
- **Current size**: 2931 LOC
- **Category**: Data artifact
- **Priority**: P1
- **Effort**: M
- **Strategy**: Data normalization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A very large mapping blob hides key ownership and makes small mapping updates difficult to review.

## Target End State

- Mapping ownership and generation rules are explicit.
- The file is sharded or derived from smaller authoritative inputs.
- Schema validation protects the mapping shape.

## Ordered Work Plan

1. Safety net and inventory
- Determine whether the mapping is hand-curated, imported, or generated, and document that status.
- Split the mapping by natural key range or semantic domain if manual review still matters.
- Add a schema or integrity check for required keys and duplicate titles.
- Expose a documented regeneration path instead of relying on ad hoc blob edits.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Mapping updates are reviewable.
- [ ] Ownership and validation are clear.
- [ ] The central tracker entry for CLN-014 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
