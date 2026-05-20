# Convex Substance Ingestion Module

## Files

- `convex/substanceIndex.ts`
- `convex/lib/validators.ts`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-to-convex/saveToConvexUtils.ts`
- `src/context/ConvexSyncContext.tsx`
- `scripts/convex/sync-convex-to-production.mjs`
- `scripts/migrate/migrate-substance-index-to-convex.mjs`
- `scripts/batch/*`

## Problem

Substance write semantics are implemented in several places. `convex/substanceIndex.ts` decides whether to upsert by article ID or slug and computes fallback slugs. `src/app/api/save-to-convex/route.ts` separately builds article summaries, reads previous snapshots by ID or slug, verifies saved output, builds changelog entries, and revalidates paths. Batch and migration scripts also call `saveSubstance` or `saveSubstances` directly and must know how the mutation reports partial failures.

This spreads the article ingestion Interface across Convex mutations, HTTP route orchestration, and scripts. It is hard to reason about edge cases such as ID changes, slug collisions, invalid articles in a batch, partial success, and path revalidation because the write outcome is not a single deep result from one Module.

## Proposed deepening opportunity

Create a Convex substance ingestion Module that accepts a write command and returns a rich write result: created/updated/skipped records, previous and next article identities, canonical slug decisions, validation errors, and affected public paths or path hints. Keep App Router responsible for HTTP parsing, rate limiting, and `revalidatePath`, but move article identity resolution and write verification behind the Convex ingestion Interface.

Scripts should use the same ingestion Interface for batch, migration, and production sync workflows instead of reconstructing update semantics locally.

## Benefits

- **Module**: substance ingestion becomes one Module covering validation, identity resolution, upsert, and write result reporting.
- **Interface**: callers submit article write commands and receive a structured outcome instead of knowing ID-vs-slug lookup order and verification steps.
- **Implementation**: slug fallback, duplicate detection, partial failure handling, and previous/next snapshots live together.
- **Depth**: a small command/result Interface hides a high-value write workflow.
- **Seam**: the ingestion seam sits at Convex where the authoritative `substanceIndex` data changes.
- **Adapter**: App Router, batch scripts, and migration scripts become adapters that translate transport or CLI concerns into ingestion commands.
- **Leverage**: every save path gets identical collision behavior and diagnostics.
- **Locality**: future schema migrations or slug rules affect one ingestion Module instead of route code plus scripts.

## Test plan

- Add Convex tests for create, update by article ID, update by slug when ID is null, ID change with previous slug, slug collision, invalid article skip, and mixed batch partial success.
- Add route tests that assert HTTP parsing and revalidation use the ingestion result without duplicating identity logic.
- Add script-level smoke tests or dry-run fixtures for production sync and migration paths.
- Add regression fixtures for known substance articles with generated fields.

## Risk/rollout notes

Because substance writes are high-impact, keep existing mutation names temporarily and implement them as adapters over the new ingestion Module. Compare old and new route verification output in logs before removing duplicated route logic. Maintain partial-success behavior for batch scripts unless a separate migration plan changes operational expectations.
