# Scripts

Utility scripts for data processing, migrations, and batch operations.

Substance writes should go through `api.substanceIndex.saveSubstance` or
`api.substanceIndex.saveSubstances`. Those mutations adapt to the shared Convex
substance ingestion module and return `created`, `updated`, `skipped`, `errors`,
per-article `outcomes`, and `affectedPaths`; scripts should treat `errors` as
partial-success diagnostics instead of reconstructing ID/slug matching locally.

## Directory Structure

```
scripts/
├── batch/           # Batch AI generation and quote extraction
├── replications/    # Effect replication media management
├── migrate/         # Data migrations (Convex, schema changes)
├── prepopulate/     # Populate articles from parsed sources
├── citations/       # Claim-level citation drafts and evidence write workflows
├── seed/            # Seed initial Convex data (layouts, config)
├── analyze/         # Data analysis and gap detection
├── chemistry/       # Chemistry identifier provenance and map adapters
├── article-source-documents/ # Normalized article source document contract
├── convex/          # Convex import/export/sync utilities
├── build/           # Build-time scripts (compress, sitemap, prerender)
├── parsers/         # Source extraction parsers
├── data/            # Data utilities and exports
├── prompts/         # AI extraction prompt templates
├── util/            # Shared utilities
├── generate/        # Code generation
└── deprecated/      # Archived scripts; not part of active workflows
```

## Quick Reference

Prefer package commands for stable workflows. Pass script-specific arguments
after `--`; for example, `npm run batch:legality -- --dry-run`. The manifest at
`scripts/lib/workflow-command-surface.mjs` records each stable command's purpose,
required environment, read/write target, dry-run policy, and production impact.
Direct `node scripts/...` invocations remain supported for low-level adapters and
existing operator shell history.

Workflow tooling has a separate fast test and lint surface from the app suite:

```bash
npm run test:workflow
npm run lint:scripts
```

`test:workflow` runs the command-surface `node:test` checks plus active
Vitest-backed script module tests under `scripts/**`, excluding
`scripts/deprecated/**`. `lint:scripts` covers active script libraries and
workflow adapters without adding those files to the default app lint command.

Stable package commands not shown in the examples below: `npm run merge:articles`,
`npm run generate:manifest`, `npm run generate:schema`,
`npm run parse:sources:verbose`, `npm run cleanup:metrics`,
`npm run hygiene:check`, `npm run hygiene:clean`, and
`npm run prompts:compare`.

### Batch Generation

```bash
# Quote extraction (run first)
npm run batch:extract -- --category=legality --resume

# Section generation
npm run batch:summary -- --all --concurrency=2
npm run batch:legality -- --dry-run
npm run batch:harm-potential -- --substance=lsd
npm run batch:history-culture -- --all --concurrency=5
npm run batch:dosage-duration -- --limit=5

# Convex is the live write target. Add --update-local-json only when you also
# want src/data/SubstanceIndex.json refreshed as a derived export.
npm run batch:harm-potential -- --substance=lsd --update-local-json

# Monitor progress
npm run batch:watch

# Export OpenRouter-ready rewrite jobs from the dosage/duration note queue
npm run batch:dosage-duration:export
npm run batch:dosage-duration:export -- --article=2c-b

# Run the exported jobs through OpenRouter and write reviewable JSON results
export OPENROUTER_API_KEY="sk-or-..."
npm run batch:dosage-duration:run
npm run batch:dosage-duration:run -- --article=2c-b --verbose

# Apply reviewed rewrite results to SubstanceIndex.json and sync changed articles to Convex
export CONVEX_ADMIN_KEY="$(grep '^CONVEX_ADMIN_KEY=' .env.local | cut -d= -f2-)"
export VITE_CONVEX_URL="https://..."
npm run batch:dosage-duration:apply
npm run batch:dosage-duration:apply -- --dry-run --article=2c-b
```

### Formal citations

```bash
npm run citations:formal -- --slug=2c-b --dry-run
npm run citations:formal -- --slug=2c-b --write --confirm-citation-write
```

The formal citation pilot reads the article, article source documents, and existing
citation evidence from Convex. Dry-run output shows proposed `[cite:stable-id]`
tokens, structured `reference_ids`, reference entries, evidence rows, and review
gaps. Writes use the shared data-ops target/confirmation flow and preserve
approved evidence unless `--refresh-approved` or `--replace-approved` is passed.

Legacy citation-array maintenance is no longer a supported migration path once an
article has structured `references` or route-level `reference_ids`. The following
scripts now fail closed with retirement notices:

- `scripts/data/syncArticleCitations.mjs`
- `scripts/migrate/migrate-citations-convex.mjs`
- `scripts/migrate/migrate-citations-to-sources.mjs`

`scripts/prepopulate/prepopulate-source-citations.mjs` remains compatibility-only:
it can refresh leftover `source_citations`, but it now fails closed if any
article already has structured `references` or route-level `reference_ids`.
It is not a replacement for the formal citations workflow and should not be
used to author structured references.

### Replications

```bash
# Scan and import workflow
node scripts/replications/scan-replications.mjs
node scripts/replications/assign-image-effects.mjs
node scripts/replications/upload-replications.mjs --only-missing
node scripts/replications/create-gallery-order.mjs --dry-run
node scripts/replications/create-gallery-order.mjs --execute
```

Replication media scan, reconciliation, gallery-order planning, and Convex write adapters live in `scripts/replications/lib/workspace.mjs`. Keep script CLIs thin and move shared media rules there before adding new one-off replication operations.

### Migrations

```bash
# Convex migrations
npm run migrate:trip-reports
npm run migrate:effects
npm run prompts:migrate
node scripts/migrate/migrate-substance-index-to-convex.mjs
```

Article-shaped migrations should put selection and field policy behind
`scripts/migrate/data-ops/transform-workspace.mjs` and keep filesystem, Convex,
and dry-run persistence in the calling script. Transform adapters live in
`scripts/migrate/data-ops/article-transforms.mjs`; they return a migration plan
with changed, unchanged, skipped, warning, validation failure, and structured diff
summary records before anything writes data.

Data operation scripts in `scripts/convex/`, `scripts/migrate/`, and
`scripts/prepopulate/` should resolve repo root, `.env.local`, Convex source and
target URLs, dry-run mode, local artifact scope, and destructive confirmation
through `scripts/lib/data-ops-run-context.mjs`. Production sync requires
`--confirm-production-sync`, cross-deployment trip report copy requires
`--confirm-cross-deployment-copy`, and replace-all SubstanceIndex import requires
`--confirm-replace`.

### Prepopulate from Sources

```bash
npm run parse:sources  # Generate parsed-sources.json first
npm run prepopulate:high-confidence -- --dry-run
npm run prepopulate:dosage-duration -- --dry-run
npm run prepopulate:interactions-tripsit
npm run prepopulate:legality
```

Article source readers, migrations, and batch prompts should load documents through
`scripts/article-source-documents/contract.mjs` so source metadata ids and content
keys are validated before import or prompt construction.

### Data Artifact Lineage

Local data artifact roles, producers, consumers, edit policy, and refresh commands
are recorded in `src/data/artifactLineageManifest.json`. Scripts that rewrite
tracked artifacts should call `scripts/lib/data-artifact-lineage.mjs` after the
write; volatile command, timestamp, deployment label, schema, and hash metadata is
emitted to ignored sidecars under `src/data/.lineage/`.

Run `npm run provenance:check` for the non-blocking generated-data provenance
report. It checks manifest shape, producer commands, listed output paths, and
whether generated data artifacts named in `README.md`, `AGENTS.md`, or this file
are represented in the manifest.

### Chemistry Identifier Maps

```bash
npm run generate:smiles -- --dry-run
```

`generateSmilesMap.mjs` reads article IUPAC names from the local backup/export data and writes the OPSIN SMILES artifact through the chemistry identifier adapter at `src/data/mappings/iupacSmilesMap.json`.

### Convex Operations

```bash
npm run convex:export
npm run convex:migrate-user-profiles -- --dry-run
npm run convex:migrate-user-profiles -- --email-map=tmp/profile-email-map.json
npm run convex:sync-production -- --confirm-production-sync
```

### Analysis

```bash
node scripts/analyze/analyze-source-coverage.ts
node scripts/analyze/check-priority-substances.mjs
node scripts/analyze/find-missing-routes.mjs
```

## Environment Variables

Most scripts require:

```bash
export VITE_CONVEX_URL="https://..."           # Default Convex deployment URL
export TARGET_CONVEX_URL="https://..."         # Explicit write/sync target
export CONVEX_PUBLIC_READ_URL="https://..."    # Public App Router server-read mirror
export CONVEX_ADMIN_KEY="..."                  # Protected Convex writes
export OPENROUTER_API_KEY="sk-or-..."          # OpenRouter-backed batch generation
```

Batch generation and quote extraction scripts use the shared OpenRouter SDK helper at `scripts/lib/openrouter-sdk.mjs`.
Quote section identity, aliases, extraction categories, local quote paths, and Convex section IDs are owned by `lib/quoteSections.js`; update that contract before adding or renaming quote-backed sections.

## Output Locations

Generated artifacts are written to `notes-and-plans/exports/`:

- `batch/` - Cost tracking and progress files
- `openrouter/` - Prompt payloads and NDJSON rewrite jobs
- `openrouter/results/` - Reviewable rewrite responses, progress, and summaries
- `replications/` - Replication metadata and gallery mappings

## Root-Level Scripts

A few utility scripts remain at the scripts root:

- `parse-sources.ts` - Main source parsing entrypoint
- `set-priority.mjs` - Set article priority levels
- `remove-contributor.mjs` - Remove contributor from articles

## Archived Scripts

The `scripts/deprecated/` directory is an archive boundary for retired one-off utilities and superseded migration helpers.

- Do not use these scripts for current workflows without re-validating them first.
- Active maintenance and cleanup work should prioritize the directories above, not `scripts/deprecated/`.
- See [`scripts/deprecated/README.md`](./deprecated/README.md) for the archive inventory and rationale.
