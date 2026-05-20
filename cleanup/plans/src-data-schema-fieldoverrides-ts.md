# CLN-024 Break manual field overrides into section-owned modules

- **Status**: ✅ DONE
- **File**: `src/data/schema/fieldOverrides.ts`
- **Current size**: 603 LOC
- **Category**: Config-heavy
- **Priority**: P1
- **Effort**: M
- **Strategy**: Configuration modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

Every manual label, section assignment, description, transformer, and placeholder override lives in one sprawling registry file.

## Target End State

- Overrides are grouped by section or domain and composed through an index.
- Shared transformer imports stay centralized where it helps readability.
- The public override registry remains stable for current consumers.

## Ordered Work Plan

1. Safety net and inventory
- Define section-level override modules that mirror the editor or schema domains.
- Move related overrides together instead of appending new keys into one map forever.
- Keep a small top-level index that merges the section modules into the exported registry.
- Add a validation check that detects duplicate field paths or missing required labels when modules are combined.
- Document the section ownership pattern for future metadata additions.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] `fieldOverrides.ts` is reduced to a composition layer or barrel.
- [x] Future override changes have obvious ownership.
- [x] Registry assembly is validated automatically.
- [x] The central tracker entry for CLN-024 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Implementation Notes

- Moved manual overrides into section-owned modules under `src/data/schema/fieldOverrides/` and kept `src/data/schema/fieldOverrides.ts` as the stable composition layer.
- Added duplicate-path validation with `mergeFieldOverrideModules()` so future module collisions fail fast instead of silently overriding metadata.
- Verified with `npm run test -- src/data/schema/fieldOverrides.test.ts src/schema/substance.schema.test.ts` and `npm run typecheck`.
