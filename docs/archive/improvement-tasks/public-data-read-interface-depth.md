# Public Data Read Interface Depth

## Files

- `lib/convex/serverClient.ts`
- `lib/convex/serverWriteHealth.ts`
- `lib/convex/publicData.ts`
- `lib/convex/publicData.substances.ts`
- `lib/convex/publicData.effects.ts`
- `lib/convex/publicData.reports.ts`
- `lib/convex/publicData.contributors.ts`
- `lib/convex/publicData.about.ts`
- `lib/convex/publicData.layouts.ts`
- `lib/convex/publicData.shared.ts`
- `lib/convex/publicLibrary.ts`

## Problem

The public data modules call Convex by passing string function names and manually supplied result types. That interface exposes too much implementation detail to each caller: Convex function names, argument shapes, return shapes, retry behavior, cache behavior, and projection expectations all leak through the seam.

This makes the read modules shallow. They provide useful domain names like `getPublicSubstances`, but the implementation still relies on untyped string references and repeated query/projection patterns. The current seam is also hard to test without either mocking `queryConvex` broadly or exercising real Convex calls.

## Proposed deepening opportunity

Introduce a deeper public read module that owns the Convex public query catalog. Its interface should express public data reads in DoseWiki terms: public substances, public effect articles, public reports, contributor profiles, index layouts, and about config.

Behind the seam, keep Convex function references, retry policy, read URL selection, cache policy, and raw-to-public projection details. Public route/page/library callers should not need to know Convex function names or which reads require local projection.

## Benefits using skill vocabulary

- **Depth**: the interface becomes public data concepts instead of Convex transport details plus ad hoc projections.
- **Leverage**: retries, read URL selection, cache behavior, and query naming changes pay back across all public reads.
- **Locality**: changing a Convex function name or return shape is concentrated in the public read module.
- **Seam**: tests can provide a fake public read adapter with fixture data instead of mocking Convex string queries.
- **Interface**: the test surface becomes the public data vocabulary that pages and route planners actually use.

## Test plan

- Add tests for the public read module using a fake adapter that records requested public reads.
- Add projection tests for substances, effects, reports, contributors, and about data.
- Add retry-policy tests at the Convex transport adapter seam for retryable and non-retryable failures.
- Run `npm run typecheck` and `npm run test`.

## Risk/rollout notes

- This touches high-traffic public reads, so preserve existing exported function names initially and move implementation behind them.
- Avoid changing the runtime source of truth: Convex remains authoritative for live runtime data.
- Keep read and write URL/admin-key responsibilities separate; do not expand public reads into protected write behavior.
