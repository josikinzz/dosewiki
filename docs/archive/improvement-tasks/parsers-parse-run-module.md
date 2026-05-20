# Parsers Parse Run Module

## Files

- `scripts/parse-sources.ts`
- `scripts/parsers/index.ts`
- `scripts/parsers/registry.ts`
- `scripts/parsers/aggregation.ts`
- `scripts/parsers/tripsit-combos.ts`

## Problem

`scripts/parse-sources.ts` is both the CLI and the parse run implementation. It owns CLI option parsing, source file discovery, dynamic module loading, per-source parser dispatch, aggregation, TripSit combo enrichment, preservation of manually edited legal entries, stats collection, and JSON persistence.

That makes the current Module shallow in the wrong place: the script has a small command-line Interface, but the useful Implementation is embedded behind process state, filesystem paths, console output, and `process.exit`. Parser behavior is therefore harder to test at the run level than at the helper level, and callers cannot reuse the parse run without re-entering the CLI.

## Proposed deepening opportunity

Create a `parseSourceCorpus` Module under `scripts/parsers/` or `scripts/parse-sources/` with a narrow Interface that accepts explicit adapters:

- source catalog Adapter: lists and loads substance source modules
- parser registry Adapter: resolves source IDs to parsers
- enrichment Adapter: applies post-parse source aggregation such as TripSit combos
- persistence Adapter: reads existing parsed output and writes final output
- reporter Adapter: receives progress, stats, and warnings

Keep `scripts/parse-sources.ts` as a thin CLI Adapter that parses arguments, builds filesystem adapters, invokes the deep Module, and maps failures to exit codes.

## Benefits

- **Module**: the parse run becomes a named Module with an Interface that describes the corpus parse operation instead of scattering it through a script.
- **Interface**: callers provide paths and adapters explicitly, so environment assumptions move out of the Implementation.
- **Implementation**: loading, dispatch, aggregation order, manual preservation, enrichment, stats, and output shape stay local to one parse pipeline.
- **Depth**: a small `parseSourceCorpus(options)` Interface gives leverage over the whole parse run.
- **Seam**: filesystem, console, process exit, and existing-output preservation become seams instead of hard-coded dependencies.
- **Adapter**: the CLI, tests, and future Convex/import workflows can use different adapters without editing parse logic.
- **Leverage**: tests can exercise an entire parse run with two in-memory substances and known parser results.
- **Locality**: changes to run ordering or stats no longer require editing the CLI script and then manually reasoning about parser side effects.

## Test Plan

- Add unit tests for `parseSourceCorpus` using in-memory source catalog, parser registry, enrichment, and persistence adapters.
- Cover single-substance filtering, missing substance behavior, unsupported source behavior, existing manual legal preservation, combo enrichment ordering, and stats after enrichment.
- Keep one smoke test or CLI fixture proving `scripts/parse-sources.ts` maps arguments into the Module correctly.
- Verify `npm run parse:sources -- --substance <known-slug> --stats` still writes the expected output shape.

## Risk/Rollout Notes

- Roll out as an extraction first: preserve current output ordering, stats names, and manual legal preservation semantics.
- Avoid moving source parser implementations during the first step; only deepen the run Module.
- Treat generated `src/data/parsed-sources.json` diffs as a rollout gate. The first implementation should produce either no diff or an intentional, reviewed diff.
