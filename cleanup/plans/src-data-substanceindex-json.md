# CLN-002 Demote the giant SubstanceIndex snapshot from pseudo-runtime state

- **Status**: ⬜ TODO
- **File**: `src/data/SubstanceIndex.json`
- **Current size**: 176999 LOC
- **Category**: Data artifact
- **Priority**: P0
- **Effort**: XL
- **Strategy**: Artifact sharding or offloading
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This file is still extremely large, easy to edit unsafely, and close enough to runtime paths that contributors can mistake it for the live source of truth.

## Target End State

- The repo retains only the minimal export artifact format truly needed for offline workflows.
- Large article data is sharded, archived, or regenerated through a documented pipeline.
- Convex remains the clearly documented live authority.

## Ordered Work Plan

1. Safety net and inventory
- Map all remaining readers and writers of `SubstanceIndex.json`, including scripts and any public export paths.
- Decide whether the artifact should be sharded by slug, compressed, or replaced with a manifest plus export command.
- Remove any workflow that treats the file as the editing surface when Convex or dedicated APIs should own the change.
- Add a documented export/import path so offline recovery still works without a giant tracked blob.
- Update repo docs to state exactly when this artifact should exist and how it is regenerated.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The file is no longer an active maintenance bottleneck.
- [ ] Source-of-truth boundaries are explicit and enforceable.
- [ ] Offline recovery remains possible through a documented artifact workflow.
- [ ] The central tracker entry for CLN-002 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
