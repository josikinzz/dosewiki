# CLN-018 Split the master generator prompt into reusable shared prompt parts

- **Status**: ⬜ TODO
- **File**: `src/data/config/generatorPrompt.md`
- **Current size**: 1159 LOC
- **Category**: Prompt doc
- **Priority**: P1
- **Effort**: M
- **Strategy**: Prompt modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The generator prompt mixes global persona, evidence rules, output contract, and section-specific guidance in one large markdown file.

## Target End State

- A shared core prompt owns universal rules.
- Section-specific or mode-specific deltas extend the core rather than re-copying it.
- Prompt changes are easier to diff and reason about.

## Ordered Work Plan

1. Safety net and inventory
- Identify the invariant prompt core versus optional generation-mode extensions.
- Extract the shared rules into a reusable base prompt fragment or documented source module.
- Move examples and long-form rationale into separate reference material instead of the execution prompt.
- Document how scripts and editor tools compose prompt fragments into the final prompt.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The canonical generator prompt surface is smaller and easier to maintain.
- [ ] Shared prompt rules are not duplicated across prompt files.
- [ ] The central tracker entry for CLN-018 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
