# Article Source Document Contract

## Files

- `convex/articleSources.ts`
- `convex/schema.ts`
- `scripts/migrate/migrate-sources-to-convex.mjs`
- `scripts/parse-sources.ts`
- `scripts/batch/extract-quotes/loader.mjs`
- `scripts/batch/extract-quotes/formatter.mjs`
- `scripts/batch/summary/source-material.mjs`
- `scripts/batch/batch-extract-harm-quotes.mjs`
- `scripts/convex/sync-convex-to-production.mjs`
- `src/data/article-sources/*`

## Problem

Article source documents are central to citation and quote coverage, but their shape is only partially expressed. Convex validates source metadata but stores `contents` as `v.any()`, migration scripts import arbitrary content records, summary generation reads Convex articleSources, and the generic extract-quote script still parses local TypeScript source files with regex to reconstruct `substanceName`, `sources`, and `contents`.

This splits one domain concept across incompatible Interfaces: local article-source modules, Convex `articleSources`, parser output, extraction prompts, and summary source material. Operators must know which workflows use Convex and which use local files, and scripts can silently lose content when metadata and content keys diverge. The large-document limitation is also encoded as a comment in sync tooling rather than in the article source Module itself.

## Proposed Deepening Opportunity

Introduce an article source document contract Module that owns the normalized source document shape, metadata/content key invariants, size and token limits, source lookup, and import/export behavior. Its Interface should support loading by slug from a chosen Adapter, iterating lightweight source metadata, reading content by canonical source ID, validating metadata/content alignment, and reporting whether a document is too large for bulk sync.

Convex `articleSources`, local TypeScript files, parsed source artifacts, and migration inputs should become Adapters behind this seam. Batch extract-quote and summary workflows should consume normalized source documents rather than parsing raw local files or relying on `v.any()` contents.

## Benefits

- **Module**: article source document behavior becomes a Module instead of storage-specific assumptions.
- **Interface**: loaders receive a normalized source document with validated metadata/content invariants.
- **Implementation**: key alignment, missing content handling, size policy, token metadata, and import/export shape are local.
- **Depth**: a small load/iterate/validate Interface gives leverage across parsing, migration, Convex reads, extraction, summary generation, and sync.
- **Seam**: Convex, local TypeScript files, parsed JSON, and migration files become explicit source document Adapters.
- **Adapter**: the regex-based local loader can be replaced by a local-file Adapter without changing quote extraction callers.
- **Leverage**: future source coverage scripts can reuse the same validation and size policy.
- **Locality**: source coverage bugs caused by metadata/content drift are concentrated in the source document contract.

## Test Plan

- Add contract fixtures for Convex-shaped documents, local TypeScript source modules, parsed source artifacts, missing content keys, extra content keys, empty source lists, and oversized documents.
- Add loader tests proving batch extract-quote and summary workflows receive the same normalized document from Convex and local-file Adapters.
- Add migration tests that invalid metadata/content alignment fails before import.
- Add sync-policy tests for large articleSources documents so the 16MB limitation is enforced by the Module rather than a script comment.

## Risk/Rollout Notes

- Keep the first rollout as a read/validation layer; do not change stored articleSources shape until all readers use the normalized Interface.
- Preserve current source metadata fields and source IDs to avoid invalidating existing quote extraction prompts.
- Roll out storage Adapters one workflow at a time, starting with batch extract-quotes because it currently has the most fragile local parsing Implementation.
