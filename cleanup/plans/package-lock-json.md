# CLN-069 Decide and document lockfile authority

- **Status**: ⬜ TODO
- **File**: `package-lock.json`
- **Current size**: 12875 LOC
- **Category**: Lockfile
- **Priority**: P3
- **Effort**: S
- **Strategy**: Tooling policy
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A very large lockfile is normal, but it still needs an explicit policy so dependency churn does not create review noise without ownership.

## Target End State

- The repo has a documented authoritative package manager and lockfile policy.
- If dual lockfiles remain, their purpose is explicit.
- Dependency refreshes are intentional rather than incidental.

## Ordered Work Plan

1. Safety net and inventory
- Confirm whether `package-lock.json` is authoritative, secondary, or redundant relative to `bun.lock`.
- Document the dependency-management policy in contributor docs.
- If only one lockfile is needed, plan the migration and removal of the other one in a separate controlled task.
- Keep lockfile updates isolated from unrelated changes during future implementation work.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Lockfile ownership is explicit.
- [ ] Large dependency diffs are governed by policy rather than habit.
- [ ] The central tracker entry for CLN-069 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
