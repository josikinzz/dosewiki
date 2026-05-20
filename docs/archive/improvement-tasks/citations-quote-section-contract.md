# Quote Section Contract

## Files

- `convex/quotes.ts`
- `convex/schema.ts`
- `src/app/api/save-quote/route.ts`
- `scripts/batch/extract-quotes/categories.mjs`
- `scripts/batch/extract-quotes/formatter.mjs`
- `scripts/batch/extract-quotes/runner.mjs`
- `scripts/batch/batch-extract-quotes.mjs`
- `scripts/batch/batch-extract-harm-quotes.mjs`
- `scripts/migrate/migrate-quotes-to-convex.mjs`
- `scripts/convex/sync-convex-to-production.mjs`
- `src/features/dev/tools/substance-editor/PromptEditorModal.tsx`
- `src/features/dev/tools/substance-editor/SubstanceEditorSourcesSection.tsx`

## Problem

Quote identity is represented as free-form `section` strings across Convex, the save-quote route, batch extraction categories, generation loaders, local quote file paths, migration scripts, and editor availability UI. `convex/quotes.ts` stores any section string, while `getAvailabilityBySlug` hard-codes one section list and `scripts/batch/extract-quotes/categories.mjs` defines another category list with hyphenated names and output file suffixes.

The result is a shallow quote Interface: callers must know which section string to send, whether that section is stored in Convex or local files, what output directory and suffix belong to it, whether it participates in availability, and which prompt/extraction category produces it. The save-quote API validates shape but not section identity, so typos can create valid quote documents that no downstream generator reads.

## Proposed Deepening Opportunity

Create a quote section contract Module that owns canonical section IDs, legacy aliases, display labels, prompt keys, extraction categories, storage mode, output path metadata, and availability participation. Convex mutations and Next route handlers should validate through this Module before writing. Batch extraction, migration, sync, and editor availability should ask the same Interface for section descriptors instead of carrying their own string lists.

The Module should expose Adapters for Convex-backed quote documents and local-file quote artifacts so current mixed storage can remain explicit while generators migrate.

## Benefits

- **Module**: quote section identity becomes a Module rather than repeated strings and per-script config.
- **Interface**: callers resolve and validate a quote section through one descriptor Interface.
- **Implementation**: aliases, output paths, prompt names, availability rules, and storage mode are local.
- **Depth**: one section descriptor gives leverage across extraction, save-quote, Convex queries, migrations, sync, and editor UI.
- **Seam**: quote persistence becomes a seam with Convex and local-file Adapters.
- **Adapter**: existing local quote directories and Convex `quotes` rows can both satisfy the quote store Interface during migration.
- **Leverage**: adding a new quote-backed generation section becomes descriptor work instead of edits across scripts, UI, and Convex functions.
- **Locality**: section-name drift and unread quote documents are prevented at the contract Module.

## Test Plan

- Add contract tests for canonical section IDs, legacy aliases such as hyphenated extraction categories, prompt keys, output suffixes, and availability membership.
- Add save-quote route tests for unknown section rejection and known alias normalization.
- Add Convex mutation tests or fixtures proving `quotes.save` cannot create a document with an unknown canonical section.
- Add batch extraction tests that category config comes from the quote section contract and still formats current output paths.
- Add migration tests mapping legacy quote directories to canonical Convex sections.

## Risk/Rollout Notes

- Start with read-through compatibility: normalize aliases on write but continue reading existing canonical section values.
- Audit existing `quotes` rows before enforcing strict validation in Convex, and provide a dry-run repair script if unknown sections exist.
- Keep local-file Adapters until dosage-duration and any remaining file-backed workflows have moved to Convex or are intentionally documented.
