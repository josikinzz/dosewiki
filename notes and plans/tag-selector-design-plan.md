# Tag Selector Design Plan

## Goals
- Replace free-form text inputs for category tags, psychoactive class, chemical class, and mechanism of action within the Dev Editor and Creator forms with guided tag selectors.
- Ensure contributors can pick from existing dataset tags while still allowing novel entries when needed.
- Keep downstream article serialization identical to the current schema (`articles.json`) so other surfaces remain unaffected.

## Current State
- `src/components/sections/ArticleDraftFormFields.tsx` renders simple `<input>`/`<textarea>` controls for the four fields. Suggestions are not surfaced, so editors manually type comma/semicolon/newline delimiters.
- `ArticleDraftForm` in `src/utils/articleDraftForm.ts` stores these values as raw strings (`categoriesInput`, `chemicalClass`, `psychoactiveClass`, `mechanismOfAction`). Conversion to arrays happens late via `parseListInput` or `splitToList`, which leaves room for inconsistent separators.
- `buildArticleFromDraft` serializes the raw strings directly (joining on newline/semicolon during export), which means inconsistent whitespace or ordering makes it into `articles.json` unless editors manually clean them.

## Requirements & Constraints
- **Source of truth**: All suggestion lists must be derived from normalized data that ultimately comes from `src/data/articles.json` (via `contentBuilder`/`library`). No hard-coded arrays.
- **Composable component**: One accessible multi-select/tag entry component that can be reused across all four fields with minor configuration (label, helper text, delimiter when re-serializing).
- **Free-form fallback**: When no existing tag matches user input, pressing `Enter`, selecting “Create” CTA, or blurring should add a new tag.
- **Badge editor UX**: Selected tags render as removable pills with Lucide `X` icons, mirroring existing badge styling (see `HelperTextClass` values and chips rendered by `ListPreview`).
- **Keyboard support**: Users must be able to navigate the suggestion list with arrow keys + Enter and remove tags with Backspace when the input is empty.
- **Validation**: Deduplicate tags case-insensitively, trim whitespace, and normalise internal spacing before storing.

## Proposed UX Interaction
- **Input shell**: Reuse the base input styling (`bg-slate-950/60`, `border-white/10`) with inline chips ahead of the text caret.
- **Dropdown**: A floating panel positioned beneath the control, styled like other overlays (`bg-[#120d27]`, `border-white/10`, subtle shadow). It shows: existing matches (sorted by frequency or alphabetical), an optional "Create `…`" row when the query doesn’t match, and an empty state message when there are no options.
- **Selected Badge List**: Pills inherit badge styling (`rounded-full bg-white/10 text-xs text-white/70`). Each badge displays the tag label plus an `X` button (`lucide-react` `X` sized at 12px) with `aria-label="Remove {tag}"`.
- **Field-specific helper text**: Keep existing helper copy but update to explain the selector behaviour (e.g., “Start typing to search existing tags or press Enter to add a new one”).

## Field-Specific Behaviour
1. **Categories**
   - Suggestion source: the union of `record.categories` from `substanceRecords` (`contentBuilder` already trims via `cleanStringArray`).
   - Display order: alphabetical ascending, but bubble exact matches (case-insensitive) to the top when typing.
   - Storage: maintain an ordered list (first entry should remain manually sortable) so the hero badge order stays intentional.
   - Serialization: join with `\n` when building `drug_info.categories` and for the developer preview surfaces that still expect newline lists.

2. **Psychoactive Class**
   - Suggestion source: `record.psychoactiveClasses` from `substanceRecords` (already derived by `splitToList(info.psychoactive_class)` in `contentBuilder`).
   - Existing data contains composite strings (“Stimulant / entactogen”) that should remain intact; treat each unique string as an atomic tag, not split further.
   - Display: allow multiple selections (since some records list two classes). Preserve input order for serialization (`psychoactive_class` field joined with ", " by default, map existing separators when hydrating).

3. **Chemical Class**
   - Suggestion source: `chemicalClassIndexGroups` in `src/data/library.ts` already produces distinct class names; we can derive a plain string set from the same helper logic (or expose a dedicated `chemicalClassOptions` export).
   - Some entries contain clarifiers in parentheses—keep them as part of the tag text.
   - Serialization: join selections with ", " (matching current dataset convention) while ensuring we don’t introduce duplicate class names separated by multiple delimiters.

4. **Mechanism of Action**
   - Suggestion source: `mechanismSummaries` (`src/data/library.ts`) enumerates normalized mechanism names (without qualifiers). Additionally, qualifiers (`mechanismMap.qualifierMap`) expose suffixes like “partial agonist”.
   - UX: Input supports either a base mechanism or a “Mechanism (Qualifier)” compound. Provide quick-add chips for the most common qualifiers (e.g., show `5-HT2A receptor agonist (partial)` suggestion when typing “5-HT2A”).
   - Serialization: join entries with `; ` (semicolon + space) to remain compatible with existing parsing expectations in `contentBuilder` (which splits on semicolons).

## Data Source Strategy
- Build a new helper module (`src/data/tagOptions.ts`) that exports memoized arrays for:
  - `categoryTagOptions`
  - `psychoactiveClassOptions`
  - `chemicalClassOptions`
  - `mechanismOptions` (base names) and `mechanismQualifierOptions` (map of base → qualifiers)
- Each helper should run once at module evaluation by iterating over `substanceRecords` and the existing `mechanismMap`, returning sorted, deduplicated strings.
- Expose frequency metadata (counts) so the UI can highlight commonly used tags or auto-sort suggestions.

## State & Data Model Updates
- Extend `ArticleDraftForm` to carry structured arrays alongside existing strings:
  ```ts
  categories: string[];
  psychoactiveClasses: string[];
  chemicalClasses: string[];
  mechanismEntries: string[]; // raw "Mechanism" or "Mechanism (Qualifier)" strings
  ```
- Update `createEmptyArticleDraftForm()` accordingly with empty arrays.
- Adjust `hydrateArticleDraftForm` to populate both the arrays and the legacy string fields for backwards compatibility (until all call sites migrate). Strings can be derived from arrays using the legacy delimiters so existing previews/widgets keep working during the transition.
- Rework `buildArticleFromDraft` to serialise from the arrays, falling back to the raw string if arrays are empty (to avoid data loss when loading older drafts).
- Modify `useArticleDraftForm` handlers to accept array mutations (`handleTagAdd`, `handleTagRemove`, `handleTagReorder`) in addition to the generic `handleFieldChange` used today.

## Component Architecture
- Introduce `TagMultiSelect` under `src/components/common/` with props:
  - `label`, `helperText`, `placeholder`
  - `options: TagOption[]` (contains `value`, `label`, optional `count`)
  - `value: string[]`
  - `onChange(next: string[])`
  - `createLabel?: (query: string) => string` for customizing the "Create" CTA copy
  - `delimiterHint?: string` to tailor helper wording (e.g., “Exports as semicolon-separated list”)
- Compose field wrappers (`CategoryTagField`, `PsychoactiveClassField`, etc.) in `ArticleDraftFormFields.tsx` that feed the right option lists and manage `ArticleDraftForm` state.
- Use `@headlessui/react` `Combobox` or a lightweight custom listbox for accessibility. If we avoid new deps, ensure manual ARIA attributes are applied.
- Selected badge list should be part of the component, not reimplemented per field.

## Validation & Normalisation Rules
- Trim whitespace, collapse internal multiple spaces to single spaces, and capitalise consistently only when user input is entirely lower-case (otherwise respect manual casing for chemical acronyms).
- Deduplicate ignoring case; when conflict arises, keep the first-entered casing.
- Prevent empty strings from being added via `Enter`.
- Guard against extremely long tags (> 120 chars) with inline error messaging.

## Implementation Steps (Engineering)
1. **Data foundation**: Create `tagOptions.ts`, export deduped/sorted option arrays + counts.
2. **State model**: Update `ArticleDraftForm` utilities (types, factory, hydrate, build) to include array-based fields and new handlers in `useArticleDraftForm`.
3. **Component build**: Implement `TagMultiSelect` with keyboard navigation, dropdown filtering, chip rendering, and optional `Create` row.
4. **Field integration**: Swap the four existing inputs in `ArticleDraftFormFields.tsx` for the new component wrappers, sync helper copy, and ensure previews (`ListPreview`) pull from the array values instead of parsing strings.
5. **Dev mode wiring**: Update `DevModePage` to read/write the new array fields when syncing form state to JSON editor and when building payloads.
6. **Hydration fallback cleanup**: Once UI uses arrays exclusively, remove deprecated string fields if they are no longer necessary (Phase 2 follow-up).
7. **Regression checks**: Run `npm run build` and `npm run build:inline`; manually load the Dev editor to confirm persisted drafts still display prior values and that the JSON export matches `articles.json` expectations.

## Risks & Mitigations
- **Legacy drafts**: Existing serialized drafts in local storage may only contain strings. Mitigation: hydration logic should backfill arrays by parsing the legacy string values on load.
- **Order sensitivity**: Some downstream surfaces assume specific badge ordering (e.g., hero badges). Preserve manual ordering by letting users drag to reorder or by appending new tags at the caret position. Consider `onReorder` support (Phase 2 if needed).
- **Mechanism qualifiers**: Conflating base + qualifier into a single string keeps compatibility but may limit future analytics. Document this and consider extending the schema later if richer structure is needed.
- **Suggestion list size**: Mechanism and chemical class lists can be long (>200 entries). Ensure the dropdown caps height with scroll and debounce filtering for performance.

## Open Questions
- Do we need drag-and-drop reordering for categories right away, or can we rely on add/remove to manage sequence?
- Should new mechanism entries auto-split into base + qualifier fields for future data work, or is the concatenated string sufficient for now?
- Are there validation rules for “index category” (currently untouched) that might also benefit from the new component in a later iteration?

## QA Checklist (Manual)
- Load an existing article in Dev Editor; verify all four fields hydrate with chips matching the current dataset values.
- Add a new tag via selection and via typing + Enter; ensure duplicates are blocked and X removes badges.
- Switch to JSON editor to confirm the serialized payload reflects the new selections (including delimiter formatting).
- Trigger `npm run build` and `npm run build:inline`; open `dist-inline/index.html` to spot-check the Chemistry & Pharmacology card and hero badges for the edited article.
