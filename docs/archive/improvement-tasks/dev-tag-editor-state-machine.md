# Dev Tag Editor State Machine

## Title

Replace scattered tag editor state with a tag editing state machine Module.

## Files

- `src/features/dev/tags/TagEditorTab.tsx`
- `src/features/dev/tags/TagMutationForms.tsx`
- `src/features/dev/tags/TagListPanel.tsx`
- `src/features/dev/tags/TagDetailPanel.tsx`
- `src/features/dev/tags/types.ts`
- `src/utils/data/tagRegistry.ts`
- `src/features/dev/context/DevModeContext.tsx`

## Problem

`TagEditorTab` keeps the tag editor's selection, active field, search query, rename draft, move draft, delete confirmation, notices, applying state, and registry refresh counter as separate React states. Selection synchronization is distributed across effects and event handlers from `src/features/dev/tags/TagEditorTab.tsx:45` through the mutation handlers around `src/features/dev/tags/TagEditorTab.tsx:134`.

The mutation rules themselves are already in `tagRegistry`, but the editor workflow rules are not behind a deep Module. For example, selecting a tag, switching fields, moving a tag, deleting a tag, and refreshing a registry each reset overlapping bits of state by hand. That creates weak Locality for bugs where the selected tag no longer matches the active field or form drafts lag behind the registry.

## Proposed deepening opportunity

Create a `tagEditorStateMachine` Module with a reducer-style Interface:

- State: active field, selected tag, search query, rename draft, move draft, delete confirmation, notice, applying flag, and registry snapshot.
- Events: `fieldSelected`, `tagSelected`, `renameDraftChanged`, `moveDraftChanged`, `deleteConfirmationChanged`, `renameSubmitted`, `moveSubmitted`, `deleteSubmitted`, `articlesChanged`, and `snapshotRefreshed`.
- Effects: article replacement, copy/download diff notices, and registry rebuild requests handled by small Adapters.

Keep `applyTagMutation`, `buildTagRegistry`, and `summarizeMutation` as data Modules, but route user workflow through the state machine so one Implementation owns all transitions.

## Benefits

- **Module**: Establishes the tag editor workflow as its own Module instead of distributing it through component state.
- **Interface**: Replaces many setters with event commands that encode valid user actions.
- **Implementation**: Centralizes selection repair, draft reset, notice setting, and mutation result handling.
- **Depth**: Adds Depth because UI children only dispatch events and render state, while transition complexity is hidden.
- **Seam**: Creates a seam between pure tag data mutations and editor workflow transitions.
- **Adapter**: `replaceArticles`, clipboard, and download behavior become Adapters invoked by effects rather than embedded in the state transitions.
- **Leverage**: Future operations such as merge tags, preview before apply, or undo can reuse the same transition model.
- **Locality**: State consistency bugs stay local to the reducer/state-machine tests.

## Test plan

- Add reducer tests for initial selection, empty fields, field switching, search filtering, rename success/failure, move with/without source copy, delete confirmation, and articles refresh.
- Add tests that invalid transitions do not mutate articles and produce the expected notice.
- Keep `tagRegistry` tests focused on pure data changes, separate from workflow tests.
- Add a light component test for `TagEditorTab` that verifies it renders state-machine output and dispatches expected events.

## Risk/rollout notes

The tag editor applies changes immediately to in-memory articles, so preserve current mutation semantics and notices during the first extraction. Keep `tagRegistry` unchanged initially; only deepen the UI workflow seam around it.
