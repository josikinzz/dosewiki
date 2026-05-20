# Schema Article Projection Builders

## Files

- `src/schema/substance.schema.ts`
- `src/schema/substance/**`
- `src/data/schema/defaults.generated.ts`
- `src/data/builders/contentBuilder.ts`
- `src/data/builders/contentBuilder*.ts`
- `src/data/builders/libraryBuilder*.ts`
- `src/features/article/components/sections/**`
- `src/utils/data/tagRegistry.test.ts`

## Problem

The schema defines `SubstanceArticle`, generated defaults create empty article shape, and builder Modules project articles into UI-facing content structures. These builders contain defensive normalization for optional, legacy, missing, or renamed fields. Some code already reads compatibility fields such as pharmacology half-life and mechanism tags through helpers, while generated defaults also add compatibility structures that are not plainly visible in the root schema file.

This creates an implicit projection seam between article storage shape and public presentation shape, but the seam is not explicit. Builders, tests, normalization helpers, generated defaults, and article section components each need partial knowledge of schema evolution and compatibility assumptions.

The current builder Modules have useful implementation depth in places, but the Interface between `SubstanceArticle` and presentation projections is wide: callers must pass raw article objects and trust that each builder knows the relevant schema quirks.

## Proposed deepening opportunity

Define an article projection Module that owns the transition from `SubstanceArticle` to public/editor projections. It should make schema compatibility and normalization explicit behind a small Interface, such as:

- creating a normalized article view from raw `SubstanceArticle`
- exposing stable projections for identity, taxonomy, routes, pharmacology, interactions, harm potential, citations, and section availability
- centralizing legacy-field and generated-default compatibility reads
- providing test fixtures that represent old, current, and partially generated article shapes

Existing content and library builders can become Adapters over the normalized projection instead of each reading raw schema shape directly.

## Benefits

- Module: turns article projection into a named Module instead of distributed builder assumptions.
- Interface: callers depend on stable projection methods rather than raw nested schema details.
- Implementation: legacy compatibility, empty defaults, and display normalization stay together.
- Depth: public page builders gain more behavior from a smaller article projection Interface.
- Seam: schema evolution can be absorbed at the projection seam before it reaches UI builders.
- Adapter: current content and library builders become Adapters that format projections for existing UI types.
- Leverage: section components, search/index builders, and tests reuse the same normalized article understanding.
- Locality: bugs from renamed or nullable schema fields are fixed in one projection Module.

## Test plan

- Add projection tests for current generated empty articles, realistic complete articles, and legacy/partial article shapes.
- Move compatibility expectations from scattered builder tests into projection tests where possible.
- Keep existing content builder and library builder tests as regression coverage for output shape.
- Add tests for section availability so public article sections do not need to duplicate emptiness rules.
- Run builder tests, article section tests, and `npm run typecheck`.

## Risk/rollout notes

- Roll out by adding the projection Module and adapting one builder path first, while preserving existing output snapshots/expectations.
- Avoid changing public UI output in the first milestone.
- Keep Convex as the live data source; this task is about projection and schema helper architecture, not direct local JSON data changes.
- Compatibility handling should be documented in the projection Module so old schema support can be deleted deliberately later.
