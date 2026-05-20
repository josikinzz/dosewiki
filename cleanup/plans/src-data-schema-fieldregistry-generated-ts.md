# CLN-022 Change schema generation to emit sharded field-registry output

- **Status**: ✅ DONE
- **File**: `src/data/schema/fieldRegistry.generated.ts`
- **Current size**: 629 LOC
- **Category**: Generated/config
- **Priority**: P1
- **Effort**: M
- **Strategy**: Generation containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The generated field registry is large, review-hostile, and effectively impossible to navigate when every generated field path lands in one file.

## Target End State

- Generation emits smaller domain shards plus a barrel export, or otherwise emits a generated manifest that is deliberately excluded from hotspot review.
- Humans can inspect one domain at a time when validating generated output.
- The generator, not manual editing, defines the file shape.

## Ordered Work Plan

1. Safety net and inventory
- Update the schema generation script so it can emit per-domain registry shards instead of a single monolithic object.
- Keep a stable barrel export so downstream imports do not need to understand the sharding.
- Add a generator integrity check that ensures the combined output matches the current runtime contract.
- Document that generated files are reviewed through the generator source plus sample shards, not by hand-editing giant outputs.
- If sharding is not viable, explicitly quarantine the generated file in cleanup metrics and explain why.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] No one has to review a 600+ line generated registry blob to understand one field family.
- [x] The generator defines the structure and the structure stays bounded.
- [x] Cleanup review can distinguish generated debt from active-logic debt.
- [x] The central tracker entry for CLN-022 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Implementation Notes

- Updated `scripts/generate/generateSchemaUtils.ts` so field-registry generation now emits per-domain shards under `src/data/schema/fieldRegistry.generated/`.
- Kept `src/data/schema/fieldRegistry.generated.ts` as the stable barrel export for existing consumers.
- Verified with `npm run generate:schema` and `npm run typecheck`.
