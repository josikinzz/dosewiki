# CLN-005 Decompose the PsychonautWiki parser into section modules

- **Status**: ✅ DONE
- **File**: `scripts/parsers/psychonautwiki.ts`
- **Current size**: 871 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Parser decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The file owns dosage/duration parsing, subjective-effect taxonomy parsing, toxicity/interactions, legal status, chemistry/pharmacology extraction, and multiple narrative helpers.

## Target End State

- `PsychonautWikiParser` remains as a thin composition layer.
- Route parsing, effects taxonomy, legal and toxicity parsing, and narrative extraction are isolated modules.
- Fixture coverage captures the route and effects taxonomy edge cases that make this parser risky.

## Ordered Work Plan

1. Safety net and inventory
- Create characterization fixtures that cover route subsections, subjective-effects categories, dangerous interactions, and legal status extraction.
- Extract dosage and duration handling into a dedicated route parser module.
- Move subjective-effect category parsing into its own taxonomy-focused module with small reusable helpers.
- Split toxicity/interactions and legal status parsing into separate modules.
- Replace repeated narrative extractors with a registry or map that documents which sections feed which output fields.
- Verify no behavior drift by snapshotting parser output for a representative PsychonautWiki source.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] `scripts/parsers/psychonautwiki.ts` mainly wires modules together.
- [x] Effects taxonomy logic is isolated and directly testable.
- [x] All major content domains can change without reopening one oversized file.
- [x] The central tracker entry for CLN-005 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/parsers/psychonautwiki.ts` is now a 65 LOC composition layer over focused helpers in `scripts/parsers/psychonautwiki/`.
- Added dedicated modules for route parsing, effects taxonomy parsing, safety/tolerance parsing, legal extraction, structured chemistry/pharmacology parsing, and narrative collection.
- Added `lib/psychonautwikiParser.test.ts` to characterize route subsections, dangerous interactions, legal extraction, tolerance capture, structured chemistry/pharmacology output, and preserved narrative content.
