# CLN-003 Remove or replace the huge public SubstanceIndex export

- **Status**: ⬜ TODO
- **File**: `public/SubstanceIndex.json`
- **Current size**: 153312 LOC
- **Category**: Data artifact
- **Priority**: P0
- **Effort**: L
- **Strategy**: Public artifact containment
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

A 150k+ line public JSON export is a large deployment artifact with unclear ownership and a high risk of drifting from the actual public read path.

## Target End State

- Public consumers read through intentional APIs or static shard manifests instead of one giant public JSON blob.
- If a public export must remain, it is chunked and generated automatically.
- The file is no longer a hand-managed hotspot.

## Ordered Work Plan

1. Safety net and inventory
- Identify who consumes `public/SubstanceIndex.json` today and whether those consumers can move to route handlers or smaller static shards.
- If the export is still required, redesign it as chunked or paged static assets generated from a manifest.
- Document the generation path and make the artifact clearly read-only.
- Remove the giant single-file export from the normal review surface.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Public data delivery no longer depends on a monolithic JSON file.
- [ ] Consumers have an intentional contract.
- [ ] The artifact is generated, bounded, and documented.
- [ ] The central tracker entry for CLN-003 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
