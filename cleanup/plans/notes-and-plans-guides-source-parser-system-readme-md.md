# CLN-015 Split the source parser guide into runbook, architecture, and adapter reference docs

- **Status**: ⬜ TODO
- **File**: `notes-and-plans/guides/source-parser-system-readme.md`
- **Current size**: 2332 LOC
- **Category**: Documentation
- **Priority**: P1
- **Effort**: M
- **Strategy**: Documentation segmentation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The parser system document is doing overview, quick start, architecture, parser catalog, and review tracking in one place.

## Target End State

- A short overview remains the landing page.
- Detailed adapter reference and operational runbook content move into dedicated companion docs.
- The live doc is easier to keep current.

## Ordered Work Plan

1. Safety net and inventory
- Separate quick-start and operational runbook content from deep parser reference material.
- Move the parser-by-parser adapter catalog into its own appendix or reference file.
- Extract any tracker or historical content into a clearly dated companion document.
- Add ownership notes and update triggers so the landing page stays current.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The landing guide is under the doc budget.
- [ ] Operational and reference content are easier to maintain independently.
- [ ] The central tracker entry for CLN-015 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
