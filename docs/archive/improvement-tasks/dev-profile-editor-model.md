# Dev Profile Editor Model

## Title

Move contributor profile editing into a dedicated profile editor model.

## Files

- `src/features/dev/profile/ProfileEditorTab.tsx`
- `src/features/dev/profile/AvatarUpload.tsx`
- `src/features/dev/profile/BioEditor.tsx`
- `src/features/dev/profile/LinkManager.tsx`
- `src/features/dev/profile/types.ts`
- `src/features/dev/profile/utils.tsx`
- `src/app/api/save-user-profile/route.ts`

## Problem

`ProfileEditorTab` mixes profile form state, dirty tracking, link validation, avatar file validation, object URL lifecycle, base64 conversion, credential verification, mutation payload construction, API result normalization, and presentation. The pressure point starts at `src/features/dev/profile/ProfileEditorTab.tsx:33`, where local state and derived values are doing the work of a profile editor model, and continues through `handleSave` at `src/features/dev/profile/ProfileEditorTab.tsx:213`.

The current Interface is a React component prop set, but the Implementation contains business rules that should be testable without a DOM: what counts as dirty, when a profile is valid, how avatar removal differs from avatar upload, and how an API response becomes the next profile. The deletion test shows the component is shallow as a behavior Module: deleting it would scatter profile editing rules into child components or tests rather than preserve them behind a smaller Interface.

## Proposed deepening opportunity

Create a `useProfileEditorModel` Module and supporting pure Modules:

- `profileFormModel` for normalized form state, dirty checks, link validation, bio limits, avatar URL removal semantics, and updated-profile normalization.
- `avatarUploadModel` for file validation, preview source, object URL lifecycle, and `File` to upload payload conversion behind a browser-file Adapter.
- `profileSaveAdapter` for verifying credentials and invoking the save mutation.

`ProfileEditorTab` should become a rendering Adapter for this model: it passes model state to `AvatarUpload`, `BioEditor`, and `LinkManager`, and dispatches commands such as `changeDisplayName`, `selectAvatarFile`, `removeAvatar`, `save`, and `reset`.

## Benefits

- **Module**: Turns profile editing into a deep Module with a domain Interface instead of a presentation component carrying the full Implementation.
- **Interface**: Exposes commands and derived state rather than raw `setForm`, `FileReader`, and mutation details.
- **Implementation**: Concentrates normalization, validation, avatar preparation, and save-result handling in testable Implementations.
- **Depth**: Raises Depth by hiding browser file handling and save payload rules behind a compact editor model Interface.
- **Seam**: Creates seams for file reading, URL preview creation, credential verification, and profile saving.
- **Adapter**: Browser APIs and the API mutation become Adapters, making node-based tests possible.
- **Leverage**: The same model can support future profile previews, autosave warnings, or profile history display without expanding component state.
- **Locality**: Profile rule changes stay in the model instead of being split between the tab, utils, and route assumptions.

## Test plan

- Add pure tests for profile normalization, dirty checks, partial links, bio length limits, avatar removal payloads, and updated-profile construction.
- Add tests for avatar upload model behavior using fake file-reader and object-url Adapters.
- Add hook tests for `useProfileEditorModel` covering reset, file selection, validation failures, successful save, unchanged save, and mutation errors.
- Keep `save-user-profile` route tests focused on authentication, self-profile ownership errors, payload parsing, avatar size/type validation, and Convex mutation arguments.

## Risk/rollout notes

Avatar handling is user-visible and easy to regress. Preserve the current 2 MiB and MIME-type rules during extraction, and keep the route as the final authority. Roll out by moving pure form rules first, then file handling, then save orchestration.
