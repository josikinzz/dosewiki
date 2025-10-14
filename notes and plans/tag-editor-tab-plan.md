# Tag Editor Tab Implementation Plan

## Goals
- Add a dedicated **Tag Editor** tab to the developer tools surface to manage dataset taxonomy without leaving the Dev UI.
- Support three bulk operations for existing tags across `categories`, `psychoactive_class`, `chemical_class`, and `mechanism_of_action`:
  - Rename a tag in-place everywhere it appears.
  - Move a tag from one field to another (optionally renaming as part of the transfer).
  - Delete a tag globally with an explicit danger-zone confirmation.
- Keep all updates scoped to the in-memory dataset managed by `DevModeProvider` while preserving article diffing, JSON editor parity, and downstream helpers that rely on normalized tag arrays.

## Current State & Constraints
- `DevModePage` (`src/components/pages/DevModePage.tsx`) exposes `edit`, `create`, and `change-log` tabs only. Tab navigation is routed through `AppView` (`src/types/navigation.ts`) and the hash parser in `src/utils/routing.ts` (`#/dev/<tab>`).
- `DevModeProvider` (`src/components/dev/DevModeContext.tsx`) stores a deep-cloned copy of `articles.json` and exposes per-article mutation helpers (`updateArticleAt`, `resetArticleAt`, etc.). There is no bulk transform helper today.
- Tag-driven form fields now rely on `TagMultiSelect` (`src/components/common/TagMultiSelect.tsx`) fed by static option builders in `src/data/tagOptions.ts`. Those options are generated from `substanceRecords`, which reflect the _original_ build-time dataset, not the mutated Dev Mode state.
- Dataset storage formats differ per field:
  - `categories`: always an array of strings, e.g. `['dissociative', 'research-chemical']`.
  - `chemical_class`: newline/semicolon/comma-delimited string; 125 unique labels across the corpus.
  - `psychoactive_class`: slash/comma/semicolon-delimited string; ~318 unique labels.
  - `mechanism_of_action`: semicolon-delimited string; entries often contain qualifiers in parentheses; ~106 unique combinations.
- Any change must maintain serialization conventions (arrays vs. delimited strings) so downstream tooling (`contentBuilder`, search indexers, `tagOptions`) keeps working.

## Data Model & Normalization Strategy
- Introduce a shared tag registry builder (new module e.g. `src/utils/tagRegistry.ts`) that consumes the current Dev Mode `articles` array and returns normalized metadata per field:
  ```ts
  type TagField = "categories" | "chemical_class" | "psychoactive_class" | "mechanism_of_action";
  interface TagUsage {
    field: TagField;
    tag: string;            // canonical label with collapsed whitespace
    key: string;            // lowercase comparison key
    count: number;          // number of articles using the tag
    articleRefs: Array<{ index: number; id?: number; title?: string }>;
  }
  interface TagRegistry {
    byField: Record<TagField, TagUsage[]>;
    byKey: Record<TagField, Map<string, TagUsage>>;
  }
  ```
- Normalization rules:
  - Collapse internal whitespace, trim, and compare case-insensitively (`key = tag.toLowerCase()`).
  - For delimited strings, reuse the split/normalization logic already present in `articleDraftForm.ts` (`parseDelimitedField`, `parseMechanismField`, `ensureNormalizedTagList`). Consider exporting these helpers or relocating them into `tagUtilities.ts` to avoid duplication.
  - Preserve input ordering for arrays when regenerating article payloads (important for `categories`). When multiple tags share the same normalized key, prefer the existing stored label for deterministic merges.

## Bulk Operation Engine
Create a pure utility layer (e.g. `applyTagMutations` inside `tagRegistry.ts`) that accepts the current articles and a mutation descriptor, returning a new articles array plus a summary of affected records.

### Rename
- Inputs: `{ field, fromTag, toTag }`.
- Steps per article reference:
  1. Parse the field into a normalized array.
  2. Replace entries whose comparison key matches `fromTag` with `toTag` (preserving original capitalization if the user did not alter it).
  3. For string-backed fields, re-join using canonical delimiters:
     - `chemical_class` & `psychoactive_class`: join with `", "`.
     - `mechanism_of_action`: join with `"; "`.
  4. Collapse duplicates post-replacement (`ensureNormalizedTagList`).
- Output summary should include counts and a list of article indices updated, so the UI can surface a “will update N records” preview before applying.

### Move
- Inputs: `{ sourceField, targetField, tag, renamedTag? }`.
- Steps:
  1. Remove the tag from `sourceField` using the rename logic (without replacement).
  2. Append `renamedTag ?? tag` to the destination field’s tag array, maintaining lexical sorting or existing ordering convention (append by default, but allow the helper to dedupe against existing values).
  3. Serialize both fields back into their stored shapes (array vs. delimited string).
- Edge cases:
  - If the destination already contains the normalized tag, skip insertion but still remove from the source.
  - If removal empties a string field, write an empty string instead of leaving stray delimiters.

### Delete
- Inputs: `{ field, tag }`.
- Steps mirror rename but drop the matching entries entirely.
- Provide a `danger` flag in the summary so the UI can show a distinct warning banner.
- Consider exposing a dry-run mode used by the UI to populate confirmation copy (“This will remove `X` from 27 articles.”).

### General Implementation Notes
- Return both the updated articles array and a patch summary:
  ```ts
  interface TagMutationResult {
    articles: ArticleRecord[];
    affected: Array<{ index: number; before: string[]; after: string[] }>;
  }
  ```
- Keep utilities side-effect free so they are unit-testable without React context.

## UI / UX Blueprint
- Add a fourth tab pill labeled **Tag Editor** to the Dev Mode navigation, mapped to `#/dev/tag-editor`.
- Layout concept inside the new tab:
  - **Header SectionCard** describing the tool, last rebuild reminder, and a “Refresh snapshot” button to recompute the registry from current state.
  - **Tag Browser Panel** (left column on desktop): searchable list grouped by field. Each row shows the tag label, usage count, and chips listing target operations (`Rename`, `Move`, `Delete`). Include a filter dropdown to focus on one field at a time.
  - **Detail & Actions Panel** (right column): when a tag is selected, show:
    - Summary stats (usage count, affected article titles/IDs with scroll area).
    - Action forms:
      - Rename: input for new label + preview diff list; submit button enables only when label changes and passes validation (non-empty, not duplicate of current tag).
      - Move: dropdown for destination field, optional rename field, toggle to keep a copy in the source (default off).
      - Delete: “Danger Zone” SectionCard with copy explaining the consequences. Clicking “Delete” opens a confirm modal/toast requiring the user to type the tag name or tick a confirmation checkbox (“I understand this cannot be undone.”).
    - Action results surface as inline success/error notices consistent with existing Dev Mode alerts.
  - Provide a “Run mutation” CTA that calls the bulk operation helper and updates Dev Mode state. After mutation, refresh the tag registry so the UI reflects the new dataset.
- Accessibility: reuse `TagMultiSelect` chip styling for selected tags, ensure keyboard navigation for the tag list, and apply `aria-live` for success/error notices.

## Integration & Engineering Tasks
1. **Routing & Navigation**
   - Update `AppView` union (`src/types/navigation.ts`) and `parseHash` / `viewToHash` in `src/utils/routing.ts` to recognize `tag-editor`.
   - Extend the Dev tab pill group in `DevModePage` to include the new option and ensure `handleTabChange` clears notices appropriately.
2. **Dev Mode Context Enhancements**
   - Add a `replaceArticles` (or `applyArticlesTransform`) method on `DevModeContext` that accepts a transform function and batches the state update. This avoids calling `updateArticleAt` hundreds of times per mutation.
   - Expose a selector for the current `articles` array so the Tag Editor can rebuild the registry on demand.
3. **Tag Registry Utilities**
   - Create `src/utils/tagRegistry.ts` exporting the builders and mutation helpers described above.
   - Factor common normalization helpers out of `articleDraftForm.ts` if needed to prevent duplication.
   - Add targeted unit tests covering split/join logic and each mutation type (rename/move/delete) with tricky separators and casing.
4. **Tag Editor Tab Component**
   - Build `src/components/pages/TagEditorTab.tsx` (or `src/components/dev/TagEditorTab.tsx`) encapsulating the layout. Compose existing primitives (`SectionCard`, `TagMultiSelect` badges) for consistent styling.
   - Implement local state for selected tag, search query, pending mutation, and confirmation flows.
   - Hook into `useDevMode` to read/update articles and trigger registry recomputation after each mutation.
5. **Shared UI Primitives**
   - If no modal/confirmation component exists, introduce a lightweight confirmation dialog (could live under `components/common/ConfirmDialog.tsx`) matching the style guide (translucent panel, fuchsia accent for confirm, red accent for destructive actions).
   - Consider adding a reusable `MutationSummary` subcomponent to display affected article chips (title + ID badges) with scroll constraints.
6. **Option Builders Refresh**
   - Update tag suggestion sources used by `TagMultiSelect` (e.g., via a `useTagOptions` hook that recomputes from the Dev Mode dataset) so the editor forms instantly reflect renamed/moved tags.

## Validation & Testing Strategy
- **Unit tests** for the new registry + mutation helpers covering:
  - Duplicate casing (`"Psychostimulant"` vs `"psychostimulant"`).
  - Complex mechanism entries with qualifiers.
  - Moving between array-based (`categories`) and string-based (`chemical_class`) fields.
  - Delete confirmation (ensure empty fields serialize as empty strings/arrays, not `null`).
- **Integration smoke**: after implementation, run manual QA in Dev Mode:
  1. Rename a category tag and confirm the draft diff & Tag selectors update.
  2. Move a psychoactive class into chemical classes and verify both fields in the JSON editor.
  3. Delete a mechanism entry, ensuring the warning gate triggers and the JSON view reflects removal.
- **Build validation**: continue running `npm run build` + `npm run build:inline` to ensure static exports stay healthy after code changes.

## Open Questions & Follow-ups
- Should we allow bulk multi-select edits (rename several tags at once), or is single-tag granularity sufficient for first pass?
- After moving a tag, should we automatically seed the inverse tag (e.g., removing from source) or offer a “keep original in source” toggle?
- How should we surface conflicts when renaming to an existing tag in the same field? (Plan: merge into the existing tag and report the dedupe in the summary.)
- Do we need to persist the registry snapshot or action history for audit/logging, or is the existing change-log tab sufficient once data is exported?
- Consider future enhancements: tag merging suggestions, orphan tag detection, and integration with scripts under `/scripts` for batch operations.
