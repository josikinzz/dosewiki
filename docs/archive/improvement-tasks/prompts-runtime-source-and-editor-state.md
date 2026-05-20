# Prompts Runtime Source And Editor State

## Files

- `src/data/config/generatorPrompt.ts`
- `src/data/config/generatorPrompt.md`
- `src/hooks/usePrompts.ts`
- `src/features/dev/context/DevModeContext.tsx`
- `src/features/dev/context/useDevPromptState.ts`
- `src/features/dev/pages/useDevModeChangelogState.ts`
- `src/features/dev/pages/useDevModeSaveOperations.ts`
- `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`
- `src/features/dev/tools/substance-editor/PromptEditorModal.tsx`
- `src/app/api/save-prompt/route.ts`
- `convex/prompts.ts`

## Problem

Prompt runtime source is split. Section prompts are loaded and saved through Convex via `useSectionPrompt`, while the generator prompt still enters dev state through `src/data/config/generatorPrompt.ts`, which imports local markdown. `useGeneratorPrompt()` exists, but the `/dev` provider uses the local markdown import and the legacy generator prompt diff/save path remains threaded through page state even though section generation now edits individual Convex prompts.

The result is a shallow prompt-editing Interface. Callers must know which prompt kind is Convex-backed, which prompt is local markdown-backed, which save path is immediate through `/api/save-prompt`, and which legacy prompt diff participates in the GitHub save flow. Prompt state, dirty tracking, attribution, and reload behavior are implemented separately in `useDevPromptState`, `usePrompts`, and `PromptEditorModal`.

## Proposed deepening opportunity

Create a prompt workspace Module for dev editing. Its Interface should expose a prompt document by descriptor: current content, original content, dirty state, save status, attribution, reset, reload, preview payload, and save command. The Implementation should choose the right Adapter for Convex runtime prompts and local seed prompts, but dev components should not know whether a prompt is a section prompt or generator prompt.

Then move both generator and section prompt editing behind this workspace seam. The legacy generator prompt state in `DevModeContext` can become an Adapter or be deleted once the generator prompt is loaded through the same prompt workspace. `PromptEditorModal` and any future generator prompt editor should share the same Module for dirty tracking and save lifecycle.

## Benefits

- **Module**: prompt editing becomes one prompt workspace Module instead of hook-local state and page-level legacy state.
- **Interface**: UI callers receive prompt document state and commands without knowing storage source or prompt kind.
- **Implementation**: dirty tracking, reset, save lifecycle, attribution, and reload behavior are concentrated.
- **Depth**: the workspace Interface is small but covers substantial behavior across Convex and local seed prompts.
- **Seam**: storage selection becomes an explicit seam between prompt UI and prompt persistence.
- **Adapter**: Convex prompt documents and local markdown seed prompts become concrete Adapters.
- **Leverage**: generator prompts, section prompts, and future prompt kinds can reuse the same editor and save lifecycle.
- **Locality**: prompt source-of-truth changes stay local to the workspace and storage Adapters instead of spreading through dev page state.

## Test plan

- Add prompt workspace tests for load, dirty tracking, reset, save success, save failure, missing prompt, and reload-after-save.
- Add Adapter tests for Convex-backed prompts using fake fetch/query functions.
- Add tests proving generator and section prompts use the same dirty-state semantics.
- Keep UI tests focused on rendering save/dirty/loading states rather than re-testing prompt persistence rules.
- Add a regression test that `updatedBy` passed from UI is either intentionally derived server-side or surfaced consistently in workspace state after save.

## Risk/rollout notes

Roll out behind the existing UI. First wrap `useSectionPrompt` behavior in the workspace without changing storage. Then move the generator prompt to the same Interface. Remove the legacy GitHub generator-prompt path only after confirming whether generator prompt edits should be source-controlled seed changes, Convex runtime changes, or both.
