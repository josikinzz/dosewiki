# Batch Persistence And Artifacts

## Files

- `scripts/batch/summary/run-artifacts.mjs`
- `scripts/batch/summary/pipeline.mjs`
- `scripts/batch/summary/articles.mjs`
- `scripts/batch/dosage-duration/persist.mjs`
- `scripts/batch/harm-potential/persist.mjs`
- `scripts/batch/history-culture/persist.mjs`
- `scripts/batch/legality/persist.mjs`
- `scripts/batch/*/loader.mjs`
- `scripts/convex/sync-convex-to-production.mjs`
- `lib/summaryBatch.test.ts`
- `lib/batchGenerateDosageDuration.test.ts`

## Problem

Persistence behavior is split by generator. Some workflows mutate `src/data/SubstanceIndex.json` and then sync successful updates to Convex; summary reads source and target Convex deployments and writes backups/results under `notes-and-plans/exports/batch`; dosage-duration saves local JSON after every successful batch and syncs at the end; harm, history, and legality apply updates after processing. Backup format, progress artifacts, result logs, fatal status, and target deployment handling are not shared.

This conflicts with the repo source-of-truth note that Convex is authoritative for live runtime data. The architecture makes it too easy for a workflow to treat local JSON as the primary write surface or to produce weaker artifacts than another workflow. Persistence is a shallow seam because callers know whether to write JSON, when to sync Convex, how to sanitize keys, and how to represent backups.

## Proposed deepening opportunity

Create a batch persistence and artifact module that owns target selection, backup creation, progress snapshots, result JSONL, debug artifact paths, sanitized Convex writes, local export writes when explicitly requested, and successful-update application. Generators should provide an adapter that maps a generated section result onto an article document.

This module should make Convex write intent explicit: source deployment, target deployment, local backup/export path, and whether local JSON should be updated as a derived artifact. The interface should distinguish live persistence from dry-run artifact creation.

## Benefits using skill vocabulary

- Higher Depth: persistence, backup, and artifact behavior sit behind one interface.
- Better Locality: source-of-truth rules and Convex write semantics are concentrated in one implementation.
- Clear Adapter role: each generator supplies only the section update adapter.
- More Leverage: all workflows gain summary-grade backups, progress files, results JSONL, and fatal state handling.
- Safer test surface: persistence can be tested with fake target adapters instead of invoking section process loops.

## Test plan

- Add tests for backup document shape, progress lifecycle, JSONL result append, fatal status update, sanitized Convex mutation payloads, and local export opt-in behavior.
- Add adapter tests for section update application: summary, dosage/duration, harm_potential, history_culture, and legality.
- Add regression tests that dry-run never writes Convex or local JSON but can create read-only selection artifacts if configured.
- Run `npm run test -- lib/summaryBatch.test.ts lib/batchGenerateDosageDuration.test.ts lib/batchGenerateHarmPotential.test.ts lib/batchGenerateHistoryCulture.test.ts lib/batchGenerateLegality.test.ts`.

## Risk/rollout notes

This is the highest-risk task because it touches write paths. Start with artifact-only extraction, then Convex persistence for one generator, then local JSON export behavior. Keep existing backup files during migration. Require an explicit operator-visible mode for any local JSON update so the Convex source-of-truth rule remains clear.
