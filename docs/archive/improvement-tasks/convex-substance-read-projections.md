# Convex Substance Read Projections

## Files

- `convex/substanceIndex.ts`
- `lib/convex/publicData.substances.ts`
- `lib/convex/publicLibrary.ts`
- `src/hooks/useConvexSubstanceIndex.ts`
- `src/app/dev/_components/NextDevRouteClient.tsx`
- `src/data/builders/libraryBuilder.ts`
- `src/data/builders/search.ts`

## Problem

Read callers often choose between loading the full `substanceIndex` document or a very narrow slug/name map. Public preview data, library building, search, random samples, and editor navigation each need different projections, but most of that projection work happens outside Convex after fetching complete article documents. `getSlugNameMap` is a one-off lightweight query, while `getAll` remains the default Interface for many public reads.

This makes the read Module shallow: callers must understand document size, which fields are safe for public display, and which local builder can trim or derive the needed shape. The performance concern is already visible in the comment that slug/name mapping avoids loading several MB of content.

## Proposed deepening opportunity

Add a Convex substance read projection Module with named projection Interfaces such as lookup, public preview, library input, search input, random preview, and editor full article. Each query should return only the fields its callers need and make public/editor distinctions explicit.

`lib/convex/publicData.substances.ts` and `lib/convex/publicLibrary.ts` should adapt those projections to existing builder Interfaces instead of fetching full records by default. The client hook surface should stop exposing broad write-capable/full-read hooks where a specific projection would do.

## Benefits

- **Module**: substance reads become a Module with projection Interfaces instead of one full-document escape hatch.
- **Interface**: callers choose a purpose-built projection and no longer need to know the full article shape for preview or search use cases.
- **Implementation**: field selection, slug fallback, priority defaults, and public-safe shaping live in Convex.
- **Depth**: small projection names hide payload, privacy, and derivation details.
- **Seam**: the projection seam is at Convex query functions, before large documents cross into server or browser adapters.
- **Adapter**: public library builders and React hooks adapt projections to local UI models.
- **Leverage**: multiple public pages benefit from lower payload and clearer data contracts.
- **Locality**: changing preview/search fields requires changing one projection and its tests, not every caller.

## Test plan

- Add Convex tests for each projection shape and default behavior for missing slug or priority.
- Add public-data tests proving preview/search/library helpers no longer require full article records.
- Add performance regression checks or fixture-size assertions comparing full-document reads against projections.
- Add editor tests ensuring full article reads remain available where editing requires complete content, including editor-only metadata.

## Risk/rollout notes

The public library builder may currently rely on more fields than obvious route code suggests, so introduce projections incrementally and keep `getAll` for editor and migration use. Treat `editorial_review` as editor-only metadata and verify no public projection includes it. Cache invalidation should preserve current behavior while projection callers move over.
