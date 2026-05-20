# States: Route Loading Skeleton Module

## Files

- `src/app/loading.tsx`
- `src/app/[slug]/loading.tsx`
- `src/app/category/[categoryKey]/loading.tsx`
- `src/app/effects/[effectSlug]/loading.tsx`
- `src/app/reports/[slug]/loading.tsx`
- `src/app/search/[query]/loading.tsx`
- `src/app/_components/RouteLoading.tsx`
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`
- `src/components/common/StateCard.tsx`
- `src/features/reports/pages/TripReportsPage.tsx`

## Problem

Route loading files all render the same `RouteLoading` skeleton with only a label changed. That keeps files small, but the Module is shallow: the Interface exposes only a string while the Implementation assumes every route should reserve the same layout shape. Detail article routes, category routes, search results, trip reports, and generic pages have different content geometry and different secondary loading surfaces.

There is also no shared loading vocabulary across route-level skeletons and in-page loading states. `RouteLoading` uses fixed pulse blocks, `StateCard` has a `loading` flag, `SubstanceTripReportsSectionFallback` provides a section-specific fallback, and `TripReportsPage` contains an `isLoading = false` branch. These are separate Adapters with no deeper state Module to define which loading presentation belongs to which route or section.

The existing status/redirect policy task mentions loading labels. This task is narrower and deeper: it is about the loading skeleton contract, route-family geometry, and section fallback reuse.

## Proposed deepening opportunity

Create a route loading state Module that exposes route-family loading view models instead of accepting an arbitrary label. Its Interface should name route families such as generic page, substance article, category detail, effect detail, report detail, and search results. Each view model should include label, landmark semantics, skeleton regions, density, and optional section placeholders.

Keep `loading.tsx` files as tiny Next.js Adapters that request a route-family loading model and render it through a shared skeleton renderer. Let section fallbacks such as trip reports use the same primitives so route loading and Suspense fallback loading are visually and semantically consistent.

## Benefits

- **Module**: Turns loading presentation into a route loading Module rather than a label-only helper.
- **Interface**: Replaces the shallow string Interface with named route-family loading models.
- **Implementation**: Hides skeleton geometry, aria attributes, pulse regions, and section fallback composition.
- **Depth**: Increases Depth because each route gets a tailored loading shell through a small route-family Interface.
- **Seam**: Creates a Seam where loading behavior can change without editing every App Router loading file.
- **Adapter**: `loading.tsx` files and section fallback components become Adapters over shared loading primitives.
- **Leverage**: Better skeleton spacing, accessibility fixes, or reduced-motion handling apply across route and section loading states.
- **Locality**: Loading-state visual and semantic changes are concentrated in one Implementation.

## Test plan

- Add unit tests for route-family loading models, including labels, skeleton region counts, and landmark semantics.
- Add component tests for the shared skeleton renderer with generic, article, category, report, and search models.
- Add accessibility checks for `aria-busy`, `aria-live`, focus target behavior, and reduced-motion-safe classes.
- Run `npm run typecheck` and any existing component test suite.

## Risk/rollout notes

This should be a low-risk visual refactor if introduced behind the existing loading routes. Keep the first pass visually close to the current skeleton, then adjust route-family geometry once screenshots confirm no layout regressions.
