# Data Ops Artifact Lineage Manifest

## Files

- `src/data/SubstanceIndex.json`
- `src/data/backups/*.json`
- `src/data/parsed-sources.json`
- `src/data/articleSourceManifest.json`
- `src/data/config/generatorPrompt.md`
- `src/data/config/sectionPrompts/*.md`
- `scripts/convex/export-convex-to-json.mjs`
- `scripts/migrate/migrate-prompts-to-convex.mjs`
- `scripts/migrate/compare-prompts.mjs`
- `scripts/parse-sources.ts`
- `scripts/prepopulate/*.mjs`
- `AGENTS.md`

## Problem

The repo treats local data under `src/data` as backup, seed, migration, export, or prompt material unless code says otherwise, but that status is not encoded next to the artifacts. `SubstanceIndex.json`, timestamped backups, parsed source output, prompt markdown, generated schema helpers, and article/source manifests each have different freshness and ownership rules. Operators must infer whether a file is canonical, derived, stale, safe to regenerate, or safe to import into Convex by reading scripts and docs.

This creates process ambiguity around data import/export/sync workflows. A local JSON file can look like an authoritative data source even when AGENTS says Convex owns live runtime data. Prompt markdown is runtime-backed by Convex but still lives beside config files. Backups preserve old states but do not consistently record which deployment, script, schema version, or command produced them.

## Proposed deepening opportunity

Add a data artifact lineage manifest Module, likely under `src/data/` or `docs/architecture/`, that records each operational artifact's role, producer, consumer, freshness rule, source deployment, target deployment if applicable, schema version or generated-at time, and whether it can be edited by hand. Scripts that create exports, backups, parsed source output, or prompt migrations should update or emit manifest entries.

The Interface should answer simple operational questions: is this artifact canonical, derived, backup, seed, migration input, or prompt source; which Module produced it; which adapters consume it; and what command refreshes it. The Implementation can be a checked-in manifest plus helper functions that scripts use when writing artifacts.

## Benefits

- **Module**: artifact lineage becomes a documented Module instead of scattered comments, file names, and operator memory.
- **Interface**: contributors query artifact role and refresh command without knowing every script Implementation.
- **Implementation**: generated-at metadata, source deployment, producer command, schema/hash details, and edit policy are recorded consistently.
- **Depth**: a compact manifest explains a broad operational data surface.
- **Seam**: data-producing scripts write through a manifest seam when creating backups or exports.
- **Adapter**: Convex export, parser output, prompt migration, and local prepopulate scripts become adapters that publish lineage metadata.
- **Leverage**: source-of-truth rules become mechanically visible in reviews and safer for future automation.
- **Locality**: when a file changes role, the role change is localized to one manifest and the scripts that emit it.

## Test plan

- Add a manifest validation test that every tracked `src/data` JSON/markdown backup or generated artifact has a role, producer, consumer, and edit policy.
- Add script tests that export or backup commands emit lineage metadata with command name, timestamp, source URL label, and schema/hash fields.
- Add a hygiene check that flags stale generated artifacts or artifacts marked derived but modified without a matching producer update.
- Add docs tests or link checks so manifest refresh commands point to existing scripts.

## Risk/rollout notes

Begin as documentation-only metadata so it does not block urgent data work. Once the manifest is trusted, wire it into `hygiene:check` as warnings before making failures strict. Avoid treating timestamp churn as meaningful code changes by keeping volatile run metadata in generated sidecar files or stable summaries unless a specific export requires a committed timestamp.
