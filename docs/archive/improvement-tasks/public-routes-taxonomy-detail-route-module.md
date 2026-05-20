# Public Routes: Deepen Taxonomy Detail Route Module

## Files

- `src/app/category/[categoryKey]/page.tsx`
- `src/app/mechanism/[mechanismSlug]/page.tsx`
- `src/app/mechanism/[mechanismSlug]/[qualifierSlug]/page.tsx`
- `src/app/chemical/[slug]/page.tsx`
- `src/app/psychoactive/[slug]/page.tsx`
- `src/app/effects/category/[categorySlug]/page.tsx`
- `src/components/pages/CategoryPage.tsx`
- `src/components/pages/MechanismDetailPage.tsx`
- `src/components/pages/ClassificationDetailPage.tsx`
- `src/features/effects/pages/EffectCategoryPage.tsx`
- `lib/convex/publicLibrary.ts`
- `lib/convex/publicData.ts`

## Problem

Public taxonomy detail routes repeat the same App Router pattern: read a slug param, fetch a detail record, build metadata from count/name fields, call `notFound()` for missing detail, pass detail into a public presentation Module with href prefixes, and define static params. Mechanism qualifier adds one more nested lookup but follows the same shape.

The repeated pattern is not just boilerplate. Each route embeds small differences in metadata fallback copy, detail count selection, href prefix policy, and missing-data behavior. The Interface of every route includes these rules, while the Implementation is too small to provide much Depth. This lowers Locality when taxonomy route behavior changes, and it makes it easy for category, mechanism, chemical, psychoactive, and effect category routes to drift.

## Proposed Deepening Opportunity

Create a taxonomy detail route Module that describes each taxonomy route with a compact descriptor: param name, static params Adapter, detail fetch Adapter, metadata text Adapter, not-found rule, presentation Adapter, and href policy. The App Router pages can remain separate files for Next.js routing, but each file should delegate to the shared Module for metadata and page model construction.

The Interface should expose route-specific functions such as `generateTaxonomyMetadata(descriptor, params)` and `renderTaxonomyDetail(descriptor, params)`, or route-specific wrappers if that reads better in this codebase. The Implementation would centralize the repeated missing-data, metadata, and detail-model rules while still allowing route-specific Adapters for category, mechanism, classification, and effect category differences.

This creates a concrete Seam for taxonomy route policy. The taxonomy presentation pages remain separate Modules; the route Module owns the route lifecycle Adapter.

## Benefits

- Increases Depth by hiding repeated App Router route lifecycle rules behind a smaller descriptor Interface.
- Improves Leverage because new taxonomy routes can reuse metadata, not-found, and href policy behavior.
- Improves Locality because copy, fallback, slug validation, and detail-count conventions are maintained in one Module.
- Reduces route drift while preserving separate Next.js route files.
- Makes taxonomy route behavior testable with descriptor-level tests instead of only full route rendering.

## Test Plan

- Add descriptor tests for category, mechanism, mechanism qualifier, chemical class, psychoactive class, and effect category metadata.
- Add missing-detail and missing-qualifier tests that assert the not-found rule.
- Add tests for href prefix policy passed into presentation Adapters.
- Run `npm run typecheck` and smoke render representative taxonomy routes.

## Risk/Rollout Notes

The risk is over-generalizing unlike routes. Keep the first Module small and descriptor-driven, and only extract behavior already repeated in the listed files. Mechanism qualifier should remain a specialized Adapter until the common Interface proves it has enough Depth.
