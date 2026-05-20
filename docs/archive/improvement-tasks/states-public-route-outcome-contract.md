# States: Public Route Outcome Contract

## Files

- `src/app/substances/page.tsx`
- `src/app/[slug]/page.tsx`
- `src/app/category/[categoryKey]/page.tsx`
- `src/app/effects/category/[categorySlug]/page.tsx`
- `src/app/reports/[slug]/page.tsx`
- `src/components/pages/SearchResultsPage.tsx`
- `src/features/effects/pages/EffectsIndexPage.tsx`
- `src/features/reports/pages/TripReportsPage.tsx`
- `src/components/common/StateCard.tsx`
- `lib/convex/publicData.ts`
- `lib/convex/publicLibrary.ts`

## Problem

Public route state decisions are made inline at several levels. Detail routes call `notFound()` when a requested record is absent, `/substances` throws a generic error when the category layout is unavailable, and index pages render local `StateCard` empty states for no search matches, no effects, or no trip reports. These cases are different product outcomes, but the current Module shape makes each route decide its own interpretation of missing data.

The result is a shallow Interface between public data reads and public presentation. Callers need to know whether `null`, an empty array, or a thrown error means "invalid slug", "valid route with no content yet", "filter returned no matches", or "Convex-backed runtime data is unavailable". That weakens Locality because changing missing-data behavior requires auditing route files and page components rather than one state policy.

This is distinct from the existing public route view model and status/redirect tasks. Those cover record-to-page props and global status pages; this task covers the domain outcome contract for public page state: found, not found, empty, filtered empty, and unavailable.

## Proposed deepening opportunity

Create a public route outcome Module that returns a typed result before rendering. Its Interface should use DoseWiki route vocabulary, for example `substance found`, `category missing`, `effects category empty`, `substances layout unavailable`, `search ready`, and `search no matches`. The Implementation can translate raw Convex read results, route params, and query inputs into those outcomes.

App Router files should become Adapters that map the outcome to `notFound()`, `error.tsx`, or a page view model. Public page components should receive an explicit empty-state view model when the route is valid but content is absent. `StateCard` remains a rendering Adapter, not the place where route outcome semantics are invented.

## Benefits

- **Module**: Concentrates public found/missing/empty/unavailable decisions in a named outcome Module.
- **Interface**: Replaces ambiguous `null`, empty arrays, and thrown errors with route-specific outcome values.
- **Implementation**: Keeps Convex read interpretation, route param normalization, and empty-state copy selection behind one Implementation.
- **Depth**: Gives route files a compact Interface while hiding several state branches behind it.
- **Seam**: Establishes a real Seam between public data reads and App Router state handling.
- **Adapter**: App Router pages become framework Adapters for `notFound()` and errors; `StateCard` becomes a visual Adapter for valid empty outcomes.
- **Leverage**: One outcome contract can drive metadata fallbacks, empty-state cards, error escalation, and tests.
- **Locality**: Missing-data behavior changes stay local to the outcome Module instead of spreading across route and page files.

## Test plan

- Add outcome tests for substance, category, effect category, reports, search, effects index, trip reports index, and substances layout reads.
- Cover `null` records, empty arrays, filter-empty results, and read failures separately.
- Add rendering smoke tests that valid empty outcomes render `StateCard`, while invalid detail outcomes still trigger `notFound()`.
- Run `npm run typecheck` and targeted public route/page tests.

## Risk/rollout notes

Keep the first rollout behavior-preserving: existing 404s remain 404s, existing valid empty pages keep rendering empty states, and `/substances` still escalates unavailable layout data to the error path. After the contract is in place, any product changes to empty or unavailable states should be separate, reviewable changes.
