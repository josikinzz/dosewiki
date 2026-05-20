# CLN-062 Contain oversized data artifact iupacSmilesMap.json

- **Status**: ⬜ TODO
- **File**: `src/data/mappings/iupacSmilesMap.json`
- **Current size**: 577 LOC
- **Category**: Data artifact
- **Priority**: P2
- **Effort**: S
- **Strategy**: Data containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This tracked data blob is large enough that it should be governed as an artifact with explicit provenance and regeneration rules.

## Target End State

- The file is either sharded, generated, or replaced by a manifest-backed artifact workflow.
- Validation and provenance are explicit.
- Reviewers no longer have to reason about the whole blob at once.

## Ordered Work Plan

1. Safety net and inventory
- Document the upstream source, generation path, and consumers of this data file.
- Decide whether the file should be sharded, moved, or kept only as a generated artifact.
- Add validation and checksum rules so future updates are machine-checked.
- Update docs or scripts so the artifact is treated as data, not hand-maintained source.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Artifact ownership is explicit.
- [ ] The file is either smaller, sharded, or outside the active maintenance surface.
- [ ] The central tracker entry for CLN-062 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
