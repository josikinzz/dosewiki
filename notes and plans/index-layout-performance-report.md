# Dev Tools Index Layout Performance Report

## Summary
- Editor loads an extremely large React tree (~13 categories, 106 sections, 591 slug chips) every time the tab mounts or any field updates.
- Layout relies on CSS multi-columns which forces the browser to continuously recompute column flow across hundreds of interactive controls; this is the primary source of the multi-second freeze when the tab becomes active.
- State updates clone the entire manual index object and re-stringify it on every render; this amplifies CPU load and guarantees that even untouched sections rerender.
- Together these factors explain why the Index Layout tab is uniquely sluggish while the rest of Dev Tools remains responsive.

## Observations
- Switching to the tab triggers a ~1.3k-line component (`IndexLayoutTab.tsx`) that renders all categories, sections, form controls, and slug chips at once.
- The data backing the UI contains 13 categories, 106 sections, and 591 total slug placements—confirmed via a Node inspection script.
- Each section renders multiple Lucide icons (drag, move, delete), notes textareas, and slug chips with status badges; total SVG count easily exceeds 1,000 per render.
- Layout container uses `[column-gap:1.5rem] columns-1 lg:columns-2 2xl:columns-3` (`src/components/sections/dev-tools/index-layout/IndexLayoutTab.tsx:912`) which invokes browser multi-column flow.
- Multi-column layouts reflow the entire content stack whenever heights change; typing in any input or toggling a picker forces a full column recalculation, causing the noticeable lag.
- `deepClone` via `JSON.parse(JSON.stringify(...))` is called inside every state update path (e.g. `updateCategory`, `removeCategory`, `moveCategory`) and even baseline comparisons (`hasUnsavedChanges`) at `IndexLayoutTab.tsx:705-758`.
- Because `deepClone` returns brand new objects, memoized children (`CategoryEditor`, `SectionEditor`) cannot bail out—each update ripples through 100+ forms.
- Unsaved-change detection `JSON.stringify`s both the live manual and the draft on every render (`IndexLayoutTab.tsx:705-709`), adding another O(n) traversal.
- Slug validation reprocesses each slug per category render (`CategoryEditor` recalculates counts/statuses for all entries), compounding the per-render work.

## Root Cause Analysis
1. **Layout thrash from CSS multi-columns**
   - Multi-column flow is optimized for static content, not large interactive forms; sharing hundreds of inputs across column balancing produces noticeable blocking during mount and on every edit.
   - Profiling in Chrome shows layout thrashing dominating the frame budget when the tab is active (column balancing reacts to each new DOM update).

2. **Whole-tree rerenders caused by deep cloning**
   - `setDraftManual` always clones the entire manual config, so React diffing cannot skip unaffected categories/sections.
   - Inputs deep in the tree (e.g. slug textareas) trigger re-renders of all siblings and re-execution of heavy memo work.

3. **Expensive comparison logic**
   - Re-stringifying the full manual object each render (`JSON.stringify`) doubles the cost of every update.
   - Slug status maps are rebuilt for every section, even when source data is unchanged.

4. **Large SVG/icon footprint**
   - Each slug chip and control carries Lucide SVGs. When combined with the re-render cascade, this adds measurable paint cost.

## Remediation Plan

### Phase 1 – Stabilize Rendering (highest impact)
1. Replace the multi-column layout with a `grid` or flex-based masonry that does not rely on column balancing. The goal is to avoid whole-page layout recomputation when editing (`IndexLayoutTab.tsx:912`).
2. Introduce `React.memo`-wrapped `CategoryEditor`/`SectionEditor` components with stable prop references so unaffected categories stop rerendering after an update.
3. Move slug-status computation up to the parent with a single `useMemo` keyed by the full draft; pass down lookup maps to avoid per-category recomputation.

### Phase 2 – Optimize State Updates
1. Swap `deepClone`/`JSON.stringify` patterns for targeted updates (e.g., Immer or manual immutable updates) so only the edited branch is recreated.
2. Track `hasUnsavedChanges` via a `useRef` snapshot or checksum updated only when the draft or source manual actually change, eliminating per-render stringification.
3. Ensure context consumers (`useDevMode`) expose memo-stable getters so `IndexLayoutTab` can diff against cached references without triggering clones.

### Phase 3 – Polish & Progressive Enhancements
1. Consider collapsing categories by default with lazy expansion to reduce initial DOM weight.
2. Defer loading of slug picker dropdown lists until opened; optionally add search-as-you-type rather than rendering 600 buttons per picker.
3. Audit SVG usage—swap repeated icons for CSS glyphs where feasible or memoize icon components to avoid re-creating identical SVG nodes.
4. Add lightweight profiling snapshots to document render times before/after optimizations for regression tracking.

## Next Steps
- Prototype the Phase 1 layout/grid rewrite and memoization; measure tab activation time and input latency using the React profiler.
- Once improvements are validated, document the new behaviour in release notes and run `npm run build` + `npm run build:inline` per repo guidelines.
- Share updated perf numbers in the Dev Tools notes to keep historical context for future contributors.
