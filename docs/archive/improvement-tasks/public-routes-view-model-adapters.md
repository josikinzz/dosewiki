# Public Routes: Deepen View Model Adapters

## Files

- `src/app/reports/page.tsx`
- `src/app/effects/page.tsx`
- `src/app/[slug]/page.tsx`
- `src/app/effects/[effectSlug]/page.tsx`
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`
- `src/app/_components/public-routes/EffectReplicationsSection.tsx`
- `src/features/reports/pages/TripReportsPage.tsx`
- `src/features/effects/pages/EffectsIndexPage.tsx`
- `src/features/article/pages/SubstanceArticlePage.tsx`
- `src/features/effects/pages/EffectArticlePage.tsx`

## Problem

Several public App Router pages fetch Convex records and then adapt those records inline into presentation props. The `reports` route builds a partial `TripReport` shape in the route file, while `effects` maps effect records into a minimal index shape in the route file. Substance and effect detail routes also inject server-only sections through `ReactNode` props.

That makes the current Module shallow: each route exposes an Interface that includes fetch choice, field mapping, missing-field defaults, routing prefixes, suspense section composition, and page metadata assumptions. The Implementation is not much larger than the Interface, so callers and maintainers must understand the same details in every route file.

The Seam between Convex public data and public route presentation is also fuzzy. Route files, public route server components, and feature pages each own part of the Adapter logic. This reduces Locality because changing a public record shape or feature page prop requires auditing multiple route files instead of one public view model Module.

## Proposed Deepening Opportunity

Create a public route view model Module, for example under `lib/next/publicRouteViewModels/` or a feature-owned equivalent, that provides explicit Adapters from Convex public records to route-ready view models.

The Interface should be small and route-oriented, such as `getReportsIndexViewModel()`, `getEffectsIndexViewModel()`, `getSubstanceArticleViewModel(slug)`, and `getEffectArticleViewModel(effectSlug)`. The Implementation can hide Convex reads, partial record normalization, href policy, default arrays, suspense eligibility, metadata source fields, and not-found decisions where appropriate.

This would make the Seam between public data and public route components explicit. Feature pages would receive stable view models rather than raw Convex records plus route-specific props. Server-only section Modules such as trip reports and replications can remain separate Adapters, but their invocation policy should move behind the same route view model Interface.

## Benefits

- Increases Depth by putting multiple field-shape and routing rules behind a smaller public-route Interface.
- Improves Leverage because every public route gets consistent defaulting, href construction, and source-record adaptation from one Module.
- Improves Locality when Convex public data, `TripReport`, or effect summary shape changes.
- Makes the Interface the test surface: view model tests can assert normalized route props without rendering the full App Router page.
- Clarifies the Adapter role of App Router pages: routes become thin consumers of route view models rather than partial data mappers.

## Test Plan

- Add unit tests for each new view model Adapter using representative Convex public records, missing optional fields, and empty arrays.
- Add route-level smoke tests or component tests confirming the public pages still render the same high-level sections for reports, effects, substances, and effect detail pages.
- Run `npm run typecheck` to catch stale feature page prop assumptions.
- Run existing focused tests for article/effects/report presentation Modules.

## Risk/Rollout Notes

Start with `reports` and `effects` index routes because their inline mapping is small and easy to verify. Then migrate substance and effect detail routes after the Adapter Interface is proven. Keep route file behavior unchanged during the first pass; this is a deepening refactor, not a content or query policy change.
