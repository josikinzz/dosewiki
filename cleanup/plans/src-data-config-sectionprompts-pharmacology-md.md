# CLN-032 Reduce pharmacology prompt size by isolating shared rules and section-specific constraints

- **Status**: ⬜ TODO
- **File**: `src/data/config/sectionPrompts/pharmacology.md`
- **Current size**: 523 LOC
- **Category**: Prompt doc
- **Priority**: P1
- **Effort**: S
- **Strategy**: Prompt modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The pharmacology prompt repeats general generator rules while also carrying a long list of section-specific constraints.

## Target End State

- Shared rules are centralized.
- The pharmacology prompt file holds only pharmacology-specific deltas and examples.
- Reviewing pharmacology prompt changes does not require re-reading the whole generator contract.

## Ordered Work Plan

1. Safety net and inventory
- Pull general voice and evidence rules into the shared prompt core.
- Keep only pharmacology-specific extraction constraints and structure guidance in this file.
- Move extended rationale or examples into a supporting reference document if they remain useful.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The local pharmacology prompt is shorter and more obviously scoped.
- [ ] Prompt duplication is reduced.
- [ ] The central tracker entry for CLN-032 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
