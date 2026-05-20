# Discovery: Search Index Module

## Files

- `src/data/builders/search.ts`
- `lib/convex/publicLibrary.ts`
- `src/components/common/useGlobalSearchSuggestions.ts`
- `src/components/common/GlobalSearch.tsx`
- `src/components/pages/SearchResultsPage.tsx`
- `src/data/builders/libraryBuilder.ts`

## Problem

Search index construction, scoring, cache invalidation, result shaping, and public-route result consumption are coupled inside `search.ts` and `publicLibrary.ts`. The current Interface is easy to call, but shallow: callers and surrounding modules still need to understand query normalization, limit behavior, result type ordering, cache lifetime, and which library fields become searchable.

The cache also depends on `LibraryData` object identity. That is a fragile seam because the validity of search entries is really tied to the underlying article and index layout inputs, not just a single object reference.

## Proposed deepening opportunity

Introduce a search index Module with an explicit build/query Interface. The build side should accept a stable public library projection and return an immutable search index with metadata such as input version/hash and entry counts. The query side should own normalization, scoring, type ordering, count tie-breaks, limits, and empty-query behavior.

`publicLibrary.ts` can then hold a cache of the built search Module result rather than cache ad hoc query results around `querySearchWithData`.

## Benefits

- **Module**: search becomes a deeper Module with build and query behavior behind one Interface.
- **Interface**: callers ask for matches from a built index; they do not need to know cache identity, scoring tiers, or searchable field policy.
- **Implementation**: keywordization, mechanism extraction, category/effect/substance entry building, scoring, sorting, and invalidation details remain internal.
- **Depth**: one index Interface supports global suggestions, `/search/[query]`, and future search UI variants.
- **Seam**: the seam is the built search index, not a module-level singleton tied to the last `LibraryData` object.
- **Adapter**: the current in-memory builder is one Adapter; a future Convex/materialized search index can satisfy the same Interface.
- **Leverage**: ranking, aliases, typo tolerance, route result types, or mechanism keywords can improve in one place.
- **Locality**: search regressions can be tested at the index Interface instead of through page components or library cache behavior.

## Test Plan

- Add unit tests around the search index Interface for normalization, prefixes, substring matches, keyword matches, type ordering, count sorting, and limits.
- Add fixtures for substance aliases, mechanism chips, chemical classes, psychoactive classes, categories, and effects.
- Add cache tests in `publicLibrary.ts` for index reuse and rebuild when source inputs change.
- Keep component tests limited to rendering and navigation of typed search matches.

## Risk/Rollout Notes

- Preserve current result order with characterization tests before altering scoring.
- Roll out by wrapping existing `buildSearchIndex` and `computeScore` first, then revisiting cache keys.
- Be explicit about whether search should include low-priority, hidden, or manual-layout-only entries.
