# Dev Save Operation Contract

## Title

Deepen save operations behind a single Dev save command contract.

## Files

- `src/features/dev/pages/useDevModeSaveOperations.ts`
- `src/features/dev/pages/useDevModeSaveActions.tsx`
- `src/features/dev/pages/devModePageUtils.ts`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-to-convex/saveToConvexUtils.ts`
- `src/app/api/save-prompt/route.ts`
- `src/app/api/save-quote/route.ts`

## Problem

The `/dev` save flow has two public operations, GitHub and Convex, but the current Module leaks nearly every detail of both into its Interface. `UseDevModeSaveOperationsArgs` in `src/features/dev/pages/useDevModeSaveOperations.ts:21` takes articles, original-article accessors, About fields, prompt flags, changelog fragments, server health, credentials, notice setters, tab navigation, changelog appenders, and mutation hooks indirectly.

The Implementation then builds payloads, chooses save destinations, formats notices, derives submitter keys, normalizes changelog entries, moves tabs, and mutates local saved state. This makes the save seam shallow: adding another save target or changing what counts as a saveable draft requires editing a wide React hook Interface and threading more arguments through `useDevModeSaveActions`.

## Proposed deepening opportunity

Introduce a Dev save command Module that treats "save the current editor draft" as the Interface:

- Define a `DevSaveDraft` value that already contains article changes, About changes, prompt changes, index changes, changelog markdown, and submitter/session metadata.
- Define destination Adapters such as `convexSaveAdapter` and `githubSaveAdapter` with a shared command Interface: validate availability, build payload, execute mutation, normalize result, and report post-save effects.
- Let `useDevModeSaveOperations` become a UI Adapter that maps command lifecycle states to notices and buttons rather than building every payload inline.
- Move common result concepts into a typed save result: saved items, warnings, changelog entry, revalidation/debug metadata, and whether local changes should be marked saved.

## Benefits

- **Module**: Creates a deep save command Module instead of a wide hook-shaped Module.
- **Interface**: Shrinks the save Interface from dozens of props to a draft snapshot plus destination command.
- **Implementation**: Moves payload building, destination-specific mutation calls, and result normalization behind destination Implementations.
- **Depth**: Increases Depth because callers request a save and receive a structured result without knowing destination-specific details.
- **Seam**: The destination seam becomes real once GitHub and Convex are peer Adapters behind the same Interface.
- **Adapter**: GitHub and Convex become explicit Adapters instead of branches embedded in one hook.
- **Leverage**: A new save target, dry-run mode, or retry policy can reuse the command lifecycle without expanding page-controller arguments.
- **Locality**: Save contract changes stay local to the save command Module and the affected Adapter.

## Test plan

- Add unit tests for building `DevSaveDraft` from changelog state, articles, About fields, prompt changes, and index data.
- Add Adapter tests for Convex and GitHub using fake mutation functions, covering no-op saves, warning saves, successful saves, credential failures, and changelog normalization.
- Keep existing `useDevModeSaveOperations` tests focused on UI lifecycle mapping: notice state, disabled state, tab navigation, and mark-saved behavior.
- Add route utility tests, where needed, to ensure `save-to-convex` request/response payloads still satisfy the command result contract.

## Risk/rollout notes

The main risk is changing save semantics while moving code. Keep the initial command contract behavior-preserving: same payloads, same notices, same mark-saved rules, and same changelog behavior. Introduce the shared Interface first, then migrate Convex and GitHub one Adapter at a time.
