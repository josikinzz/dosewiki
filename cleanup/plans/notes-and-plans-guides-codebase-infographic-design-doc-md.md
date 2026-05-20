# CLN-057 Split and tighten oversized documentation in codebase-infographic-design-doc.md

- **Status**: 🚫 RETIRED FROM ACTIVE SCOPE
- **File**: `notes-and-plans/guides/codebase-infographic-design-doc.md`
- **Current size**: 676 LOC
- **Category**: Documentation
- **Priority**: P2
- **Effort**: S
- **Strategy**: Documentation segmentation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This markdown file is large enough that overview, implementation detail, historical notes, and reference material are probably mixed together.

## Target End State

- A concise landing document remains.
- Appendix, history, and detailed reference content move to companion docs.
- Readers can reach the right level of detail without scrolling a monolith.

## Ordered Work Plan

1. Safety net and inventory
- Identify which sections are current guidance versus historical or appendix material.
- Split supporting material into companion docs and leave a short index or summary at the original path.
- Add cross-links and ownership notes so the smaller docs stay synchronized.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The main doc is under the target size and acts as an index or current-state summary.
- [x] Supporting detail is preserved without bloating the landing document.
- [x] The central tracker entry for CLN-057 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Scope Note

- This plan is no longer part of the active cleanup burn-down after the user narrowed the program to code files only.
- The document changes already made remain in the repo, but this plan is excluded from cleanup progress accounting.
