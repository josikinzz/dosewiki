# CLN-052 Split oversized workflow documentation for SKILL.md

- **Status**: ⬜ TODO
- **File**: `.claude/skills/react-optimization/SKILL.md`
- **Current size**: 812 LOC
- **Category**: Skill doc
- **Priority**: P2
- **Effort**: S
- **Strategy**: Documentation segmentation
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

This workflow document is large enough that executable instructions, examples, reference material, and trackers are likely mixed together.

## Target End State

- The primary skill or command file stays short and execution-focused.
- Reference material, examples, and trackers move into dedicated companion docs.
- Future updates can happen without reopening one monolith.

## Ordered Work Plan

1. Safety net and inventory
- Separate quick-start execution steps from background reference and examples.
- Move long trackers, catalogs, or appendix material into dedicated companion files in the same folder.
- Keep the top-level skill or command file as the authoritative entrypoint with links to the supporting docs.
- Add explicit update triggers so maintainers know which companion doc changes with which workflow changes.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] The entry workflow doc is comfortably below the cleanup threshold.
- [ ] Reference and operational material are clearly separated.
- [ ] The central tracker entry for CLN-052 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
