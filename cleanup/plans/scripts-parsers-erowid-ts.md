# CLN-004 Split the Erowid parser by domain responsibility

- **Status**: ✅ DONE
- **File**: `scripts/parsers/erowid.ts`
- **Current size**: 935 LOC
- **Category**: Active logic
- **Priority**: P0
- **Effort**: L
- **Strategy**: Parser decomposition
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

The file mixes markdown section extraction, dosage parsing, duration parsing, effects parsing, legal and harm parsing, and multiple narrative adapters in one class-backed module.

## Target End State

- `ErowidParser` becomes a thin orchestrator under 250 LOC.
- Dosage, duration, effects, legality/harm, and narrative parsing each live in focused helper modules.
- Representative fixture tests lock down current parsing behavior before any extraction.

## Ordered Work Plan

1. Safety net and inventory
- Add characterization fixtures for at least one Erowid source that exercises dosage, duration, effects, legality, harm, and narrative extraction.
- Extract section-reading helpers into a dedicated Erowid section module instead of mixing them with semantic parsers.
- Split dosage and duration parsing into separate modules with small pure helpers for route normalization and range parsing.
- Move effects plus legality and harm parsing into their own modules so each concern changes independently.
- Collapse the many narrative field adapters into a small registry-driven mapping instead of repeated inline functions.
- Keep the public parser contract stable and verify parsed output snapshots against the fixture set.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] `scripts/parsers/erowid.ts` is an orchestration facade under the cleanup budget.
- [x] Domain helpers are unit-tested and no longer co-located by accident.
- [x] No parser regression appears in fixture snapshots or downstream contract tests.
- [x] The central tracker entry for CLN-004 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/parsers/erowid.ts` is now a 55 LOC facade over dedicated helpers in `scripts/parsers/erowid/`.
- Added focused modules for subsection reading, dosage parsing, duration parsing, effect extraction, legal parsing, harm reduction parsing, and narrative collection.
- Added `lib/erowidParser.test.ts` to characterize duration, legality, harm reduction, and narrative extraction beyond the existing contract coverage.
- Tightened Erowid subsection parsing so nested title-case markers and international-law country blocks are both parsed correctly.
