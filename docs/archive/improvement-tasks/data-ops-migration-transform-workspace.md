# Data Ops Migration Transform Workspace

## Files

- `scripts/migrate/migrate-citations-to-sources.mjs`
- `scripts/migrate/migrate-pharmacology-schema.mjs`
- `scripts/migrate/migrate-harm-potential-schema.mjs`
- `scripts/migrate/migrate-add-slugs.mjs`
- `scripts/prepopulate/prepopulate-high-confidence.mjs`
- `scripts/prepopulate/prepopulate-source-citations.mjs`
- `scripts/prepopulate/prepopulate-from-old-articles.mjs`
- `scripts/prepopulate/prepopulate-legality.mjs`
- `scripts/prepopulate/prepopulate-interactions-tripsit.mjs`
- `scripts/prepopulate/dosage-duration/*`
- `src/schema/substance.schema.ts`
- `src/data/schema/`

## Problem

Prepopulate and migration scripts mix three concerns in one file: selecting records, transforming article fields, and persisting results. Some transformations are reusable pure logic, such as dosage/duration normalization, but many others are embedded in scripts that also read files, print progress, parse CLI flags, and write `SubstanceIndex.json` or Convex directly. Several scripts reconstruct local versions of article matching, slugging, empty-field checks, citation deduplication, source-name mapping, and summary stats.

The result is a shallow migration Interface. To understand or test a migration, a maintainer must read the full script and mentally separate source selection, transformation policy, and write behavior. Bugs in transformation policy are hard to isolate because the test surface is usually the whole script rather than a deep Module with fixtures.

## Proposed deepening opportunity

Create a migration transform workspace Module for article-shaped data operations. Its Interface should accept a collection of article records plus named source adapters, then return a migration plan: changed records, unchanged records, skipped records, warnings, validation failures, and a structured diff summary. Individual migrations should provide small transform adapters for a specific article section or source type.

Keep persistence outside this Module. Convex writes, local JSON exports, and dry-run reports should consume the same migration plan through the data ops run-context seam. The transform workspace should validate output against the article contract before any adapter writes data.

## Benefits

- **Module**: migration planning becomes one Module for article selection, transform execution, validation, and diff reporting.
- **Interface**: each migration supplies a focused transform adapter instead of owning filesystem reads, CLI mode, persistence, and stats formatting.
- **Implementation**: slug matching, empty-field policy, citation deduplication, before/after summaries, and schema validation are concentrated.
- **Depth**: the workspace hides repetitive migration mechanics behind a small plan/result Interface.
- **Seam**: transform planning is separated from persistence, so the same migration can target dry-run output, local backups, dev Convex, or production sync.
- **Adapter**: old article dumps, parsed source files, prompt files, and Convex reads become source adapters feeding the workspace.
- **Leverage**: new migrations inherit diff summaries, skipped-record reporting, and article contract validation without rebuilding them.
- **Locality**: changing slug policy or validation rules affects one migration planning Implementation instead of many scripts.

## Test plan

- Add fixture tests for the workspace result shape: changed, unchanged, skipped, warning, validation failure, and summary counts.
- Add adapter tests for representative transforms: citation move, source citation population, dosage/duration population, and slug backfill.
- Add contract tests that invalid transformed articles fail before any persistence adapter is called.
- Add golden diff fixtures for a small multi-article dataset so migration output remains stable across refactors.

## Risk/rollout notes

Do not start by changing persistence behavior. First extract one low-risk local JSON migration into a transform adapter and compare dry-run output byte-for-byte or semantically with the current script. Then migrate Convex-backed transformations. Keep one-off scripts callable during rollout, but route their core transform through the workspace once parity fixtures exist.
