# Dev Tools Draft Editor: Form-First UI Plan

## Objective
Replace the current JSON-only editor in the Dev Tools “Draft editor” tab with a form-driven experience that mirrors the existing “New article” workflow. Editors should select any article, view/edit its fields through structured inputs, and optionally toggle back to a raw JSON editor. The form view must stay in sync with the dataset-driven changelog/export tooling.

## Current State Snapshot
- `src/components/pages/DevModePage.tsx` renders all three tabs; the “Draft editor” right column is a `JsonEditor` (`~1380-1465`) with actions (`applyEdits`, `downloadArticle`, `copyDraft`).
- Article selection lives on the left rail: `selectedIndex` controls `selectedArticle`, with `editorValue` seeded from `JSON.stringify(selectedArticle)` in a `useEffect` (`~720-760`).
- Change detection and changelog generation rely on `editorValue` → `draftState` (`~372-412`), so any new form data must continue to surface as valid JSON for those hooks.
- The “New article” tab defines a rich `NewArticleForm` state (`types + helpers`, `~60-260`) and a large JSX form (`~1500-2050`), including handlers for routes, durations, tolerance, interactions, citations, etc.

## UX / Interaction Goals
- Default the Draft editor to a “UI view” showing the same field groups/layout as the New article card (title, identifiers, drug info, dosage routes, durations, tolerance, interactions, citations).
- Keep the article dropdown + psychoactive class jump list exactly as-is.
- Provide a pill toggle (UI view | JSON view) in the main editing card. UI view is default; JSON view exposes the existing `JsonEditor` for power users.
- Surface validation guidance similar to the New article form (e.g., highlight missing required fields before allowing “Save draft” when in UI mode).
- Ensure switching modes preserves unsaved work. If the current JSON cannot hydrate into form state, block the toggle with an inline error.

## Data & State Considerations
- Treat the existing “New article” form as the canonical field list. Generalize its types/helpers into reusable utilities (e.g., rename to `ArticleDraftForm`) so both tabs share the same transformations.
- Add `editDraftForm` state for the selected article plus a `draftMode` union (`"ui" | "json"`).
- Keep a single source of truth for serialized JSON (`editorValue`). In UI mode, recompute this string from `editDraftForm` whenever the form changes. In JSON mode, let the `JsonEditor` mutate it directly.
- When switching from JSON → UI, parse `editorValue` and hydrate the form. Reject with a notice if the JSON is invalid or missing expected structures.
- When applying edits, merge the form-derived payload with the existing article to avoid dropping unknown keys. (Shallow merge `selectedArticle` with `buildArticlePayload(form)`; override known fields.)
- `changelogResult`, `datasetChangelog`, download/copy helpers must consume the same object that will be saved. Update those memo hooks to branch on `draftMode` so diffing always reflects the active representation.

## Implementation Steps
1. **Factor shared form utilities**
   - Create `src/utils/articleDraftForm.ts` exporting:
     - `ArticleDraftForm` type + nested helper types.
     - `createEmptyArticleDraftForm()`, `hydrateArticleDraftForm(record: unknown)`, and `buildArticleFromDraft(form, opts?)` that mirrors current `buildNewArticlePayload`.
     - `parseListInput`, `createEmptyRouteEntry`, etc., preserving behaviour from `DevModePage`.
     - Ensure `buildArticleFromDraft` keeps numerical `id` if present and omits blank optional fields.
   - Update `DevModePage.tsx` to consume these helpers for the New article tab (to verify parity before touching the edit UX).

2. **Extract reusable form UI component**
   - Add `src/components/sections/ArticleDraftFormFields.tsx` (or `devtools/ArticleDraftFormFields.tsx`) rendering the field groups currently inside the New article tab.
   - Accept props for: `form`, change handlers (string fields, duration, tolerance, routes, citations), add/remove callbacks, `idPrefix` (so `create` vs `edit` inputs remain unique), validation state, and contextual copy overrides (e.g., heading text).
   - Replace the New article card with this component to confirm functionality remains unchanged.

3. **Introduce shared form controller hook**
   - Implement `useArticleDraftForm(initial: ArticleDraftForm)` (likely in the same util module or a new `hooks/` file) returning the form state plus memoized handlers currently defined inline (`handle...FieldChange`, add/remove route/citation, reset).
   - Update the New article tab to consume this hook. Plan for an “external reset” method so the Draft editor can hydrate from dataset updates.

4. **Wire the Draft editor UI mode**
   - Add state: `const [draftMode, setDraftMode] = useState<'ui' | 'json'>('ui');` and `const editDraft = useArticleDraftForm(hydrateArticleDraftForm(selectedArticle))`.
   - When `selectedArticle` changes, call `editDraft.reset(hydratedForm)` and `setEditorValue(JSON.stringify(article, null, 2))`; clear notices and revert to UI view.
   - Render a `SectionCard` with a header, guidance copy (similar to existing), the mode toggle, and either the reusable form component (`draftMode === 'ui'`) or the `JsonEditor`.
   - Provide per-field notices (reuse `notice` state or create `draftNotice`). Show validation errors when required fields missing in UI mode.

5. **Sync JSON + form state**
   - In UI mode, whenever `editDraft.form` changes, serialize `buildArticleFromDraft(editDraft.form)` into `editorValue` (only if `draftMode === 'ui'` to avoid clobbering JSON edits).
   - On toggle to JSON: run a one-time sync to ensure `editorValue` reflects the latest form before showing the editor.
   - On toggle back to UI: attempt to parse `editorValue`; if successful, hydrate the form; otherwise, keep `draftMode` at JSON and emit an error notice.

6. **Apply/save/reset flows**
   - Update `applyEdits` to branch by `draftMode`:
     - UI mode: call `buildArticleFromDraft`, merge into the existing article, then `updateArticleAt`.
     - JSON mode: preserve existing parse path.
   - Ensure `resetArticle` / `resetDataset` refresh both `editDraft` and `editorValue`, and default the mode back to UI for clarity.
   - Keep download/copy actions using `editorValue` so both modes behave identically.

7. **Changelog + dataset diff alignment**
   - Update `draftState` / `comparisonTarget` / `articleLabel` to reference the correct object (form-derived when UI mode is active).
   - Guarantee `buildDatasetChangelog` receives the same updated article arrays the DevMode context holds after `updateArticleAt` to avoid mismatch between UI and commits.

8. **Polish + docs**
   - Adjust instructional copy or helper text in the Draft editor card to reflect the new workflow (e.g., “Switch to JSON view if you need raw edits”).
   - Confirm focus management/accessibility: maintain logical tab order, ensure the mode toggle has ARIA attributes, and inputs keep descriptive labels.
   - Update `notes and plans/Agent.md` if new conventions/components warrant mention.

## Risks & Mitigations
- **Hydration failures**: Articles missing optional keys (`drug_info.interactions`) may break form assumptions. Use safe defaults in `hydrateArticleDraftForm` (empty arrays/strings) and guard against undefined nested objects.
- **Unknown fields**: If future articles contain additional properties, merging form output could drop them. Mitigate by spreading the original article before overriding known sections (e.g., `next = { ...selectedArticle, ...payload, drug_info: { ...selectedArticle.drug_info, ...payload.drug_info } }`).
- **Performance**: Serializing large JSON on every keystroke may be expensive. Memoize `buildArticleFromDraft` results and throttle serialization if necessary (initially rely on React batching; revisit if we hit lag).

## Validation & QA Checklist
- Create manual QA script covering:
  - Edit an article entirely via UI, save, verify changelog updates and Change log tab entry after GitHub commit flow.
  - Toggle to JSON, tweak raw fields, toggle back to UI (valid + invalid JSON paths).
  - Reset article/dataset from both modes and confirm form repopulates correctly.
  - Add/remove routes/citations and verify persisted ordering.
- Run `npm run build` and mandatory `npm run build:inline` after implementation.
- Smoke test under `vercel dev` with populated `.env.local` to ensure commit/auth APIs still function with the new payload (`changedArticles` uses merged data).

## Open Questions
- Should we expose a read-only preview of generated JSON in UI mode in addition to the toggle (e.g., collapsible panel)?
- Do we need field-level validation (length limits, URL schemas) before shipping, or is parity with the New article tab sufficient for now?
