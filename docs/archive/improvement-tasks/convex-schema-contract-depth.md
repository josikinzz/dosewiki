# Convex Schema Contract Depth

## Files

- `convex/schema.ts`
- `convex/lib/validators.ts`
- `src/schema/substance.schema.ts`
- `src/data/schema/`
- `scripts/generate-schema*`
- `scripts/migrate/*`
- `scripts/batch/*`

## Problem

The Convex `substanceIndex` schema intentionally keeps most article sections as `v.any()` and states that frontend Zod validation is the source of truth. Convex write validators add a lighter check, but the authoritative article contract lives outside the Convex schema and must be remembered by every script or mutation that writes article data.

This creates a weak Interface at the most important storage seam. Convex accepts broad shapes, frontend rendering validates later, and scripts can write generated fields without a deep contract at ingestion time. The friction appears whenever article shape or generated fields change: developers must inspect `src/schema/substance.schema.ts`, regenerate schema helpers, update scripts, and rely on runtime behavior across multiple adapters.

## Proposed deepening opportunity

Deepen the article contract by generating or sharing a single substance article contract Module that feeds Convex validators, frontend Zod parsing, generated field registry helpers, and script validation. The Convex storage schema can remain operationally permissive where needed, but the ingestion Interface should run the same contract and return typed validation failures before storage.

This is separate from making every nested Convex field strict. The opportunity is to make the write/read contract deep and testable at the Convex seam, while allowing internal storage flexibility during migrations.

## Benefits

- **Module**: the article contract becomes one Module used by Convex, frontend, and scripts.
- **Interface**: writers and readers depend on one contract rather than a permissive database shape plus separate frontend validation knowledge.
- **Implementation**: generated validators, section defaults, and migration widen/narrow behavior can live behind the contract.
- **Depth**: the Interface is "validate or materialize a SubstanceArticle" while hiding many section-specific rules.
- **Seam**: the contract seam sits before Convex ingestion and before public rendering.
- **Adapter**: Convex validators, Zod parsers, and migration scripts become adapters over the same contract rules.
- **Leverage**: one contract catches invalid batch generation, migration, editor, and production sync writes.
- **Locality**: article-shape changes concentrate in the schema contract workflow and tests.

## Test plan

- Add golden fixtures for valid and invalid substance articles and run them through the shared contract from Convex-facing and frontend-facing adapters.
- Add a test that generated schema helpers stay in sync with `src/schema/substance.schema.ts`.
- Add ingestion tests proving invalid generated fields are rejected or reported before storage.
- Add migration tests for widen-migrate-narrow cases where storage remains permissive temporarily.

## Risk/rollout notes

Do not immediately tighten every field in `convex/schema.ts`; that could block existing production data. Start by adding contract validation to ingestion paths and reporting drift. Once fixtures prove production data conforms, narrow selected Convex fields gradually with explicit migrations.
