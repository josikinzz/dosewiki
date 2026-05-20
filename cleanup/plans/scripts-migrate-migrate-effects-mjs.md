# CLN-029 Isolate migration rewrite stages from persistence

- **Status**: ✅ DONE
- **File**: `scripts/migrate/migrate-effects.mjs`
- **Current size**: 559 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Migration pipeline decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

Asset rewrites, link rewrites, effect transformation, batching, and Convex persistence are all mixed in one migration script.

## Target End State

- Rewrite helpers, effect transformation, and persistence are separate modules.
- Migration batching logic is understandable without scrolling through transformation details.
- Critical migration transforms are fixture-tested.

## Ordered Work Plan

1. Safety net and inventory
- Add fixtures for tag normalization, asset URL rewrites, internal link rewrites, and see-also transformation.
- Extract asset and link rewrite helpers into dedicated modules.
- Move `transformEffect()` into its own transformer module with direct tests.
- Reduce `main()` to loading inputs, batching transformed effects, and persisting them.
- Document rollback and rerun expectations before applying future migrations.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Transform logic is testable without running the whole migration.
- [x] Persistence code is isolated from content rewrites.
- [x] The script is small enough to review safely.
- [x] The central tracker entry for CLN-029 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/migrate/migrate-effects.mjs` is now a 142 LOC orchestration script over dedicated modules in `scripts/migrate/effects/`.
- Rewrite logic, effect transformation, and Convex persistence now have separate homes instead of living in one mixed migration file.
- Added `lib/migrateEffects.test.ts` to cover tag normalization, internal-link rewrites, see-also rewrites, asset rewrites, social image rewriting, and transformed effect shape.
