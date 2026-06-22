---
name: quotes
description: Batch quote extraction orchestrator with progress and cost tracking
---

# Quote Extraction Orchestrator

Batch process quote extractions from substance source files using OpenRouter's Gemini Flash 3 API.

## Current Status

| Category | Completed | Total | Remaining | Last Run | Cost |
|----------|-----------|-------|-----------|----------|------|
| Legality | 248 | 248 | 0 | 2026-01-17 | $2.89 |
| Tolerance | 248 | 248 | 0 | 2026-01-17 | $0.44 |
| Subjective Effects | 248 | 248 | 0 | 2026-01-17 | $0.10 |
| Intro Text | 248 | 248 | 0 | 2026-01-17 | $0.48 |

**ALL CATEGORIES COMPLETE** - Total cost: ~$3.91

**Note:** Only processed high/normal priority substances (248 total after removing 4 with no source files).

## Usage

```bash
# Set API key
export OPENROUTER_API_KEY="sk-or-..."

# Run extraction for a category (resumes by default)
node scripts/batch-extract-quotes.mjs --category=legality --resume

# Use sequential mode for large files (avoids memory issues)
node scripts/batch-extract-quotes.mjs --category=tolerance --sequential --resume

# Dry run to preview
node scripts/batch-extract-quotes.mjs --category=intro-text --dry-run --verbose
```

## Command Options

| Option | Description |
|--------|-------------|
| `--category=<name>` | Required. One of: legality, tolerance, subjective-effects, intro-text |
| `--resume` | Skip substances that already have output files |
| `--sequential` | Process one file at a time (recommended for large files) |
| `--concurrency=<n>` | Parallel API requests (default: 5) |
| `--limit=<n>` | Process at most N items |
| `--dry-run` | Preview what would be processed |
| `--slugs=<list>` | Process only specific slugs (comma-separated) |
| `--verbose` | Show detailed progress + large file warnings |

## Memory Management

The script now includes memory optimizations:

1. **Clears data after save** - Source data is discarded immediately after writing output
2. **Batch processing** - Processes in controlled batches rather than accumulating all results
3. **Large file detection** - Warns about files >100KB when using `--verbose`
4. **Sequential mode** - Use `--sequential` for problematic large files

Large files that caused issues in the past:
- `tramadol.ts` (240KB, ~120k tokens)
- `tobacco.ts`, `cannabis.ts`, `psilocybin-mushrooms.ts` (100KB+)

## Output Locations

| Category | Output Directory |
|----------|------------------|
| Legality | `legality-quotes/` |
| Tolerance | `tolerance-quotes/` |
| Subjective Effects | `subjective-effects-quotes/` |
| Intro Text | `intro-text-quotes/` |

## Cost Tracking

Costs are logged to `notes-and-plans/exports/batch/batch-extraction-costs.json` after each run.

Using Gemini Flash 3 pricing:
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Average per extraction: ~$0.012 (based on legality run)

### Session Log

| Date | Category | Items | Cost |
|------|----------|-------|------|
| 2026-01-16 | Legality | 248 | $2.87 |
| 2026-01-17 | Tolerance | 248 | $0.44 |
| 2026-01-17 | Subjective Effects | 67 | $0.10 |
| 2026-01-17 | Intro Text | 82 | $0.48 |

**Total spent: $3.91**

## Files

| File | Purpose |
|------|---------|
| `scripts/batch-extract-quotes.mjs` | Main batch processing script |
| `scripts/prompts/legality-extraction.md` | Legality extraction prompt |
| `scripts/prompts/tolerance-extraction.md` | Tolerance extraction prompt |
| `scripts/prompts/subjective-effects-extraction.md` | Effects extraction prompt |
| `scripts/prompts/intro-text-extraction.md` | Intro text extraction prompt |
| `notes-and-plans/exports/batch/batch-extraction-costs.json` | Cost tracking log |

## Execution Order (Recommended)

1. **Legality** - COMPLETE ✓
2. **Tolerance** - COMPLETE ✓
3. **Subjective Effects** - COMPLETE ✓
4. **Intro Text** - COMPLETE ✓

## Excluded Sources

- **Subjective Effects**: PsychonautWiki and DEIS are excluded (processed separately)
- **Other categories**: All sources included

## Troubleshooting

**Memory errors (heap limit)?**
- Use `--sequential` flag
- Or reduce concurrency: `--concurrency=2`

**Fetch failed?**
- Usually transient - retry the same command
- Large files may timeout - use `--sequential`

**Missing source files?**
- Some priority substances don't have source files
- Set them to low priority in SubstanceIndex.json
