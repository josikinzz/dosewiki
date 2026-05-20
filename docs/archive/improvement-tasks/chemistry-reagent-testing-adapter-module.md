# Chemistry Reagent Testing Adapter Module

## Files

- `src/app/api/reagent-proxy/route.ts`
- `src/hooks/useReagentData.ts`
- `src/types/reagent.ts`
- `src/features/dev/forms/ReagentPreviewFieldsRHF.tsx`
- `src/features/article/components/sections/ReagentSection.tsx`
- `src/features/article/components/sections/TableOfContentsSection.tsx`
- `src/constants/reagentColors.ts`
- `src/data/schema/fieldOverrides/identification.ts`
- `scripts/data/normalize-articles.mjs`

## Problem

Reagent testing behavior is split across a Next route, a browser hook, an editor preview, a public article section, table-of-contents visibility logic, schema field metadata, and data cleanup scripts. Each caller knows a different part of the Interface: ProtestKit URL sanitization, CORS/rate-limit behavior, alias retry order, cache keys, reagent key display names, reaction sorting, empty/static fallback behavior, and `reagent_testing: null -> {}` normalization.

The public `ReagentSection` and editor `ReagentPreviewFieldsRHF` both convert ProtestKit reagent results into display strings, but with different local rules. `useReagentData` documents TanStack Query behavior while implementing a custom in-memory cache. The route returns unvalidated upstream JSON even though `src/types/reagent.ts` defines the expected shape. This makes the Module shallow: the Interface is effectively "know every caller's convention."

## Proposed deepening opportunity

Create a reagent testing Adapter Module that owns the external ProtestKit seam and the internal article reagent-testing view model. Its Interface should separate:

- request candidate construction from article title/common name/aliases
- external ProtestKit fetching and response validation
- normalized reagent result model
- conversion to static article `reagent_testing` records
- conversion to public/editor display entries
- loading/error/empty fallback policy

`src/app/api/reagent-proxy/route.ts` can remain the HTTP Adapter with rate limiting and CORS, but it should delegate request normalization and response validation to the Module. `useReagentData`, `ReagentSection`, and `ReagentPreviewFieldsRHF` should consume the same normalized reagent model instead of reimplementing display logic.

## Benefits

- **Module**: Makes reagent testing a domain Module rather than a route, hook, and two UI implementations.
- **Interface**: Clarifies candidate lookup, upstream errors, normalized reaction data, and display-ready entries.
- **Implementation**: Hides ProtestKit-specific keys, sanitization, response validation, cache behavior, and sorting policy.
- **Depth**: Adds Depth because callers get reagent entries without knowing upstream key names or fallback rules.
- **Seam**: Defines the external ProtestKit seam explicitly while keeping the article `reagent_testing` storage seam separate.
- **Adapter**: The Next route, browser hook, static article records, and ProtestKit response become concrete Adapters.
- **Leverage**: Public article rendering, editor preview, and table-of-contents visibility can share the same data policy.
- **Locality**: Upstream shape changes, reagent ordering changes, and empty-state bugs are fixed in one Module.

## Test plan

- Add response validation tests for valid ProtestKit payloads, missing fields, unknown reagent keys, and malformed colors.
- Add candidate-building tests for title, common name, aliases, duplicate aliases, and punctuation-heavy names.
- Add normalized display-entry tests covering reaction colors, no reaction, hints, unknown keys, and sort order.
- Add route tests for 400, 403, 404, 429/rate-limited, upstream errors, CORS headers, and validated success output.
- Add public/editor component tests that consume normalized fixture data rather than mocking separate conversion rules.

## Risk/rollout notes

Preserve the existing `/api/reagent-proxy?substance=` route while moving internals behind the Module. Keep cache key behavior compatible during the first pass to avoid surprising public-page loading patterns. Treat any change to public reagent display text as a separate rollout after parity tests are in place.
