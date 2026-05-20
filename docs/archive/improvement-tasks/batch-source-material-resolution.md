# Batch Source Material Resolution

## Files

- `scripts/batch/summary/source-material.mjs`
- `scripts/batch/dosage-duration/loader.mjs`
- `scripts/batch/harm-potential/loader.mjs`
- `scripts/batch/history-culture/loader.mjs`
- `scripts/batch/legality/loader.mjs`
- `scripts/batch/extract-quotes/loader.mjs`
- `scripts/batch/extract-quotes/formatter.mjs`
- `scripts/batch/*/lib.mjs`
- `lib/summaryBatch.test.ts`
- `lib/batchGenerateDosageDuration.test.ts`
- `lib/batchGenerateHarmPotential.test.ts`
- `lib/batchGenerateHistoryCulture.test.ts`
- `lib/batchGenerateLegality.test.ts`
- `lib/batchExtractQuotes.test.ts`

## Problem

Source generation workflows each decide source availability, quote loading, fallback material, source truncation, dry-run status, and prompt context construction in their own modules. Summary has a deeper source-material resolver that can choose summary quotes or generic article sources. Other section generators mostly bind themselves to one quote source and repeat availability checks in both dry-run and live processing.

The result is weak locality around a core domain concept: source material. Understanding why a substance will be processed requires reading entrypoint selection, loader functions, dry-run branches, and process functions. The current modules leak source material decisions across their seams.

## Proposed deepening opportunity

Introduce a source material resolver module with section-specific adapters for quote sections, generic source fallbacks, local source files, prompt context builders, and truncation policy. The resolver should return a normalized result such as ready, skipped, or would-skip with a material type, reason, and user message.

The summary resolver is a good starting point, but it should become a shared module rather than summary-owned code. Section modules would keep their domain prompt context rules, while the resolver owns availability, precedence, dry-run parity, and fallback semantics.

## Benefits using skill vocabulary

- Higher Depth: source availability and user-message readiness sit behind one interface.
- Better Locality: fallback rules and skip reasons change in one implementation.
- Clear Seam: quote stores, Convex articleSources, and local parsed source files become adapters at the source material seam.
- More Leverage: future generators can add a source adapter instead of copying loader and dry-run logic.
- Better test surface: source selection, empty quote handling, and fallback behavior can be tested once with adapter fixtures.

## Test plan

- Add resolver tests for quote-preferred, generic fallback, empty quote, missing source doc, local file source, no sources in file, and truncation.
- Preserve section-specific tests for prompt context details, especially excluded fields such as `history_culture`, `legality`, `bioavailability`, and `half_life`.
- Add dry-run parity tests proving dry-run and live processing classify the same substance the same way.
- Run `npm run test -- lib/summaryBatch.test.ts lib/batchExtractQuotes.test.ts lib/batchGenerateDosageDuration.test.ts lib/batchGenerateHarmPotential.test.ts lib/batchGenerateHistoryCulture.test.ts lib/batchGenerateLegality.test.ts`.

## Risk/rollout notes

Source precedence affects generated content quality, so migrate conservatively. Start by extracting behavior without changing current precedence: for summary, keep no fallback when a summary quote doc exists but is empty; for other sections, keep their current quote requirements. Add explicit rollout notes before changing fallback behavior.
