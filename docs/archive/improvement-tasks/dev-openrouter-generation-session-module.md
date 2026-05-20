# Dev OpenRouter Generation Session Module

## Title

Deepen OpenRouter generation credentials and model selection behind a generation session Module.

## Status

Proposed

## Files

- `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`
- `src/features/dev/tools/substance-editor/SubstanceEditorApiSection.tsx`
- `src/features/dev/tools/substance-editor/SectionGenerator.tsx`
- `src/features/dev/tools/substance-editor/useSectionGeneration.ts`
- `src/features/dev/tools/substance-editor/types.ts`
- `src/utils/api/openrouter.ts`

## Problem

`SubstanceEditorTab` owns OpenRouter API-key storage, API-key input drafts, validation request cancellation, model preference persistence, model normalization, submit-label derivation, and selected-model display data in the same Module that assembles article source selection and draft editing. The Interface between the generator UI and generation logic is a loose set of values: `apiKey`, `apiKeyInput`, `isKeyValid`, `isValidatingKey`, `selectedModel`, and callbacks.

That makes the generation credential seam shallow. Callers must know that the key lives in `sessionStorage`, the model lives in `localStorage`, short keys skip validation, stale validation responses are ignored through a ref counter, and model IDs are normalized through `resolveOpenRouterModelId`. The deletion test suggests deleting this code from the tab would not remove complexity; it would move the same storage, validation, and label rules into nearby UI Modules.

This is distinct from the batch OpenRouter Adapter task. That task covers script-side model calls and retries; this task covers the interactive `/dev` generation session and its browser storage, validation, and UX state.

## Solution Plan

Create a dev generation session Module with a compact Interface:

- current credential state: saved key present, input draft, validity, validation progress, and submit label
- current model state: selected model id, selected model descriptor, context-window display value, and model change command
- commands: `editApiKey`, `submitApiKey`, `clearApiKey`, `validateApiKey`, and `selectModel`
- Adapters for browser storage and OpenRouter credential validation

`SubstanceEditorTab` should consume the session Module and pass session values to `SubstanceEditorApiSection`, `useSubstanceEditorSourceData`, and `SectionGenerator`. `SubstanceEditorApiSection` remains a rendering Adapter. `useSectionGeneration` should receive a ready generation session view rather than raw key/model facts where practical.

## Benefits

- **Locality**: Credential storage policy, validation race handling, model normalization, and submit-label rules change in one Module instead of in the article generator tab.
- **Leverage**: Any future generation surface, prompt preview, or section generator can reuse the same session Interface without duplicating key/model handling.
- **Testability**: The Interface becomes the test surface. Tests can cover storage restoration, short-key validation skipping, stale validation suppression, model fallback, clear-key behavior, and submit-label derivation with fake storage and validation Adapters.

## Implementation Notes

- Keep `sessionStorage` for the API key and `localStorage` for the model preference unless a separate product/security decision changes that policy.
- Preserve current `validateApiKey` semantics and model fallback behavior from `src/utils/api/openrouter.ts`.
- Use one browser-storage Adapter in tests so the Module can be exercised outside a real browser.
- Avoid widening `SectionGeneratorProps`; first replace the existing raw props with values derived by the session Module.

## Verification

- Add unit or hook tests for the generation session Module using fake storage and fake validation Adapters.
- Add a focused `SubstanceEditorTab` test proving the API section receives the same labels, validity states, and selected model descriptor as before.
- Run `npm run test -- src/features/dev/tools/substance-editor` and `npm run typecheck`.
