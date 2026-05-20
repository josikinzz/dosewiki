# Parsers Aggregation Policy Module

## Files

- `scripts/parsers/aggregation.ts`
- `scripts/parsers/types.ts`
- `scripts/parsers/contracts.ts`
- `scripts/parsers/tripsit-combos.ts`
- `lib/parserContracts.test.ts`

## Problem

`aggregateResults` currently merges every parsed section, applies source priority for pharmacology, carries temporary `_src_*` fields inside the aggregate object, concatenates harm-reduction arrays, and records source coverage. `enrichWithCombos` then mutates the aggregated data in place and applies separate interaction override policy.

The aggregation Interface looks simple, but callers must still understand hidden Implementation policy: which fields are first-writer-wins, which are concatenated, which use source priority, which post-processors mutate in place, and how source coverage is adjusted. That makes the Module shallow for source aggregation because the important conflict-resolution rules are implicit in code paths rather than represented as a local policy.

## Proposed Deepening Opportunity

Introduce an aggregation policy Module that owns merge rules per parsed field. The Interface should make source aggregation explicit without forcing callers to know field internals:

- `aggregateParsedSources(records, policySet)` returns a new `ParsedSubstanceData`
- policy adapters handle dosage, duration, effects, interactions, chemistry, pharmacology, harm reduction, tolerance, narrative content, legal, and source coverage
- TripSit combos becomes an enrichment policy Adapter that returns a new aggregate or an explicit patch, rather than mutating the aggregate in place
- source priority, override lists, duplicate detection, and coverage attribution live in policy modules

## Benefits

- **Module**: source aggregation becomes a deep Module around conflict resolution, not just a loop over parser results.
- **Interface**: callers ask for an aggregate and optional policies; they do not need to know each field's merge behavior.
- **Implementation**: field-specific merge details, priorities, and enrichment mutations stay behind the aggregation Interface.
- **Depth**: one Interface gives leverage over many source types and parsed fields.
- **Seam**: conflict policy becomes a seam where future source-specific rules can change without editing the run pipeline.
- **Adapter**: TripSit combos can be a policy Adapter alongside parser-output adapters, instead of a special post-processing mutation.
- **Leverage**: adding a new source or parsed field requires adding or extending one policy, not checking every parser and the CLI.
- **Locality**: bugs in pharmacology priority, interaction replacement, or coverage attribution are concentrated in aggregation policy tests.

## Test Plan

- Add aggregation policy unit tests with small `ParsedSourceRecord` fixtures for each field.
- Cover pharmacology priority without temporary `_src_*` fields leaking into output.
- Cover interaction duplicate detection and TripSit combo override behavior as a policy test.
- Cover source coverage attribution when enrichment adds data but no text tokens.
- Add a snapshot or structural test for `createParsedOutput` after policy aggregation.

## Risk/Rollout Notes

- Keep the initial policy behavior byte-for-byte compatible with current parsed output.
- Migrate one field at a time behind the same `aggregateResults` export to keep parser callers stable.
- Use parsed output diffing across a representative corpus before replacing the old merge implementation.
