# CLN-070 Document Bun lockfile ownership and coexistence rules

- **Status**: ⬜ TODO
- **File**: `bun.lock`
- **Current size**: 1968 LOC
- **Category**: Lockfile
- **Priority**: P3
- **Effort**: S
- **Strategy**: Tooling policy
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The Bun lockfile is expected to be large, but without a clear authority policy it adds avoidable review noise.

## Target End State

- Bun usage and lockfile authority are clearly documented.
- Dual-lock workflows are either justified or removed.
- Future cleanup work treats lockfiles as managed artifacts rather than source debt.

## Ordered Work Plan

1. Safety net and inventory
- Confirm when Bun is required versus optional in this repo.
- Document whether `bun.lock` is authoritative, mirrored, or transitional.
- If dual lockfiles remain, document how and when both are refreshed.
- Keep future dependency changes isolated so the lockfile remains a managed exception.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The lockfile is a governed artifact rather than an unexplained giant file.
- [ ] Contributors know which package manager is canonical.
- [ ] The central tracker entry for CLN-070 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
