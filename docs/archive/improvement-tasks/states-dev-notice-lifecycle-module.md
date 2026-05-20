# States: Dev Notice Lifecycle Module

## Files

- `src/features/dev/pages/useDevModeSaveNotices.ts`
- `src/features/dev/pages/useDevModeSaveOperations.ts`
- `src/features/dev/pages/useDevModeSaveActions.tsx`
- `src/features/dev/pages/useDevModeChangeLog.ts`
- `src/features/dev/profile/ProfileEditorTab.tsx`
- `src/features/dev/profile/types.ts`
- `src/features/dev/tags/TagEditorTab.tsx`
- `src/features/dev/tags/types.ts`
- `src/features/dev/tools/index-layout/useLayoutEditor.ts`
- `src/features/dev/tools/index-layout/LayoutToolbar.tsx`
- `src/features/dev/tools/substance-editor/useSubstanceEditorDraftController.ts`
- `src/features/dev/tools/substance-editor/SectionGenerator.tsx`

## Problem

Dev notices and transient operation states are implemented separately in each tool. Save notices have channel-specific timeout handling, changelog notices have their own timeout handling, profile editing has a local `ChangeNotice` type and multi-step pending messages, tag editing has a separate `Notice` type without pending support, index layout stores a plain success string, and section generation exposes local error text.

This creates a shallow state Module pattern: every tool owns a small Interface, but the Implementation repeats lifecycle concerns such as pending, success, error, auto-clear timing, replacing stale messages, and rendering tone/icon choices. The current dev save operation task covers the save command contract; it does not cover notice lifecycle as a shared editor state concern across save, profile, tags, index layout, changelog, and generation tools.

## Proposed deepening opportunity

Create a Dev notice lifecycle Module with a compact Interface for editor operation feedback. The Interface should support channels, severity, pending/success/error status, optional operation ids, auto-clear policy, sticky errors, and structured metadata for debug details. Tool-specific Adapters can publish notice events such as `profile.avatar.ready`, `tags.mutation.failed`, `indexLayout.saved`, `save.convex.pending`, and `generation.apply.failed`.

Move timeout ownership, stale-operation suppression, notice replacement, and rendering props behind the Module. Existing tools should consume a `useDevNoticeChannel` or equivalent Adapter rather than each defining local notice types and clearing behavior.

## Benefits

- **Module**: Creates one editor notice lifecycle Module instead of many local notice mini-modules.
- **Interface**: Gives tools a small event-oriented Interface for publishing operation feedback.
- **Implementation**: Centralizes timers, severity mapping, pending-to-result transitions, sticky errors, and render props.
- **Depth**: Increases Depth because callers publish domain events without reimplementing notice lifecycle mechanics.
- **Seam**: Provides a Seam between dev tool operations and UI feedback behavior.
- **Adapter**: Profile, tag editor, save actions, changelog, index layout, and section generation become Adapters that emit notice events.
- **Leverage**: Accessibility changes, timeout policy, icon/tone changes, and debug metadata handling apply across all dev tools.
- **Locality**: Notice bugs and stale-message regressions can be fixed in one lifecycle Implementation.

## Test plan

- Add reducer or hook tests for notice channel lifecycle: publish pending, replace with success, replace with error, auto-clear success, keep sticky error, and ignore stale operation completions.
- Add Adapter tests for profile save, tag mutation, index layout save, Convex/GitHub save, and section generation error events.
- Add rendering tests for alert variants, pending icons, aria live behavior, and clear behavior.
- Run `npm run typecheck` and targeted dev feature tests.

## Risk/rollout notes

Roll out one tool at a time, starting with a passive compatibility Adapter that can render existing notice values through the new lifecycle Module. Preserve current message text and clear timing initially so behavior changes are not mixed with the architectural move.
