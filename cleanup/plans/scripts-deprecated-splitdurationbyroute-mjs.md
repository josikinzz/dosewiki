# CLN-055 Retire or fully quarantine the deprecated splitDurationByRoute script

- **Status**: ✅ DONE
- **File**: `scripts/deprecated/splitDurationByRoute.mjs`
- **Current size**: 710 LOC
- **Category**: Deprecated
- **Priority**: P2
- **Effort**: S
- **Strategy**: Deprecation and quarantine
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A deprecated script this large should not remain half-alive in the codebase without a clear replacement path or archive policy.

## Target End State

- The script is either removed, archived, or clearly frozen with a documented replacement.
- Deprecated code does not compete with active scripts for attention.
- Review tools and docs stop treating it as part of the active maintenance surface.

## Ordered Work Plan

1. Safety net and inventory
- Confirm whether any current workflow still depends on this script.
- If not, move it to a deeper archive or remove it from the repo after preserving history through git.
- If it must remain, add a prominent frozen/deprecated header and link to the supported replacement workflow.
- Ensure active script docs explicitly exclude this path from normal maintenance.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] There is no ambiguity about whether this script is alive.
- [x] Deprecated code is quarantined from active cleanup metrics.
- [x] The central tracker entry for CLN-055 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- Replaced the oversized deprecated script body with a fast-failing archived wrapper so it cannot be mistaken for a supported workflow.
- Added `scripts/deprecated/archive/splitDurationByRoute.legacy.mjs` as an archive placeholder that points contributors back to git history for the original implementation if they ever need to inspect it.
- Updated `scripts/deprecated/README.md` so the file is explicitly documented as an archived wrapper rather than a live maintenance script.
