# Workflow Generated Data Provenance

## Files

- `src/schema/substance.schema.ts`
- `scripts/generate/generateSchemaUtils.ts`
- `src/data/schema/**`
- `scripts/parse-sources.ts`
- `src/data/parsed-sources.json`
- `scripts/build/generateArticleManifest.mjs`
- `src/data/articleSourceManifest.json`
- `scripts/data/generateSmilesMap.mjs`
- `src/data/mappings/**`
- `README.md`
- `AGENTS.md`
- `scripts/README.md`

## Problem

Generated and source-of-truth files are mixed in `src/data/` with hand-maintained config, backups, migration seeds, and runtime-adjacent artifacts. Some generated files include comments naming `npm run generate:schema`, but other generated-data workflows rely on docs or script names. Maintainers must infer which Module owns a file, which Interface regenerates it, and whether editing it directly is safe.

This is process friction around generated data, not only file organization. The Implementation details of schema generation, source parsing, manifest building, and mapping generation leak into review and maintenance because there is no single provenance contract.

## Proposed deepening opportunity

Introduce a generated-data provenance Module that records every generated artifact, its input files, generation command, expected output paths, and edit policy. This can be a markdown table, JSON manifest, or script-readable manifest, but it should become the Interface for generated-data workflow.

Each generator remains an Adapter behind that seam. The provenance Module should distinguish Convex-authored runtime data, local seed/export material, generated schema helpers, generated indexes, and disposable artifacts. It should also support a verification mode that checks whether generated outputs are current without rewriting them.

## Benefits

- Module: gives generated-data ownership a named Module instead of scattered comments and docs.
- Interface: callers learn one contract for "what generated this file and how do I refresh it."
- Implementation: individual generator scripts can vary internally while preserving provenance metadata.
- Depth: a small manifest provides leverage across reviews, docs, agents, and CI checks.
- Seam: creates a place to add freshness checks or artifact classification without touching every generator.
- Adapter: schema, source parser, manifest, and mapping generators become concrete adapters behind the provenance interface.
- Leverage: contributors can safely regenerate outputs without reverse-engineering script internals.
- Locality: stale generated data bugs concentrate in one provenance check and its adapters.

## Test plan

- Add a provenance verification command that checks all listed output paths exist and are produced by existing commands.
- Add freshness checks for deterministic generators such as schema helpers and article manifests.
- Add a docs check that verifies generated files named in README, AGENTS, and scripts README are represented in the provenance Module.
- Run `npm run generate:schema`, `npm run parse:sources`, and the manifest/mapping generators in a clean worktree to confirm expected output paths.

## Risk/rollout notes

- Begin with an informational manifest and non-blocking verification.
- Make freshness checks blocking only for deterministic, low-cost generators.
- Do not classify Convex runtime data as locally editable; the manifest should reinforce that local JSON is backup, seed, migration, export, or prompt material unless code explicitly treats it otherwise.
