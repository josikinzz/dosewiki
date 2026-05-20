# OpenRouter Request Policy Module

## Status

Proposed

## Files

- `src/utils/api/openrouter.ts`
- `src/utils/api/openrouter.test.ts`
- `scripts/lib/openrouter-sdk.mjs`
- `scripts/batch/*/openrouter.mjs`
- `scripts/batch/summary/config.mjs`
- `scripts/batch/*/cli.mjs`

## Problem

OpenRouter request policy is duplicated across the browser/app generation Module and the script SDK Module. Both Implementations know model IDs, reasoning request shapes, Claude explicit-reasoning detection, reasoning budget mapping, structured-content extraction, usage normalization, app title/referer configuration, and user-facing error messages. They are similar enough to drift but different enough that callers cannot tell which Interface is authoritative.

This is separate from the batch OpenRouter Adapter seam. The existing batch Adapter task would deepen retry, empty-content diagnostics, debug artifacts, and per-generator call behavior. The lower-level problem here is that request construction and response normalization policy lives in two Modules before any batch-specific Adapter is involved. For example, `src/utils/api/openrouter.ts` owns model resolution and legacy model aliases, while `scripts/lib/openrouter-sdk.mjs` accepts raw model strings and duplicates reasoning policy. Batch config can therefore carry stale model IDs even when the app Module has a canonical replacement.

The current shape is shallow: deleting either Implementation would reveal that the same OpenRouter request contract must be re-created in callers or in the other runtime. The Interface includes too much hidden provider knowledge for every Adapter to safely repeat.

## Solution Plan

Create a shared OpenRouter request policy Module that exposes a small Interface for:

- resolving canonical model IDs and legacy aliases
- listing supported model descriptors for UI and script validation
- building chat request policy for streaming and non-streaming Adapters
- mapping reasoning effort to provider-specific request fields
- normalizing structured content, reasoning text, finish reason, and usage
- normalizing OpenRouter errors into retryable/operator-facing outcomes

Keep runtime-specific Adapters thin. `src/utils/api/openrouter.ts` should remain the browser/app streaming Adapter, and `scripts/lib/openrouter-sdk.mjs` should remain the script non-streaming Adapter. Both should request policy decisions from the shared Module instead of duplicating provider rules.

The shared Module should not own batch retry, debug artifact writes, or section generator behavior. Those stay behind the batch OpenRouter Adapter seam described in `batch-openrouter-adapter-seam.md`.

## Benefits

- **Locality**: provider-specific model, reasoning, response, and error policy changes happen in one Implementation instead of being audited in TypeScript and MJS copies.
- **Leverage**: app generation, batch generation, quote extraction, and future OpenRouter callers all get model alias fixes and provider request updates through the same Interface.
- **Testability**: the request policy Interface becomes the test surface, with fixture tests for model aliases, Claude reasoning shapes, structured content variants, reasoning detail extraction, usage defaults, and retryable error classification.

## Implementation Notes

- Prefer a TypeScript source Module with a script-consumable compiled or plain-JS Adapter only if the repo already has a comfortable build path for scripts. If that adds friction, start with a small ESM policy Module that both runtimes can import.
- Preserve current app streaming behavior and script non-streaming behavior during the first pass. The first milestone should be parity, not behavior change.
- Include model alias handling for script configs before changing default model strings in batch configs.
- Keep app-title selection in runtime Adapters unless a shared descriptor is needed; app title is an Adapter concern, while model/reasoning/error policy is the shared Module.
- Treat OpenRouter SDK request field casing as an Adapter responsibility when necessary. The policy Module can return a normalized request intent that each Adapter maps to SDK-specific field names.

## Verification

- Add shared policy tests for canonical model resolution, legacy model aliasing, supported-model descriptors, Claude explicit-reasoning detection, reasoning budget mapping, structured content extraction, reasoning detail extraction, usage normalization, and error normalization.
- Update `src/utils/api/openrouter.test.ts` so app request-body tests consume the shared policy expectations.
- Add script-side tests for `scripts/lib/openrouter-sdk.mjs` proving non-streaming requests use the same model and reasoning policy without making network calls.
- Run `npm run test -- src/utils/api/openrouter.test.ts` plus the new workflow/script tests once script tests are wired.
