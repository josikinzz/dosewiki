# Schema Generation Policy Module

## Files

- `src/schema/substance.schema.ts`
- `src/schema/substance/**`
- `scripts/generate/generateSchemaUtils.ts`
- `src/data/schema/defaults.generated.ts`
- `src/data/schema/fieldRegistry.generated.ts`
- `src/data/schema/fieldRegistry.generated/**`

## Problem

The article schema is the stated source of truth, but the generator contains a second layer of article-shape policy. `generateSchemaUtils.ts` derives defaults from Zod, then patches in domain-specific structures for `pharmacology`, `harm_potential`, `history_culture`, and `source_citations`. The same script also owns field path extraction policy, section inference, route-array expansion rules, compound field rules, and generated shard layout.

That makes the generator a shallow Module with a large Interface: maintainers must know Zod internals, article domain exceptions, form registry needs, shard naming, and generated file behavior before they can safely change one schema field. The generated files look authoritative, but some values are not actually derived from the schema alone.

## Proposed deepening opportunity

Create a dedicated schema generation policy Module that makes the article-specific decisions explicit behind a small Interface. The generator should call this Module for:

- default value policy for nullable, optional, record, object, and article-specific fields
- field path traversal policy, including expandable arrays and compound fields
- section mapping and shard naming
- compatibility additions that are intentionally not direct Zod defaults

The generator remains the Adapter that writes files. The policy Module becomes the seam where schema-derived behavior can be altered without editing the file-writing implementation.

## Benefits

- Module: separates "what article schema helpers mean" from "how generated TypeScript files are written."
- Interface: narrows schema generation changes to a small set of named policies instead of scattered conditionals.
- Implementation: keeps Zod traversal, compatibility defaults, and output formatting locally testable.
- Depth: callers get defaults and field registries from one stable generation command while a larger amount of policy lives behind it.
- Seam: creates a real place to add or remove article-generation behavior without editing generated output or unrelated file-writing code.
- Adapter: keeps the current Bun script as the concrete Adapter for filesystem generation.
- Leverage: future schema additions can reuse the same policy instead of re-learning special cases.
- Locality: bugs in generated defaults or generated paths concentrate in one policy Module.

## Test plan

- Add unit tests for the generation policy Module using representative Zod objects, arrays, records, nullable objects, and defaulted fields.
- Add fixture tests for article-specific defaults such as `harm_potential`, `pharmacology` route maps, `history_culture`, and `source_citations`.
- Add a generator snapshot or golden-file test for `defaults.generated.ts` and representative field-registry shards.
- Keep the existing `npm run generate:schema` workflow and verify generated files are stable after the refactor.
- Run `npm run typecheck` and the schema-related tests.

## Risk/rollout notes

- This should be rolled out without changing generated output first. The first milestone is an implementation-preserving extraction.
- After parity is proven, schema policy can be tightened in separate commits.
- Watch for generated file churn. Large generated diffs should be reviewed separately from the policy Module extraction.
- Any compatibility defaults that are not truly schema-derived should be named as such so future maintainers know they are intentional.
