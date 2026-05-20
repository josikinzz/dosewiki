# Convex Collection Write Workspace

## Status

Proposed

## Files

- `convex/substanceIndex.ts`
- `convex/articleSources.ts`
- `convex/prompts.ts`
- `convex/quotes.ts`
- `convex/tripReports.ts`
- `convex/subjectiveEffects.ts`
- `convex/effectIndexArticles.ts`
- `convex/replications.ts`
- `convex/indexLayouts.ts`
- `convex/lib/auth.ts`
- `scripts/convex/`
- `scripts/migrate/`

## Problem

Convex write functions repeat the same collection-write Implementation across many Modules: authenticate, find an existing document by a natural key, insert or patch, count created/updated records, collect string errors, and sometimes preserve fields such as `created_at`. The Interface looks simple at each function, but callers and maintainers still need to know each collection's natural key, replacement-vs-patch policy, timestamp policy, partial-failure shape, and whether a mutation is public-with-API-key or internal-only.

This is not covered by the substance ingestion task, which is specific to article identity and path effects. The broader friction is that secondary content collections have no deep write workspace. The deletion test suggests the current helpers are shallow: deleting one copy does not remove complexity; the same upsert loop reappears in the next Convex module.

## Solution Plan

Create a Convex collection write workspace Module for operational imports and editor-managed collection updates. Its Interface should accept a collection-specific Adapter that names the natural key, validates or normalizes the incoming document, decides patch vs replace fields, and maps errors into a typed operation result.

Use this workspace behind bulk imports for prompts, quotes, article sources, EffectIndex articles, subjective effects, trip reports, replications, and index layouts. Keep domain-specific Modules responsible for their contracts; the workspace owns write mechanics, not content meaning.

## Benefits

- **Locality**: natural-key lookup, per-item error handling, result counts, and timestamp conventions move into one write workspace instead of being reimplemented in every collection Module.
- **Leverage**: new import or sync mutations get consistent created/updated/skipped/error results by supplying only a collection Adapter.
- **Testability**: tests can exercise the write workspace Interface with fake Adapters for insert, update, validation failure, preserved fields, and partial failure instead of duplicating fixtures for every collection.

## Implementation Notes

- Keep authorization intent separate from this workspace; the existing `convex-authz-write-intents.md` task should decide who may write.
- Preserve current mutation names and response shapes during rollout by adapting the deeper result back to existing callers.
- Model internal migrations and API-key writes as different Adapters only where their Interface truly differs.
- Do not use the workspace to hide content contracts. For example, trip report shape belongs to the trip report contract Module; the write workspace should only coordinate persistence mechanics.

## Verification

- Add Convex tests for the workspace using two small test Adapters: one keyed by `slug`, one keyed by `type`.
- Add regression tests for existing bulk import response shapes on prompts, quotes, index layouts, and replications.
- Add tests for preserving immutable fields such as `created_at` on replication updates.
- Run `npm run typecheck` and the Convex/function test target used by this repo.
