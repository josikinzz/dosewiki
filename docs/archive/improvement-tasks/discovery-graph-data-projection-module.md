# Discovery: Graph Data Projection Module

## Files

- `src/features/graph/useGraphData.ts`
- `src/features/graph/graphTypes.ts`
- `src/features/graph/SubstanceGraph.tsx`
- `src/data/builders/contentBuilder.ts`
- `src/data/builders/libraryBuilderTaxonomy.ts`

## Problem

The graph feature builds its own substance hierarchy directly from raw articles. It re-derives slugs, hidden-article filtering, psychoactive classes, chemical classes, and subjective effect counts instead of consuming the same normalized substance records and taxonomy projections used by the public library builders.

This makes the graph Module shallow: callers get React state plus graph data, but the Interface still embeds article-shape assumptions, classification parsing, slug policy, and visibility rules. The deletion test suggests the complexity would reappear in another graph hook or route because there is no deeper projection seam for graph-ready taxonomy data.

## Proposed deepening opportunity

Create a graph projection Module that accepts normalized `SubstanceRecord[]` or a `LibraryData` taxonomy view and returns graph hierarchy data, visible node/link data, search targets, and stats. Keep React expansion state in the hook, but move article interpretation and graph projection behind a small Interface.

The graph feature can then have one Adapter for current client-side library data and, later, another Adapter for a server/Convex-precomputed graph payload if graph size or startup cost becomes a problem.

## Benefits

- **Module**: graph projection becomes a named Module rather than being embedded inside a React hook.
- **Interface**: callers pass normalized records and expansion state; they do not need to know raw article structure, slug derivation, or hidden-category rules.
- **Implementation**: taxonomy traversal, node/link construction, de-duplication, and stats stay behind the Interface.
- **Depth**: graph callers get hierarchy, visible data, search targets, and stats from one compact Interface.
- **Seam**: the seam moves from `useGraphData` internals to a pure projection Interface that can be used by UI, tests, and possible server rendering.
- **Adapter**: current `useLibrary()` data is one Adapter; a future Convex graph payload can become a second Adapter without rewriting canvas or controls.
- **Leverage**: fixes to slug, visibility, class, or effect-count policy apply to the graph and its tests in one place.
- **Locality**: graph bugs caused by article-shape drift concentrate in one projection Module instead of spreading through hook code and canvas behavior.

## Test Plan

- Add unit tests for graph projection using small normalized substance fixtures with multiple psychoactive and chemical classes.
- Cover hidden/low-priority behavior, duplicate class membership, empty class lists, and substances shared by multiple parents.
- Add tests for expansion states producing expected visible nodes and links.
- Keep UI tests focused on interaction: expand/collapse, search selection, and substance navigation.

## Risk/Rollout Notes

- Start by matching current graph output exactly with characterization tests before changing projection inputs.
- Avoid changing graph visual styling or D3 simulation behavior in the same task.
- Confirm whether graph should follow `substanceRecords` filtering or `allSubstanceRecords`; this determines whether low-priority articles should appear.
