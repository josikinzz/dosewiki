# CLN-019 Archive the completed migration plan and keep only the live post-migration summary

- **Status**: 🚫 RETIRED FROM ACTIVE SCOPE
- **File**: `notes-and-plans/plans/nextjs-authjs-convex-vercel-migration-plan.md`
- **Current size**: 1019 LOC
- **Category**: Documentation
- **Priority**: P1
- **Effort**: M
- **Strategy**: Documentation segmentation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A thousand-line migration plan is now partly historical, which makes it too large to act as a live operational guide.

## Target End State

- A concise current-state summary remains easy to read.
- Historical phase detail is preserved in an archive appendix rather than the live planning surface.
- Contributors can tell what is still actionable.

## Ordered Work Plan

1. Safety net and inventory
- Mark which sections are still actionable versus purely historical.
- Promote the still-relevant current-state guidance into a shorter live document.
- Move completed phase detail and migration chronology into a dated archive companion.
- Add a short pointer from the live summary back to the historical archive for context.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The live migration guidance is no longer a 1000-line file.
- [x] Historical context is preserved without dominating current docs.
- [x] The central tracker entry for CLN-019 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Scope Note

- This plan is no longer part of the active cleanup burn-down after the user narrowed the program to code files only.
- The document changes already made remain in the repo, but this plan is excluded from cleanup progress accounting.
