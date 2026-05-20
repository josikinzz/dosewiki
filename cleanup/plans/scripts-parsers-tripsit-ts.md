# CLN-010 Separate TripSit factsheet and wiki parsing paths

- **Status**: ✅ DONE
- **File**: `scripts/parsers/tripsit.ts`
- **Current size**: 748 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Parser decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

One file currently handles both TripSit factsheet and TripSit wiki shapes while also owning dosage, duration, effects, interactions, tolerance, classification, and narrative parsing.

## Target End State

- Factsheet parsing and wiki parsing live in different modules with shared helpers only where genuinely shared.
- Interaction, tolerance, and classification parsing are isolated from dosage/duration concerns.
- The entry module only selects the correct parser path and merges results.

## Ordered Work Plan

1. Safety net and inventory
- Build fixtures for both TripSit factsheet and TripSit wiki inputs so the two formats are tested independently.
- Extract route-table and labeled-bullet dosage parsing into dedicated helpers.
- Move duration parsing into a focused module that wraps the existing inline-route and nested-duration helpers.
- Split interactions, tolerance, classification, and narrative parsing into separate files.
- Keep `TripSitFactsheetsParser` and `TripSitWikiParser` as thin classes or factories over the extracted helpers.
- Run contract tests to prove both source formats still emit the same normalized output.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] Factsheet and wiki concerns no longer share a god file.
- [x] Each semantic domain has one obvious home.
- [x] Entry modules stay comfortably below the cleanup threshold.
- [x] The central tracker entry for CLN-010 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/parsers/tripsit.ts` is now a 137 LOC entry module over focused helpers in `scripts/parsers/tripsit/`.
- Shared route parsing, effect parsing, interaction/tolerance parsing, and narrative/meta helpers now live in dedicated modules, while factsheet- and wiki-specific parser classes only wire those pieces together.
- Added `lib/tripsitParser.test.ts` to characterize the TripSit wiki path independently from the existing factsheet contract coverage.
