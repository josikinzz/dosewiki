# Discovery: Library And Content Builder Projection Depth

## Files

- `src/data/builders/contentBuilder.ts`
- `src/data/builders/contentBuilderRoutes.ts`
- `src/data/builders/contentBuilderShared.ts`
- `src/data/builders/contentBuilderInteractions.ts`
- `src/data/builders/libraryBuilder.ts`
- `src/data/builders/libraryBuilderCategories.ts`
- `src/data/builders/libraryBuilderTaxonomy.ts`
- `src/data/builders/libraryBuilderDetails.ts`
- `src/data/builders/library.ts`

## Problem

`contentBuilder` and `libraryBuilder` are doing several projections at once: article-to-substance record normalization, UI content shaping, route shaping, category badge shaping, taxonomy extraction, interaction indexing, public detail resolvers, and manual index group construction.

Some useful functions are extracted, but the external Interface remains broad and knowledge-heavy. `buildLibrary` must coordinate visibility rules, manual index config behavior, auto fallback behavior, taxonomy accumulators, detail resolvers, and search-facing maps. Meanwhile, downstream modules know about `LibraryData` as a large aggregate rather than narrower projections.

## Proposed deepening opportunity

Split the builder pipeline into a small set of deep projection Modules:

- article normalization: raw `SubstanceArticle` to normalized `SubstanceRecord`
- taxonomy projection: classes, mechanisms, effects, and aliases from normalized records
- manual index projection: layout configs plus normalized records to public groups/details
- public library facade: a compact Interface that exposes stable read methods and typed projections

The goal is not more files for their own sake. The goal is to make each Module own one durable Interface and hide the Implementation details that currently leak through `LibraryData`.

## Benefits

- **Module**: each projection becomes a Module named after the domain concept it owns.
- **Interface**: callers depend on normalized records, taxonomy projections, or public read methods instead of the entire builder aggregate.
- **Implementation**: parsing, de-duplication, fallback selection, and sorting policies stay inside the relevant projection.
- **Depth**: `buildLibrary` becomes orchestration over deep Modules rather than the place where all projection knowledge is assembled.
- **Seam**: tests and callers can cross the article-normalization seam, taxonomy seam, or manual-index seam intentionally.
- **Adapter**: Convex raw articles and local fixture articles can be Adapters into the same normalization Interface.
- **Leverage**: schema changes, visibility rules, and taxonomy changes get one implementation path shared by category pages, graph, search, and detail routes.
- **Locality**: bugs caused by article-shape drift, route-shape drift, or taxonomy parsing concentrate in the projection Module that owns that concept.

## Test Plan

- Add characterization tests for `buildSubstanceRecord` and `buildLibrary` before extracting Modules.
- Add focused tests at each new Interface: article normalization, taxonomy projection, manual index projection, and public facade methods.
- Use fixtures with hidden records, low-priority records, duplicate aliases, missing classification, route-only duration data, and manual index fallback categories.
- Keep existing `libraryBuilder.test.ts`, `contentBuilder.test.ts`, and `search.test.ts` as integration coverage.

## Risk/Rollout Notes

- This should be staged. First introduce named projection Modules behind the existing `buildLibrary` Interface, then narrow downstream callers.
- Do not alter public article content or Convex data shape during this task.
- Preserve `LibraryData` compatibility until all callers have moved to narrower Interfaces.
