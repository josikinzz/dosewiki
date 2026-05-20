# CLN-025 Split architecture guidance into current-state architecture and supporting appendices

- **Status**: 🚫 RETIRED FROM ACTIVE SCOPE
- **File**: `ARCHITECTURE.md`
- **Current size**: 600 LOC
- **Category**: Documentation
- **Priority**: P1
- **Effort**: M
- **Strategy**: Documentation segmentation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The architecture doc is becoming both a living reference and a history-of-the-system narrative, which will make it harder to keep current.

## Target End State

- The top-level architecture doc stays focused on current state and contributor decision support.
- Large subsystem deep dives move into appendices or dedicated docs.
- Update triggers remain explicit.

## Ordered Work Plan

1. Safety net and inventory
- Separate current-state architecture from subsystem deep-dive material and historical narrative.
- Create companion docs for editor workflows, data pipelines, or deployment details if those sections dominate the file.
- Leave a concise system map plus clear links from the root doc.
- Add section owners or update triggers for each companion doc.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] `ARCHITECTURE.md` is a high-signal entry document rather than a monolith.
- [x] Detailed reference material lives where it changes.
- [x] The central tracker entry for CLN-025 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Scope Note

- This plan is no longer part of the active cleanup burn-down after the user narrowed the program to code files only.
- The document changes already made remain in the repo, but this plan is excluded from cleanup progress accounting.
