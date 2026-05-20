# Public Routes: Deepen Effect Article Section Model

## Files

- `src/features/effects/pages/EffectArticlePage.tsx`
- `src/app/effects/[effectSlug]/page.tsx`
- `src/app/_components/public-routes/EffectReplicationsSection.tsx`
- `src/features/effects/components/ReplicationGallery.tsx`
- `src/features/effects/components/RelatedSubstancesSection.tsx`
- `src/features/effects/components/EffectCitationsSection.tsx`
- `src/features/effects/components/EffectContributorsSection.tsx`
- `src/features/effects/vcode/VCodeRenderer.tsx`

## Problem

`EffectArticlePage` currently owns content normalization, section presence checks, icon selection, related-substance derivation, replication fallback selection, audio rendering, hard-coded contributor attribution, source rendering, and VCode rendering setup. Its Interface accepts raw effect records, optional detail records, route prefixes, callbacks, and a server-injected `replicationsSection`.

That makes the Module broad but not deep enough: the caller still has to understand when to fetch detail, when replications should be injected, and what route prefixes are needed. The Implementation has many public article rules interleaved with JSX. The `replicationsSection` prop is a useful Seam, but it is narrow and hypothetical because only one server Adapter is currently visible from the route.

## Proposed Deepening Opportunity

Introduce an effect article section model Module that converts a public effect record plus optional detail into an ordered list of renderable public article sections. The Interface should describe the page in domain terms: overview, analysis, style variations, replications, audio replications, personal commentary, related substances, sources, contributors.

The Implementation should own section presence, VCode content selection from AST/raw fields, icon policy, attribution policy, related-substance model construction, and fallback section state. `EffectArticlePage` can then render a section model through small section renderers. The App Router page can call one Adapter that decides whether a server replications Adapter is needed.

This deepens the Seam between effect data and effect article rendering. The `EffectArticlePage` Module becomes easier to reason about because its Interface is a stable article section model rather than raw records plus route wiring.

## Benefits

- Increases Depth by concentrating many article assembly rules behind a small section-model Interface.
- Improves Leverage because future effect article sections can be added by extending the model instead of editing route fetch policy and presentation conditionals together.
- Improves Locality for bugs involving AST/raw fallback, missing sections, contributor attribution, or source visibility.
- Makes effect article behavior testable without mounting the full page.
- Preserves the server/client split while making the Adapter role of `EffectReplicationsSection` explicit.

## Test Plan

- Add unit tests for section model creation with full content, minimal content, AST/raw fallback, missing gallery, gallery with no fetched replications, audio-only content, and related substances.
- Add component tests for `EffectArticlePage` against prepared section models.
- Verify `VCodeRenderer` tests still pass.
- Run `npm run typecheck` and a smoke render of `/effects/[effectSlug]`.

## Risk/Rollout Notes

This page is content-heavy, so the main risk is accidentally hiding a section. Migrate by first extracting pure section-model helpers with tests, then replace conditionals section by section. Keep the route-level `Suspense` behavior unchanged until the new Adapter Interface has test coverage.
