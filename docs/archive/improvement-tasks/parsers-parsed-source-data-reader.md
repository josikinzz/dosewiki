# Parsers Parsed Source Data Reader

## Status

Proposed

## Files

- `src/data/parsed-sources.json`
- `scripts/parsers/types.ts`
- `scripts/parsers/aggregation.ts`
- `scripts/prepopulate/prepopulate-high-confidence.mjs`
- `scripts/prepopulate/prepopulate-dosage-duration.mjs`
- `scripts/prepopulate/prepopulate-legality.mjs`
- `scripts/prepopulate/prepopulate-pharmacology.mjs`
- `scripts/prepopulate/prepopulate-interactions-tripsit.mjs`
- `scripts/prepopulate/prepopulate-tolerance.mjs`
- `scripts/analyze/analyze-source-coverage.ts`
- `scripts/data/coverage-report/loader.ts`
- `scripts/analyze/*`

## Problem

Parsed source data is generated through the parser pipeline, but downstream scripts read `src/data/parsed-sources.json` directly and rebuild their own small Interfaces over the artifact. Prepopulate scripts hard-code the path, repeat slug matching, and interpret parsed fields inline. Coverage and analysis scripts define separate partial TypeScript shapes, source lists, short display names, and field-to-source projection logic.

This makes the parsed source artifact a shallow seam. The file path is easy to use, but every consumer must know the artifact version, substance lookup rules, optional field shapes, source coverage semantics, and which fields count as available for a workflow. Existing tasks already cover artifact provenance, artifact size, source identity, and aggregation policy; the missing Module is the read-side Interface that turns generated parser output into stable consumer projections.

## Solution Plan

Create a parsed source data reader Module for scripts that consume generated parser output. Its Interface should hide artifact layout and expose workflow-shaped queries:

- load and validate a parsed source artifact from a path or future manifest Adapter
- get a parsed substance by canonical slug or article title
- project field availability by source for coverage reports
- project high-confidence prepopulation candidates for dosage, duration, legality, pharmacology, interactions, tolerance, and chemistry
- expose artifact metadata such as version, generated time, source coverage, and source list through typed accessors
- report missing, malformed, stale, or unsupported artifact versions before mutation scripts run

Prepopulate and analysis scripts should become Adapters that ask this Module for the projection they need, rather than parsing JSON and reconstructing field/source rules locally.

## Benefits

- **Locality**: artifact loading, version checks, slug lookup, and field/source projection live in one Module instead of many scripts.
- **Leverage**: future changes to parsed output shape, sharding, or manifest-backed artifacts can be absorbed behind one Interface.
- **Testability**: consumers can be tested with small parsed-artifact fixtures, and mutation scripts can verify candidate projections without reading the 260k-line generated file.

## Implementation Notes

- Keep this separate from parser aggregation. Aggregation decides how parser records become the artifact; the reader decides how downstream scripts consume that artifact.
- Preserve direct JSON output initially. The reader can start as a compatibility layer around `src/data/parsed-sources.json` and later become the Adapter point for the cleanup task that shards or externalizes the artifact.
- Reuse `scripts/parsers/types.ts` where practical, but provide narrower consumer projection types so prepopulate scripts do not depend on the full parser output shape.
- Coordinate source display names and source IDs with the existing `parsers-source-identity-contract.md` task.
- Avoid changing live article data in this task. This Module should make prepopulate decisions more explicit, not perform Convex or local article writes itself.

## Verification

- Add fixture tests for artifact loading, version rejection, title-to-slug lookup, missing substance reporting, and malformed field handling.
- Add projection tests for dosage/duration availability, interaction severity grouping, legal status candidates, pharmacology field presence, tolerance raw text, chemistry identifiers, and source coverage by field.
- Update one low-risk analysis script to use the reader first, then compare its output against the current script output.
- Update one prepopulate dry-run path to use the reader and verify the dry-run summary is unchanged for representative substances.
