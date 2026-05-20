# Batch OpenRouter Adapter Seam

## Files

- `scripts/lib/openrouter-sdk.mjs`
- `scripts/batch/*/openrouter.mjs`
- `scripts/batch/summary/pipeline.mjs`
- `scripts/batch/pharmacology/openrouter.mjs`
- `scripts/batch/extract-quotes/openrouter.mjs`
- `src/utils/api/openrouter.ts`
- `src/utils/api/openrouter.test.ts`

## Problem

The SDK wrapper centralizes request construction and error normalization, but each batch workflow still defines its own `callOpenRouter` and `callWithRetry`. Retry delay, logging, app titles, reasoning behavior, empty-content handling, debug artifacts, and fallback behavior are repeated or inconsistent.

The summary and pharmacology workflows already need richer behavior: debug artifacts for empty content, reasoning configuration, and in pharmacology a retry without reasoning when the model consumes its answer budget. Other workflows silently lack those behaviors. The OpenRouter module is currently a useful helper, but not a deep adapter seam for source generation calls.

## Proposed deepening opportunity

Create a batch OpenRouter adapter module that owns retry policy, app-title construction, model config, reasoning config, empty-content handling, debug artifact hooks, and normalized call results. Section modules should provide only their section name, prompt, user message, and optional policy overrides.

This would make `scripts/lib/openrouter-sdk.mjs` the low-level SDK adapter and a new batch-facing module the source generation adapter. Two adapters already exist conceptually: batch scripts and app/API usage. That makes this a real seam, not a hypothetical seam.

## Benefits using skill vocabulary

- Higher Depth: callers stop knowing retry loops, retryable error details, and OpenRouter response edge cases.
- Better Locality: changes to reasoning policy, model-specific request shape, or debug artifacts live in one implementation.
- Clear Adapter role: each workflow configures the adapter instead of duplicating the OpenRouter interface.
- More Leverage: empty-content diagnostics and retry semantics improve all batch generators at once.
- Smaller test surface: tests can assert normalized adapter outcomes without stubbing every section-specific wrapper.

## Test plan

- Add tests for retryable and non-retryable errors, exponential delay calculation with injectable sleep, and max-attempt exhaustion.
- Add tests for empty-content debug artifact calls and pharmacology-style disable-reasoning fallback as a policy option.
- Add tests that section app titles and model/reasoning options are passed through exactly.
- Run `npm run test -- src/utils/api/openrouter.test.ts` plus new batch adapter tests.

## Risk/rollout notes

Keep `callOpenRouterChat` stable while introducing the batch adapter. Migrate one section wrapper at a time and preserve existing app titles for OpenRouter analytics. Treat reasoning fallback as opt-in per workflow until there is confidence it does not alter output quality or cost unexpectedly.
