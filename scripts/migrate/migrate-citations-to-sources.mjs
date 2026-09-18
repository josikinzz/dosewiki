#!/usr/bin/env node

console.error(`scripts/migrate/migrate-citations-to-sources.mjs is retired.

This migration only redistributes legacy citations/source_citations arrays in
SubstanceIndex.json. It does not understand structured references or
dosage/duration reference_ids and is not safe once references-era data exists.

Use:
- npm run citations:formal -- --slug=<slug> --dry-run
- npm run citations:formal -- --slug=<slug> --write --confirm-citation-write

If you only need compatibility-only source_citations refreshes, review
scripts/prepopulate/prepopulate-source-citations.mjs first.`);
process.exit(1);
