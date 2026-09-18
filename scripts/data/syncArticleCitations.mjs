#!/usr/bin/env node
console.error(`scripts/data/syncArticleCitations.mjs is retired.

This utility only syncs legacy top-level citations arrays and does not understand
structured references or route-level reference_ids. Running it after the
formal-citations migration can regress the references-era contract.

Use:
- npm run citations:formal -- --slug=<slug> --dry-run
- npm run citations:formal -- --slug=<slug> --write --confirm-citation-write

If you need compatibility-only source_citations refreshes, review
scripts/prepopulate/prepopulate-source-citations.mjs instead.`);
process.exit(1);
