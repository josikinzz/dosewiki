# Batch Deepen Run Orchestration

## Files

- `scripts/batch/lib/generator-runner.mjs`
- `scripts/batch/batch-generate-dosage-duration.mjs`
- `scripts/batch/batch-generate-harm-potential.mjs`
- `scripts/batch/batch-generate-history-culture.mjs`
- `scripts/batch/batch-generate-legality.mjs`
- `scripts/batch/batch-generate-summary.mjs`
- `scripts/batch/*/persist.mjs`
- `lib/batchGeneratorRunner.test.ts`
- `lib/summaryBatch.test.ts`

## Problem

The shared runner module currently covers banner, summary, help, and fatal handling, but the deeper run lifecycle still lives in each generator. Environment validation, selected-article progress, dry-run behavior, per-batch concurrency, counters, token aggregation, failed item shape, stdout progress, and completion status are repeated across `dosage-duration`, `harm-potential`, `history-culture`, `legality`, `extract-quotes`, and `summary`.

This makes the run lifecycle a shallow module: callers still need to understand and reimplement most of the interface. The summary workflow has a richer implementation with progress snapshots and JSONL results, while older generators use local ad hoc counters and stdout updates. Bugs in run accounting or dry-run behavior have poor locality because the same behavior must be audited section by section.

## Proposed deepening opportunity

Deepen `scripts/batch/lib/generator-runner.mjs` into a batch run lifecycle module. Its interface should let each generator provide section-specific adapters for selection, per-item processing, dry-run availability checks, and persistence, while the implementation owns concurrency windows, result normalization, counters, progress events, token aggregation, fatal progress updates, stdout progress, and summary output.

Apply the deletion test: deleting the current runner only removes formatting and a small wrapper. Deleting a deepened runner should force the whole lifecycle complexity back into every generator, which is the leverage the module should earn.

## Benefits using skill vocabulary

- Higher Depth: section generators expose a smaller interface and get batch lifecycle behavior behind it.
- Better Locality: run accounting, progress status, and fatal handling change in one module instead of across every generator.
- Clearer Seam: per-section adapters become the place where substance-specific behavior changes without editing orchestration.
- More Leverage: new source generation workflows can reuse concurrency, dry-run, progress, and summary semantics without copying a persist module.
- Stronger test surface: the interface is the test surface, so lifecycle tests can move from scattered section tests into focused runner tests.

## Test plan

- Expand `lib/batchGeneratorRunner.test.ts` with success, skipped, dry-run, failed, persist-failed, token aggregation, and fatal-progress cases.
- Add adapter fixture tests that prove ordering, concurrency chunking, and failed item formatting are stable.
- Keep existing section tests for section-specific parsing and prompt construction.
- Run `npm run test -- lib/batchGeneratorRunner.test.ts lib/summaryBatch.test.ts lib/batchGenerateDosageDuration.test.ts lib/batchGenerateHarmPotential.test.ts lib/batchGenerateHistoryCulture.test.ts lib/batchGenerateLegality.test.ts`.

## Risk/rollout notes

Roll out one generator at a time, starting with the most summary-like workflow or a low-risk local-file workflow. Preserve current CLI output shape during migration because operators may rely on progress text. Keep old persist functions callable until their generator has parity tests for dry run, skipped items, failed items, token counts, and successful update collection.
