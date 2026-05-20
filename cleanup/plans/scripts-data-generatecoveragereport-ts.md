# CLN-023 Split coverage collection from markdown rendering

- **Status**: ✅ DONE
- **File**: `scripts/data/generateCoverageReport.ts`
- **Current size**: 614 LOC
- **Category**: Active logic
- **Priority**: P1
- **Effort**: M
- **Strategy**: Script modularization
- **Tracker**: [cleanup/CLEANUP-TASKS.md](../CLEANUP-TASKS.md)

## Why This File Is In Scope

Coverage collection, per-domain aggregation, formatting, and report rendering are all packed into one report script.

## Target End State

- Collection logic, domain summaries, and markdown table rendering live in separate modules.
- The top-level command becomes a small report assembly layer.
- Fixture-based snapshot tests protect the markdown output shape.

## Ordered Work Plan

1. Safety net and inventory
- Create a stable fixture dataset for report generation and snapshot the current output.
- Extract data loading and normalization into a loader module.
- Move each report domain generator into its own module or registry-driven section builder.
- Keep markdown rendering helpers shared instead of embedding string assembly in every section function.
- Reduce `main()` to load, assemble sections, and write or print the final report.
2. Verification and guardrails
- Run or define the smallest reliable verification loop for this file category before and after implementation.
- Update the central tracker immediately after completing work on this plan, following the existing cleanup workflow.
- Capture any metric or documentation guardrail needed to stop the file from regrowing past budget.

## Completion Criteria

- [x] The report entrypoint is small and readable.
- [x] Domain coverage logic is isolated by concern.
- [x] Report snapshots catch regressions without hand-reading giant outputs.
- [x] The central tracker entry for CLN-023 is updated with implementation notes, verification status, and any follow-on blockers.

## Dependencies And Notes

- Read the root cleanup docs first: `CLEANUP-AUDIT.md` and `CLEANUP-TASKS.md`.
- Do not treat this plan as permission to change unrelated files. Work the dependency chain deliberately.
- For data artifacts and generated files, the acceptable end state may be sharding, archiving, or generation containment rather than manual line-by-line refactoring.

## Execution Notes

- Completed on 2026-04-23.
- `scripts/data/generateCoverageReport.ts` is now a 15 LOC entrypoint over focused modules in `scripts/data/coverage-report/`.
- Coverage summary generation, by-source reporting, narrative analysis, overlap analysis, formatting, and data loading now have explicit module boundaries.
- Added `lib/generateCoverageReport.test.ts` to protect the assembled report shape with fixture-based assertions, and verified the real report script still executes against `src/data/parsed-sources.json`.
