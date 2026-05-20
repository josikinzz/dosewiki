# CLN-039 Quarantine archival artifact dosage-duration-rewrite-article-payloads.json

- **Status**: ⬜ TODO
- **File**: `notes-and-plans/exports/openrouter/dosage-duration-rewrite-article-payloads.json`
- **Current size**: 5093 LOC
- **Category**: Artifact archive
- **Priority**: P2
- **Effort**: S
- **Strategy**: Archive containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This oversized export or backup should be treated as an archival artifact, not as living source code in the main review path.

## Target End State

- The artifact is either moved to external storage, compressed, or replaced by a small manifest in the repo.
- Provenance and retrieval instructions are preserved without keeping a giant mutable blob in the active tree.
- Review workflows no longer have to inspect this file directly.

## Ordered Work Plan

1. Safety net and inventory
- Record the artifact provenance, generation command, timestamp, and checksum in a small manifest.
- Move or redesign the artifact so the repo keeps only the metadata needed to retrieve or regenerate it.
- Update any scripts or docs that still point directly at the giant file.
- Treat the artifact as read-only history rather than a maintenance target.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The large archival blob is no longer part of routine review work.
- [ ] Retrieval and provenance remain documented.
- [ ] The central tracker entry for CLN-039 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
