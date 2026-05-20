# CLN-028 Reduce harm-potential prompt duplication by composing section-specific deltas

- **Status**: ⬜ TODO
- **File**: `src/data/config/sectionPrompts/harmPotential.md`
- **Current size**: 566 LOC
- **Category**: Prompt doc
- **Priority**: P1
- **Effort**: S
- **Strategy**: Prompt modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The section prompt repeats long shared context and constraint text that belongs in a common prompt core.

## Target End State

- Only harm-potential-specific instructions remain local.
- Shared context and evidence rules come from a common prompt core.
- Prompt review focuses on the section-specific contract.

## Ordered Work Plan

1. Safety net and inventory
- Separate shared persona and evidence rules from the section-specific harm-potential instructions.
- Move examples or long rationale into a companion reference if they must remain available.
- Document how the final prompt is composed for this section.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The local harm-potential prompt is mostly section-specific delta content.
- [ ] Shared rules are maintained once.
- [ ] The central tracker entry for CLN-028 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
