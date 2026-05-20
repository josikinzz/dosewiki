# CLN-031 Retire or consolidate the duplicate harm-potential prompt document

- **Status**: ⬜ TODO
- **File**: `notes-and-plans/harm.md`
- **Current size**: 546 LOC
- **Category**: Prompt doc
- **Priority**: P1
- **Effort**: S
- **Strategy**: Prompt consolidation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This prompt file appears to duplicate section-prompt content and creates uncertainty about the canonical harm-potential prompt source.

## Target End State

- One canonical harm-potential prompt source remains.
- Any alternate consumer-facing wrapper becomes a thin pointer or generated derivative.
- Prompt ownership is obvious.

## Ordered Work Plan

1. Safety net and inventory
- Compare this file against the active section prompt and identify whether it is canonical, legacy, or derived.
- Choose one canonical source for harm-potential prompt content.
- If this file must remain, reduce it to a pointer, wrapper, or generated export rather than a second full copy.
- Document prompt ownership in the relevant prompt-system docs.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] There is no ambiguity about which harm-potential prompt is authoritative.
- [ ] Duplicated prompt maintenance risk is removed.
- [ ] The central tracker entry for CLN-031 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
