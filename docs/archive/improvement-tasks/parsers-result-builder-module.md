# Parsers Result Builder Module

## Status

Proposed

## Files

- `scripts/parsers/types.ts`
- `scripts/parsers/base.ts`
- `scripts/parsers/tripsit.ts`
- `scripts/parsers/psychonautwiki.ts`
- `scripts/parsers/erowid.ts`
- `scripts/parsers/drugbank.ts`
- `scripts/parsers/sources/*`
- `lib/parserContracts.test.ts`

## Problem

Parser Adapters currently construct `ParserResult` objects by mutating the empty result shape directly. Source attribution, `sectionsExtracted`, narrative note insertion, optional section presence, and duplicate-section prevention are repeated across parser implementations. Some parsers use a local `pushExtractedSection` helper, while others push strings directly and can emit duplicate or source-specific section labels without a shared policy.

That makes each parser Module shallower than it needs to be. The `SourceParser` Interface is small, but the Implementation contract leaks into every parser: callers and maintainers must remember which parsed fields imply which extracted section, when a narrative-only field should count as extracted, and how source attribution is attached to records. The deletion test suggests the repeated result assembly is earning a real Module: deleting the repeated helpers would not remove complexity, it would scatter the same metadata rules further.

## Solution Plan

Create a parser result builder Module that owns construction of `ParserResult` metadata while keeping source-specific extraction logic inside each parser Adapter. The Interface should let a parser say what it found without manually mutating every shared field:

- initialize a result for a canonical source identity
- add dosage, duration, effects, interactions, legal, international law, tolerance, chemistry, pharmacology, and harm reduction records
- add narrative content with explicit narrative section identity
- derive or register `sectionsExtracted` once, with duplicate prevention and allowed section names
- finalize to the existing `ParserResult` shape

Source-specific parser Modules should continue to parse their own text formats, but they should use the builder as the seam for source attribution and extraction metadata. This complements the parser contract fixture harness: the harness tests the `SourceParser` Interface, while the builder deepens the parser Implementation path that produces the contract.

## Benefits

- **Locality**: extracted-section naming, duplicate prevention, source attribution, and optional-section handling move to one Module instead of being repeated across every parser Adapter.
- **Leverage**: new parser Adapters get the empty result shape, source attribution, narrative insertion, and `sectionsExtracted` behavior through a small Interface.
- **Testability**: builder tests can cover field-to-section rules and duplicate handling directly, while parser contract fixtures can focus on source-specific extraction.

## Implementation Notes

- Preserve the existing `ParserResult` output shape and section labels on the first pass.
- Start with an additive builder exported from `scripts/parsers/base.ts` or a new `scripts/parsers/result-builder.ts`.
- Migrate one parser family at a time, beginning with `tripsit.ts`, `psychonautwiki.ts`, and `erowid.ts` because they already use near-identical local `pushExtractedSection` helpers.
- Keep source-specific parsing helpers such as `scripts/parsers/tripsit/routes.ts` and `scripts/parsers/psychonautwiki/structured.ts` focused on text extraction; do not fold those into the builder.
- Coordinate with the existing `parsers-source-identity-contract.md` task so the builder can eventually receive a canonical source descriptor instead of a raw string.

## Verification

- Add unit tests for the result builder covering empty output, adding each parsed field, duplicate `sectionsExtracted` prevention, narrative note insertion, and source attribution.
- Run the existing parser contract tests after each parser-family migration.
- Run `npm run parse:sources -- --substance lsd --stats` before and after migration and compare the parsed output for no unintended shape or section-label changes.
- After the full migration, run the whole parser test suite and a representative parsed-output diff over several source-heavy substances.
