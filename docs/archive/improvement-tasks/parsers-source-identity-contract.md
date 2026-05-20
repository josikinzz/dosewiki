# Parsers Source Identity Contract

## Files

- `scripts/parsers/registry.ts`
- `scripts/parsers/contracts.ts`
- `scripts/parsers/types.ts`
- `scripts/parsers/others.ts`
- `scripts/parsers/sources/*`
- `scripts/parse-sources.ts`
- `src/data/article-sources/*`

## Problem

Source identity is currently spread across dynamic article-source modules, parser `sourceId` properties, registry keys, normalized lookup strings, display names, parser result `source` fields, source coverage entries, TripSit combo synthetic source IDs, and source-specific compatibility facades.

The registry Module provides a useful lookup Interface, but the identity contract is still shallow: a caller can pass any string, unsupported sources silently return `undefined`, and every parser must manually keep `sourceId`, emitted `source`, and `sectionsExtracted` aligned. The source aggregation path therefore depends on conventions rather than a single source identity Module.

## Proposed Deepening Opportunity

Create a source identity Module that owns canonical IDs, aliases, display names, parser availability, and synthetic enrichment sources. Its Interface should support:

- canonicalize a raw source ID
- describe a source for coverage output
- resolve a parser Adapter for parseable sources
- represent unsupported-but-known sources differently from unknown sources
- expose typed constants for synthetic sources such as `tripsit-combos`

Parser implementations should receive a canonical source descriptor or parse context rather than manually repeating string IDs.

## Benefits

- **Module**: source identity becomes a real Module instead of a set of repeated strings.
- **Interface**: callers can ask for canonical identity, display metadata, and parser capability through one small Interface.
- **Implementation**: alias handling, unknown-source behavior, synthetic source descriptions, and parser availability are local.
- **Depth**: a single canonicalization and description Interface gives leverage across parse-sources, registry, parsers, aggregation, and tests.
- **Seam**: parser resolution becomes a seam where parseable, known-unparseable, and synthetic sources can be handled explicitly.
- **Adapter**: each concrete parser remains an Adapter for a canonical source identity.
- **Leverage**: adding a source no longer requires manually synchronizing registry keys, parser `sourceId`, coverage names, and tests.
- **Locality**: source ID bugs become identity-module bugs rather than scattered parser failures.

## Test Plan

- Add source identity contract tests covering aliases, case normalization, display names, parser-capability resolution, known unsupported sources, unknown sources, and synthetic enrichment sources.
- Update parser contract fixtures to assert emitted `source` values come from canonical descriptors.
- Add a test that a parser registered under one alias still reports canonical `source` and coverage identity.
- Add a parse run fixture with an unsupported known source to verify it is skipped or reported intentionally.

## Risk/Rollout Notes

- Preserve existing output source IDs unless intentionally migrating data consumers.
- Start with a compatibility layer around `normalizeParserSourceId`, `getParser`, and current registry keys.
- Watch for downstream scripts that match source IDs by string in `scripts/prepopulate`, `scripts/migrate`, and batch source-material loaders.
