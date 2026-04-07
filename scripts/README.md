# Scripts

Utility scripts for data processing, migrations, and batch operations.

## Directory Structure

```
scripts/
├── batch/           # Batch AI generation and quote extraction
├── replications/    # Effect replication media management
├── migrate/         # Data migrations (Convex, schema changes)
├── prepopulate/     # Populate articles from parsed sources
├── seed/            # Seed initial Convex data (layouts, config)
├── analyze/         # Data analysis and gap detection
├── convex/          # Convex import/export/sync utilities
├── build/           # Build-time scripts (compress, sitemap, prerender)
├── parsers/         # Source extraction parsers
├── data/            # Data utilities and exports
├── prompts/         # AI extraction prompt templates
├── util/            # Shared utilities
├── generate/        # Code generation
└── deprecated/      # Archived scripts
```

## Quick Reference

### Batch Generation

```bash
# Quote extraction (run first)
node scripts/batch/batch-extract-quotes.mjs --category=legality --resume

# Section generation
node scripts/batch/batch-generate-summary.mjs --all --concurrency=2
node scripts/batch/batch-generate-legality.mjs --dry-run
node scripts/batch/batch-generate-harm-potential.mjs --substance=lsd
node scripts/batch/batch-generate-history-culture.mjs --all --concurrency=5
node scripts/batch/batch-generate-dosage-duration.mjs --limit=5

# Monitor progress
node scripts/batch/watch-batch-progress.mjs

# Export OpenRouter-ready rewrite jobs from the dosage/duration note queue
node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs
node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs --article=2c-b

# Run the exported jobs through OpenRouter and write reviewable JSON results
export OPENROUTER_API_KEY="sk-or-..."
node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs
node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs --article=2c-b --verbose

# Apply reviewed rewrite results to SubstanceIndex.json and sync changed articles to Convex
export CONVEX_ADMIN_KEY="$(grep '^CONVEX_ADMIN_KEY=' .env.local | cut -d= -f2-)"
export VITE_CONVEX_URL="https://..."
node scripts/batch/apply-dosage-duration-rewrite-results.mjs
node scripts/batch/apply-dosage-duration-rewrite-results.mjs --dry-run --article=2c-b
```

### Replications

```bash
# Scan and import workflow
node scripts/replications/scan-replications.mjs
node scripts/replications/assign-image-effects.mjs
node scripts/replications/upload-replications.mjs --only-missing
node scripts/replications/create-gallery-order.mjs
```

### Migrations

```bash
# Convex migrations
node scripts/migrate/migrate-trip-reports.mjs
node scripts/migrate/migrate-effects.mjs
node scripts/migrate/migrate-prompts-to-convex.mjs
node scripts/migrate/migrate-substance-index-to-convex.mjs
```

### Prepopulate from Sources

```bash
npm run parse:sources  # Generate parsed-sources.json first
node scripts/prepopulate/prepopulate-dosage-duration.mjs --dry-run
node scripts/prepopulate/prepopulate-interactions-tripsit.mjs
node scripts/prepopulate/prepopulate-legality.mjs
```

### Convex Operations

```bash
node scripts/convex/export-convex-to-json.mjs
node scripts/convex/sync-convex-to-production.mjs
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
export VITE_CONVEX_URL="https://..."      # Convex deployment URL
export OPENROUTER_API_KEY="sk-or-..."     # For batch generation
```

Batch generation and quote extraction scripts use the shared OpenRouter SDK helper at `scripts/lib/openrouter-sdk.mjs`.

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
