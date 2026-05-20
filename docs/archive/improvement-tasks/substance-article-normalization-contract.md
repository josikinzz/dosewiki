# Substance Article Normalization Contract

## Status

Proposed

## Files

- `src/schema/substance.schema.ts`
- `src/schema/substance/article.ts`
- `src/schema/substance/**`
- `src/data/schema/defaults.generated.ts`
- `src/data/schema/fieldRegistry.generated.ts`
- `src/data/schema/pathUtils.ts`
- `lib/article/normalization.js`
- `lib/article/normalization.d.ts`
- `lib/article/normalization.test.ts`
- `src/schema/substance.schema.test.ts`

## Problem

The `SubstanceArticle` contract currently has three nearby but separate Interfaces:

- the Zod schema exported from `src/schema/substance.schema.ts`
- the generated empty article shape in `src/data/schema/defaults.generated.ts`
- compatibility normalization helpers in `lib/article/normalization.js`, currently focused on pharmacology and route names

Those Modules do not define one canonical normalization seam for raw article input. `substanceArticleSchema.safeParse` validates, but it does not consistently materialize the same populated shape as `createEmptyArticle()`. The generator also patches article-specific defaults that are not plainly represented as Zod defaults, while schema Modules accept legacy or loose shapes such as passthrough harm potential objects, optional history/culture, optional source citations, optional pharmacology route maps, and legacy pharmacology fields.

The result is a shallow Interface at the point where raw Convex data, local fixtures, migration output, generated section updates, and public builders become a usable article. Callers must remember whether they need Zod validation, generated empty defaults, compatibility reads, route-name normalization, or editor-safe default materialization. The deletion test suggests the hidden normalization policy would reappear across schema tests, registry hydration, public projections, and migration scripts if any one helper were removed.

This is distinct from the schema generation policy Module: generation policy decides what files are emitted. It is also distinct from article projection builders: projections shape validated article data for UI use. The missing Module here is the canonical article normalization contract that sits before those consumers.

## Solution Plan

Introduce a substance article normalization Module with a small Interface for materializing raw input into a validated, canonical `SubstanceArticle` result. The Interface should expose operations such as:

- `normalizeSubstanceArticle(raw, options)` returning either a canonical article plus diagnostics or a validation failure
- `createCanonicalEmptyArticle()` as the non-generated public default factory, backed by generated defaults during rollout
- `normalizeArticleSection(sectionKey, rawSection, options)` for section-level migration and generated-update callers
- diagnostics for compatibility fields consumed, defaults materialized, passthrough keys preserved, passthrough keys rejected, and route names normalized

The Implementation should own the policy for merging parsed raw input with generated defaults, applying Zod parsing, normalizing legacy-compatible fields, and deciding which optional fields are materialized versus left absent. `lib/article/normalization.js` can become a compatibility Adapter or be migrated behind this Module. Existing generated defaults and field registries remain Adapters/inputs rather than independent contracts.

## Benefits

- **Locality**: Article-shape normalization rules concentrate in one Module instead of being split between Zod schemas, generated defaults, path utilities, public projections, and JS compatibility helpers.
- **Leverage**: Convex reads, local fixtures, migrations, generated section updates, editor hydration, and public builders can all ask one Interface for canonical article materialization.
- **Testability**: Tests can target the normalization Interface with raw legacy, sparse, generated-empty, and current article fixtures, instead of asserting partial behavior across unrelated Modules.
- **Depth**: A small "normalize or report diagnostics" Interface hides default merging, compatibility reads, passthrough behavior, optional-field materialization, and route-name normalization.
- **Seam**: Raw article data crosses a named seam before it reaches generated field registries or public projection Modules.
- **Adapter**: Zod schemas, generated defaults, existing JS pharmacology normalization, Convex raw documents, and migration fixtures become Adapters feeding the normalization contract.

## Implementation Notes

- Start with a parity layer that wraps `substanceArticleSchema.safeParse`, `createEmptyArticle()`, and the existing pharmacology helpers without changing runtime output.
- Keep `createEmptyArticle()` generated for now, but add a non-generated canonical factory so callers are not coupled directly to generated file layout.
- Treat harm potential passthrough data deliberately. Diagnostics should report preserved legacy keys before any future narrowing.
- Make the optional/materialized policy explicit for `history_culture`, `source_citations`, pharmacology route maps, optional pharmacology summary fields, and `harm_potential`.
- Keep public projection work separate. This Module should return canonical article data and diagnostics, not UI display models.
- Do not tighten Convex storage shape as part of this task; use the normalization Module as an ingestion/read Adapter first.

## Verification

- Add fixtures for a generated empty article, a complete current article, a sparse raw article, and legacy pharmacology/harm-potential article shapes.
- Test that normalized output passes `substanceArticleSchema.safeParse` and has the same materialized defaults expected by generated field registry hydration.
- Test diagnostics for consumed legacy pharmacology fields, normalized route names, materialized optional sections, and preserved passthrough harm-potential keys.
- Add parity tests proving existing `normalizePharmacologySection`, `getLegacyAwareMechanismTags`, and `hasPharmacologyContent` behavior remains stable through the new Adapter.
- Run `npm run test -- src/schema src/data/schema lib/article/normalization.test.ts` and `npm run typecheck`.
