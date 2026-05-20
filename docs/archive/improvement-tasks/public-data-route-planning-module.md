# Public Data Route Planning Module

## Files

- `lib/next/staticParams.ts`
- `lib/next/sitemap.ts`
- `src/app/sitemap.ts`
- `src/app/[slug]/page.tsx`
- `src/app/category/[categoryKey]/page.tsx`
- `src/app/effects/[effectSlug]/page.tsx`
- `src/app/chemical/[slug]/page.tsx`
- `src/app/psychoactive/[slug]/page.tsx`
- `src/app/mechanism/[mechanismSlug]/page.tsx`
- `src/app/mechanism/[mechanismSlug]/[qualifierSlug]/page.tsx`
- `src/app/reports/[slug]/page.tsx`
- `src/app/contributors/[profileKey]/page.tsx`

## Problem

Public route planning is split across `lib/next/staticParams.ts` and `lib/next/sitemap.ts`, with each module rebuilding overlapping knowledge about substances, categories, effects, reports, contributors, mechanisms, and class routes. The interface callers use is shallow: route modules must know which helper maps to which route shape, while the sitemap module independently knows many of the same dynamic path rules.

The deletion test suggests `staticParams.ts` and sitemap planning are not deep enough as separate modules. If either one is deleted, the same slug extraction, path construction, encoding, and category/class route knowledge reappears across route files or the sitemap.

## Proposed deepening opportunity

Create one public route planning module whose interface exposes route-family planning data and derived adapters for `generateStaticParams` and sitemap entries. Put the route path conventions, parameter object shapes, effect category paths, contributor encoding, mechanism qualifier filtering, and class slug extraction behind that seam.

The module should be named around the domain concept, such as public route plan or public route inventory, rather than around Next.js implementation details. Next route files would ask for the route family they own; sitemap would consume the same planned paths.

## Benefits using skill vocabulary

- **Depth**: one interface hides route extraction, URL path construction, parameter object construction, and deduplication.
- **Leverage**: static params and sitemap get the same route inventory without duplicating route rules.
- **Locality**: adding or renaming a public route changes one module instead of several route files plus sitemap.
- **Seam**: tests can exercise public route planning directly without rendering App Router pages.
- **Adapter**: Next.js `generateStaticParams` and `MetadataRoute.Sitemap` become thin adapters over the same public route plan.

## Test plan

- Add unit tests for the public route planning module using fixture substances, effects, reports, contributors, layouts, and library records.
- Assert that generated parameter objects and sitemap paths match for each route family.
- Assert deduplication, contributor key encoding, mechanism default qualifier filtering, and class slug generation.
- Keep one smoke test for `buildSitemapEntries` to prove the Next sitemap adapter still returns absolute URLs.
- Run `npm run typecheck` and the relevant test target.

## Risk/rollout notes

- Public route omissions affect SEO and pre-render coverage, so roll out by first introducing the shared route plan and switching one route family at a time.
- Compare old and new sitemap path sets before removing the old implementation.
- Watch mechanism qualifier behavior carefully because the current sitemap excludes default qualifiers while static params includes all qualifiers.
