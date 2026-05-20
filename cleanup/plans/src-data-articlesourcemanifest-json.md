# CLN-012 Break the article-source manifest into navigable shards or indices

- **Status**: ⬜ TODO
- **File**: `src/data/articleSourceManifest.json`
- **Current size**: 21828 LOC
- **Category**: Data artifact
- **Priority**: P1
- **Effort**: M
- **Strategy**: Data sharding
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The manifest is large enough to be hard to inspect and likely bundles multiple concerns into one tracked JSON file.

## Target End State

- The manifest is split by concern, or a small summary manifest points to generated shards.
- Tooling loads only the slices it needs.
- Provenance stays explicit.

## Ordered Work Plan

1. Safety net and inventory
- Identify the minimum fields each consumer actually needs from the manifest.
- Design shard boundaries such as by source, substance range, or usage domain.
- Generate a top-level manifest index that points to the shards and includes checksums.
- Update scripts to resolve through the manifest index instead of loading one giant file.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [ ] Consumers do not pay the cost of one 20k-line manifest for every workflow.
- [ ] Manifest ownership and regeneration are documented.
- [ ] The central tracker entry for CLN-012 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.
