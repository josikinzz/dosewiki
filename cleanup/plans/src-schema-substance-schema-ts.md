# CLN-011 Split the canonical article schema into section modules while preserving one barrel

- **Status**: ✅ DONE
- **File**: `src/schema/substance.schema.ts`
- **Current size**: 548 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Schema modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The single source-of-truth schema is large enough that every schema change reopens one giant file spanning dosage, duration, effects, pharmacology, legality, editorial review, and citations.

## Target End State

- `src/schema/substance.schema.ts` becomes a barrel or composition file under 250 LOC.
- Section schemas live in dedicated modules by domain.
- Generated helpers and downstream imports continue to resolve from one stable public entrypoint.

## Ordered Work Plan

1. Safety net and inventory
- Map the schema into domain modules such as shared, dosage, duration, effects, pharmacology, interactions, tolerance, harm, history, legality, and editorial.
- Keep shared primitives in one place so type drift does not reappear across modules.
- Retain the current exported names from a top-level barrel to avoid import churn.
- Regenerate schema-derived helpers after the split and diff them against the current output.
- Add or update schema validation smoke tests that cover representative article objects.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The canonical schema remains the source of truth without being a god file.
- [x] Domain changes touch domain modules instead of one giant schema document.
- [x] Generated artifacts still match expectations.
- [x] The central tracker entry for CLN-011 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Implementation Notes

- Split the schema into domain modules under `src/schema/substance/` and left `src/schema/substance.schema.ts` as the stable public barrel.
- Regenerated `src/data/schema/defaults.generated.ts` and `src/data/schema/fieldRegistry.generated.ts` from the unchanged public schema entrypoint.
- Verified with `npm run test -- src/schema/substance.schema.test.ts` and `npm run generate:schema`.
