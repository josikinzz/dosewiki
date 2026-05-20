# Schema Registry Composition Module

## Files

- `src/data/schema/fieldRegistry.ts`
- `src/data/schema/fieldRegistry.generated.ts`
- `src/data/schema/fieldRegistry.generated/**`
- `src/data/schema/fieldOverrides.ts`
- `src/data/schema/fieldOverrides/**`
- `src/data/schema/sectionRegistry.ts`
- `src/data/schema/types.ts`

## Problem

The field registry is assembled from generated metadata plus manual overrides, while section display order is maintained separately in `sectionRegistry.ts`. The same field path must line up across generated shards, overrides, section field lists, inferred sections, route-dependent flags, transformers, and form rendering.

Today those concerns are spread across several shallow Modules. `fieldRegistry.ts` merges generated and manual data but also applies fallback labels and section inference. `sectionRegistry.ts` repeats ordered field lists independently. Override Modules can introduce paths that are not generated, and the current Interface does not clearly say whether that is a supported extension seam or a compatibility escape hatch.

The result is low Locality: when a schema field is renamed or moved, maintainers must inspect generated registry entries, override files, section field arrays, and form behavior to know whether the editor still renders correctly.

## Proposed deepening opportunity

Introduce a registry composition Module that owns the article field catalog as a single composed Interface. Inputs would remain generated field metadata, manual overrides, and section presentation metadata, but the composed Module would validate and expose:

- the final field registry
- section-ordered field groups
- unmatched generated paths
- override-only paths
- section fields missing from the final registry
- route-dependent fields and route-dependent sections

`fieldRegistry.ts` and `sectionRegistry.ts` can become thin stable entrypoints over this deeper Module. Manual override files remain domain-owned Adapters, but composition rules and diagnostics move into one place.

## Benefits

- Module: turns registry composition into one explicit article field catalog Module.
- Interface: callers ask for composed field groups and diagnostics instead of knowing merge order and fallback rules.
- Implementation: duplicate checks, missing path checks, fallback labels, and section ordering live together.
- Depth: the registry Interface becomes more useful while hiding more consistency work.
- Seam: manual overrides and generated metadata meet at one validated seam.
- Adapter: generated shards and override files are concrete Adapters feeding the composed catalog.
- Leverage: editor forms, validation, and future tooling can reuse the same composed catalog instead of reconstructing relationships.
- Locality: field rename fallout is detected and explained by the composition Module.

## Test plan

- Extend `fieldOverrides.test.ts` or add registry composition tests for duplicate override paths, override-only paths, section-only paths, and generated paths with no override.
- Add tests that `SECTION_REGISTRY` field arrays resolve against the composed registry.
- Add tests for route-dependent fields and sections so dosage/duration behavior remains stable.
- Add tests that fallback labels and inferred sections are only used where the composed Module says they are allowed.
- Run `npm run test -- src/data/schema` and `npm run typecheck`.

## Risk/rollout notes

- Preserve current public exports from `src/data/schema/index.ts`, `fieldRegistry.ts`, and `sectionRegistry.ts` during the first rollout.
- Start diagnostics as test-only assertions or development warnings before enforcing them at runtime.
- Treat existing override-only paths carefully. Some may be intentional compatibility paths, while others may reveal stale schema assumptions.
- Avoid changing section order or field order in the same change as the Module extraction.
