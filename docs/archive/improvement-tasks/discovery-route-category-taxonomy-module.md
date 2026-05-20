# Discovery: Route And Category Taxonomy Module

## Files

- `src/data/builders/contentBuilderRoutes.ts`
- `src/data/routeSynonyms.ts`
- `src/data/mappings/routeSynonyms.json`
- `src/data/builders/libraryBuilderCategories.ts`
- `src/data/builders/libraryBuilderTaxonomy.ts`
- `src/data/builders/manualIndexLoader.ts`
- `convex/indexLayouts.ts`
- `convex/categoryLayout.ts`
- `src/app/category/[categoryKey]/page.tsx`
- `src/app/psychoactive/[slug]/page.tsx`
- `src/app/chemical/[slug]/page.tsx`
- `src/app/mechanism/[mechanismSlug]/page.tsx`

## Problem

Route taxonomy and category taxonomy are related but modeled through separate local policies. Route normalization lives in `routeSynonyms.ts` and is used by dosage/duration projection. Category taxonomy lives in manual index layouts and builder maps. Mechanism taxonomy parsing is duplicated between content and library taxonomy code, while page routes manually choose category, chemical, psychoactive, or mechanism detail helpers.

This spreads taxonomy knowledge across multiple Modules. The Interfaces are shallow because callers must know which slug function, layout config, fallback category, manual link type, or route helper applies to each taxonomy surface.

## Proposed deepening opportunity

Create a taxonomy Module that owns canonical identifiers, display labels, aliases, layout membership, and route path intent for public taxonomy surfaces: route of administration, psychoactive category, chemical class, mechanism, and effect where appropriate.

Manual index layouts and route synonyms can remain separate data Adapters, but they should feed a single taxonomy Interface. Public routes and builders can ask the taxonomy Module to resolve an identifier, build a display group, or produce route metadata without duplicating slug and fallback policy.

## Benefits

- **Module**: taxonomy becomes a domain Module rather than separate route, category, mechanism, and manual-layout helpers.
- **Interface**: callers resolve taxonomy terms through one Interface that includes identifiers, aliases, display labels, and route intent.
- **Implementation**: slugification, synonym lookup, fallback categories, manual sections, mechanism qualifiers, and layout membership stay internal.
- **Depth**: pages and builders get more behavior from fewer concepts: resolve, group, link, and describe.
- **Seam**: Convex `indexLayouts`, legacy `categoryLayout`, local `routeSynonyms.json`, and generated article classifications meet at a taxonomy seam.
- **Adapter**: Convex layouts, local JSON layouts, and route synonym mappings become Adapters into the taxonomy Interface.
- **Leverage**: one taxonomy policy can support category pages, chemical pages, mechanism pages, graph grouping, search entries, and sitemap/static params.
- **Locality**: taxonomy naming or slug changes are made and tested once rather than across builders, pages, and route helpers.

## Test Plan

- Add tests for taxonomy resolution across canonical keys, labels, aliases, route synonyms, and mechanism qualifiers.
- Add tests for manual-layout fallback categories and empty/missing Convex layout behavior.
- Add route tests that assert category, psychoactive, chemical, and mechanism detail pages resolve through the same taxonomy Interface.
- Add regression fixtures for renamed categories, composite routes, and duplicate manual section slugs.

## Risk/Rollout Notes

- Keep existing route URLs stable; this task should deepen resolution, not rename public paths.
- The deprecated `categoryLayout` table should be treated as a compatibility Adapter until all runtime reads are confirmed on `indexLayouts`.
- Roll out first in builders, then public routes, then search/graph consumers.
