# CLN-001 Replace the monolithic parsed-sources snapshot with a managed artifact strategy

- **Status**: ⬜ TODO
- **File**: `src/data/parsed-sources.json`
- **Current size**: 261576 LOC
- **Category**: Data artifact
- **Priority**: P0
- **Effort**: XL
- **Strategy**: Artifact sharding or offloading
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This repo-tracked JSON snapshot is massive, hard to review, and easy to treat as application state even though Convex and runtime helpers are the real source of truth.

## Target End State

- Parsed source output is either sharded by substance/domain or moved to an external artifact store with a small manifest kept in-repo.
- The repo keeps only the metadata required to regenerate or fetch the artifact.
- Consumers stop depending on one giant tracked blob.

## Ordered Work Plan

1. Safety net and inventory
- Inventory every consumer of `parsed-sources.json` and separate active runtime use from batch-tooling use.
- Decide whether this data should be sharded in-repo, compressed in an artifact bucket, or regenerated on demand.
- Create a manifest format with provenance, generation command, timestamp, and checksum.
- Refactor scripts to load through the manifest or shard layer instead of assuming one monolithic JSON file.
- Document the new artifact workflow and remove the giant blob from the hot path.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The codebase no longer relies on one 260k-line JSON file in the main tree.
- [ ] Artifact provenance is explicit.
- [ ] Runtime source-of-truth boundaries are harder to violate accidentally.
- [ ] The central tracker entry for CLN-001 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
