# Convex Derived Lookup Indexes

## Status

Proposed

## Files

- `convex/schema.ts`
- `convex/tripReports.ts`
- `convex/subjectiveEffects.ts`
- `convex/effectIndexArticles.ts`
- `convex/replications.ts`
- `lib/convex/publicData.effects.ts`
- `lib/convex/publicData.reports.ts`
- `src/features/effects/`
- `src/features/reports/`

## Problem

Several public Convex read functions answer lookup questions by collecting whole tables and filtering in Implementation code. `tripReports` filters all reports by substance name or author, derives unique substance and author lists from full records, and lowercases names inline. `subjectiveEffects` collects all effects for tag and category queries, while category-to-tag policy lives inside the query. `effectIndexArticles` filters all articles by tag. These reads work while the tables are small, but the Interface forces callers to depend on broad full-table queries for narrow lookup intents.

This is distinct from the public read projection task. Projection controls which fields cross the seam; this opportunity controls how derived lookup indexes are modeled before data is fetched. Without a deeper Module, adding a high-traffic tag, author, or substance filter keeps pushing scan and normalization rules into whichever Convex function needs it next.

## Solution Plan

Introduce a derived lookup index Module for Convex-backed public content. Its Interface should expose lookup intents such as reports by normalized author, reports by normalized substance, effects by canonical tag group, articles by tag, and available filter values.

The Implementation can start as materialized helper tables or explicit normalized fields on existing documents, depending on migration cost. Write/import paths should update the derived lookup data through Adapters, and read functions should query the derived index instead of collecting full tables. The category-to-tag mapping for subjective effects should become a named policy behind this seam rather than inline query data.

## Benefits

- **Locality**: normalization of author names, substance names, tags, and effect categories lives in one lookup Module instead of being repeated in each query.
- **Leverage**: report pages, contributor pages, substance embeds, effect category pages, and future filter UIs all gain indexed lookup behavior from the same Interface.
- **Testability**: lookup fixtures can assert normalized keys, category tag expansion, empty-filter behavior, and stale-index repair without rendering public pages or scanning full documents.

## Implementation Notes

- Preserve existing public URLs and visible ordering first; this task should deepen lookup mechanics, not change navigation behavior.
- Coordinate with `contributors-reports-trip-report-contract-module.md` so report contracts own shape while the lookup Module owns normalized index keys.
- Coordinate with `convex-substance-read-projections.md` so lookup queries return purpose-built projections after the index selects matching document ids.
- Start with read-through helpers that compute the same results, then migrate to materialized fields or tables once fixtures prove behavior.

## Verification

- Add tests for reports by author and substance using mixed case, aliases or display names where currently supported, multi-substance reports, and empty inputs.
- Add tests for subjective effect category resolution, unknown categories, all-tags vs any-tag behavior, and article tag lookup.
- Add migration or import tests proving derived lookup fields/tables are updated when reports, effects, or articles are imported.
- Add a fixture-size or query-shape regression check proving narrow lookups no longer require full-table scans once materialized.
