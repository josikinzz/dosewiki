#!/usr/bin/env node
console.error(`scripts/migrate/migrate-citations-convex.mjs is retired.

This migration only rewrites legacy citations/source_citations arrays in Convex
and is incompatible with structured references plus dosage/duration
reference_ids.

Use:
- npm run citations:formal -- --slug=<slug> --dry-run
- npm run citations:formal -- --slug=<slug> --write --confirm-citation-write`);
process.exit(1);
