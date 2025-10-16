# Add Drug Tab Commit & Tag Selector Plan (2025-10-16)

## Context & Goals
- The Dev Tools “Add drug” experience is the `create` tab inside `src/components/pages/DevModePage.tsx`. Today it only renders the structured form (`<ArticleDraftFormFields />`) and the generated JSON preview. There is no inline path to commit the staged dataset, so editors must switch back to the edit tab to ship changes.
- Recent UX work moved all tag pickers to `ArticleDraftFormFields.tsx`, but we need to confirm that the create tab actually surfaces the same `TagMultiSelect` components as the edit tab and fill any gaps.
- Desired outcome: the create tab offers an inline “Commit to GitHub” section (mirroring the edit tab) and guarantees that the tag selectors match the edit tab experience.

## Findings from Code Review
- `DevModePage.tsx`:
  - Edit tab (`activeTab === "edit"`) renders the shared `<DevCommitCard />` (`src/components/dev/DevCommitCard.tsx:8`) underneath the editor column (`DevModePage.tsx:1988-2040`).
  - Create tab (`activeTab === "create"`) renders only the form (`DevModePage.tsx:2156-2160`) and the read-only JSON preview (`DevModePage.tsx:2171-2188`); no commit controls exist.
  - New articles are held in local form state (`newArticleController` from `useArticleDraftForm`, defined at `DevModePage.tsx:244-261`) and never merged into `useDevMode().articles`. Staging today is effectively manual export.
  - Dataset commits rely on `handleSaveToGitHub` (`DevModePage.tsx:1239-1327`) and operate on whatever lives in `useDevMode().articles`.
- `ArticleDraftFormFields.tsx` already centralizes all tag selectors using `TagMultiSelect` (`src/components/sections/ArticleDraftFormFields.tsx:95-208` and `:260-332`). Because the create tab uses this component, the form *can* display the upgraded tag pickers, but we should verify that the necessary tag option data (`useDevTagOptions`) loads before the form renders.
- `useDevMode()` exposes helpers (`applyArticlesTransform`, `replaceArticles`) that we can reuse to insert a freshly built record into the in-memory dataset (`src/components/dev/DevModeContext.tsx:12-99`).

## Proposed Implementation Steps
1. **Stage-new-article workflow**
   - Add create-tab specific state to track staging status (e.g., `isNewArticleStaged`, `newArticleSlug` for feedback). This will help us gate the commit button and surface confirmation text.
   - Introduce a `handleStageNewArticle` helper in `DevModePage.tsx` that:
     - Validates required fields (`title`, `drugName`, and at least one populated route) using the existing `isNewArticleValid` check (`DevModePage.tsx:409-416`).
     - Builds an article payload via `buildArticleFromDraft(newArticleForm)`.
     - Automatically determines the article ID by scanning `articles` for the highest numeric ID and assigning the next integer (overriding a blank form field and optionally warning if the user typed a conflicting ID).
     - Persists the chosen ID back into the create form state so editors see the value immediately and the generated JSON stays in sync.
     - Appends the record to `useDevMode().articles` through `applyArticlesTransform((prev) => [...prev, draft])` and optionally sorts if we decide to maintain a canonical order.
     - Logs a success notice (`creatorNotice`) and flags the staged state; on failure, present an error notice.
     - Optionally resets the form or leaves it populated—decide based on UX preference.

2. **Sync tag selector options**
   - Confirm `useDevTagOptions` initializes before render; if it depends on the dataset containing the new article, consider re-computing after staging (calling it already reruns because `articles` changes). Add a quick smoke check to ensure the `TagMultiSelect` props on the create tab receive the same option arrays as the edit tab.
   - If any discrepancies surface (e.g., missing index categories), extend `useDevTagOptions` or the create-tab container to pass fallback options. Otherwise document that the components are shared and no extra work is required.

3. **Insert commit panel into create column**
   - Reuse the existing `commitPanel` JSX or create a second instance positioned under the JSON preview (e.g., wrap the right column in a stack: preview → commit card).
   - Wire the commit card’s disabled state so it respects both `hasInvalidJsonDraft` (global) and the new staging flag (`!isNewArticleStaged`), preventing accidental commits before the article is added to the dataset.
   - Supply a `footerSlot` explaining that the staged article now lives in the dataset (mention the generated slug/title for clarity) and that committing will deploy it.

4. **Dataset diff + changelog validation**
   - Verify that staging a new article triggers `datasetChangelog` updates (it already compares `articles` against `getOriginalArticle`). Ensure the changelog snippet cleanly communicates “new article added” by checking the generated diff.
   - Adjust notices so the create tab routes users to the Change Log tab after a successful commit (matching the edit tab behaviour at `DevModePage.tsx:1311-1322`).

5. **UX and documentation polish**
   - Update any inline helper text in the create tab to mention the new staging + commit flow.
   - Surface a hint near the ID input explaining that the value auto-increments from the highest existing article.
   - If we add new controls, review layout/tailwind classes to keep the right column spacing aligned with the edit tab.
   - Reflect the workflow change in `AGENTS.md` if the developer workflow meaningfully shifts.

## Verification Plan
- Manual QA checklist:
  1. Fill the create form with minimal valid data, stage it, and confirm the dataset diff shows the new record.
  2. Confirm the staged article receives an ID exactly one greater than the current maximum and that the form + JSON preview reflect the assigned value.
  3. Run `npm run build` and `npm run build:inline` to ensure static builds succeed with the staged article.
  4. Commit via the new create-tab card (against mocked API or by inspecting fetch payload) and confirm the success notice + Change Log entry display.
  5. Confirm tag pickers in the create tab mirror the edit tab (options, keyboard interactions, create-new-tag flows).

## Open Questions / Considerations
- Should the newly staged article automatically open in the edit tab for further tweaks before committing? If so, we’ll need to navigate to the edit tab and select the appended article after staging.
- Do we want automatic article ordering (alphabetical or by ID) when appending? Implementation choice affects `applyArticlesTransform` logic.
- How should we handle user-entered IDs that conflict with the auto-increment value—ignore them, warn, or allow overrides?

## Deliverables
- Updated `DevModePage.tsx` (create-tab logic + shared commit card wiring).
- Potential adjustments to `useDevMode` or helper hooks if staging requires new utilities.
- Documentation refresh in `AGENTS.md` (if necessary).
- Manual QA notes capturing the scenarios listed above.
