# About Page Markdown & Dev Tools Plan

## Goal
- Store the About page copy in a Markdown source file and expose it to end users via the existing About surface.
- Add an "About" tab in the Dev Tools editor so authenticated editors can update the Markdown and choose which contributor bios appear as founders.
- Keep the experience aligned with the visual style guide and current Dev Tools ergonomics while preserving existing article editing workflows.

## Current Observations
- `src/components/pages/AboutPage.tsx` renders hard-coded JSX copy for the entire About view, including inline anchor tags and dataset counts that use values from `library.ts` (`substanceRecords`, `dosageCategoryGroups`, `effectSummaries`).
- `src/components/dev/DevModeContext.tsx` only manages state for `articles.json` plus the manual index configs; there is no provision for auxiliary datasets like an About document.
- The Dev Tools save pipeline (`src/components/pages/DevModePage.tsx` → `/api/save-articles.js`) only serializes `articles.json`, `psychoactiveIndexManual.json`, and the change log markdown when committing.
- Markdown rendering + previews already exist in `src/components/dev/ProfileEditorTab.tsx` and `src/components/sections/NotesSection.tsx`. These components style links, lists, and emphasis per the brand guidelines, so they provide a concrete reference for the About editor preview.
- User profile data (including avatars) arrives from `src/data/userProfiles.ts`; founders should reference these normalized records to avoid duplicating contributor metadata.

## Data & State Updates
- Add `src/data/aboutContent.md` to hold the canonical Markdown copy. Keep the existing prose but convert links to Markdown syntax and introduce placeholder tokens where dynamic counts are still needed (for example `{{compoundCount}}`, `{{categoryCount}}`, `{{effectCount}}`).
- Add `src/data/aboutConfig.json` with a simple shape such as `{ "founderProfileKeys": ["JOSIE", ...] }`. Create `src/data/about.ts` to import both files (`aboutContent.md?raw` and the JSON), replace known tokens with runtime values, and expose sanitized exports (`aboutMarkdown`, `aboutFounderKeys`, `resolvedAboutMarkdown`). Document the JSON shape in a top-of-file comment inside `about.ts` per repo guidelines.
- Extend `src/components/dev/DevModeContext.tsx` to load the raw Markdown string and founder key array on initialization, track both as editable state, expose setters/resetters, and provide access to the original values for diffing. Mirrors the existing patterns for manual index configs (lines 51-239).
- Update `src/data/library.ts` (or a new helper) to surface the computed founder profiles so the About page can render avatars and handles without re-implementing lookup logic.

## About Page Rendering
- Refactor `src/components/pages/AboutPage.tsx` to consume the new data module instead of hard-coded JSX strings.
  - Use `ReactMarkdown` with `remark-gfm` and the same component map as `ProfileEditorTab.tsx:61-83` to ensure lists, emphasis, and links match the style guide.
  - Inject dynamic counts by preprocessing the Markdown (replace `{{...}}` tokens before rendering) so the document stays accurate when datasets change.
  - Keep the animated logo + `PageHeader` intro intact for brand continuity.
  - Add a `SectionCard` that renders selected founder profiles: show avatar (image or initials badge), display name / handle, and optionally a link to their contributor page. Layout should follow the visual guide (`bg-white/5`, `border-white/10`, rounded corners, `gap-4`, `text-white/80`). Provide a graceful empty state when no founders are selected.

## Dev Tools “About” Tab
- Introduce a new `DevModeTab` discriminator (`"about"`) and surface it alongside "Substances", "Tags", and "Index layout" in the edit tab switcher (`DevModePage.tsx` around the button cluster near lines 2200-2240). Update hash routing helpers if necessary.
- Create `components/sections/dev-tools/about/AboutEditorTab.tsx` (naming mirrors `index-layout`). Responsibilities:
  - Markdown editor panel using a multi-line `<textarea>` styled with `baseInputClass`, showing live character count and reset button.
  - Live preview panel using `ReactMarkdown` (same renderer pipeline as the public page) inside a `SectionCard`, so editors can verify formatting before saving.
  - Founder selection grid that lists all normalized profiles with checkbox toggles. Each row should preview avatar + handle (reuse badge styles from `ProfileEditorTab` to maintain brand consistency). Persist selection back to `DevModeContext` via new `updateAboutFounders` helpers.
  - Diff section leveraging `DiffPreview` to compare the staged Markdown against the original file, plus a summary of added/removed founders.
  - Action row with "Reset to source" and "Copy markdown" controls consistent with other tabs, and the shared `commitPanel` injected from `DevModePage` so the GitHub save flow remains centralized.
- Wire the component into `DevModePage.tsx` by rendering `<AboutEditorTab>` when `activeTab === "about"`. Provide the same keyboard focus/aria patterns as surrounding tabs.

## Commit & API Flow
- Expand the dataset changelog composed in `DevModePage.tsx:360-520` to append a new section whenever the About Markdown or founder list diverges from source data. A helper like `buildMarkdownDiff("About page copy", originalAboutMarkdown, aboutMarkdown)` can produce concise diff text for the change log modal and clipboard download.
- Update `handleSaveToGitHub` to include the staged about payload in the request body (e.g., `aboutMarkdown`, `aboutConfig`, and an aggregated changelog string that already contains both dataset and about diffs). Ensure we guard against committing when the Markdown editor has syntax errors (track validity state similar to JSON editor).
- Extend `/api/save-articles.js` to accept the new fields, serialize them, and inject additional tree entries for `src/data/aboutContent.md` and `src/data/aboutConfig.json` when saving to GitHub. Maintain backwards compatibility so existing calls without about data continue to work.
- Update the success response to echo the submitted founder keys (optional) so the client can refresh state without reloading.

## Visual & UX Alignment
- Follow the dark glass aesthetic from `dosewiki-visual-style-guide.md` (panels at `bg-white/5`, `border-white/10`, accent text `text-fuchsia-300`, pill buttons `bg-white/12`).
- Use the same 16px input font sizing enforced by the shared base class. Reserve gradients and accent borders for hovered/active states to respect the “dark cosmic canvas” guidance.
- Keep Markdown link styling consistent with `NotesSection`/Profile preview: dotted underline, `text-fuchsia-200`, hover lighten.

## Implementation Steps
1. Add new data files (`aboutContent.md`, `aboutConfig.json`) and `about.ts` loader with token replacement + normalization helpers.
2. Extend `DevModeContext` state + hooks for about content and founder keys.
3. Refactor `AboutPage` to consume the new module, render Markdown, and show founders.
4. Introduce `AboutEditorTab` and integrate it into the Dev Tools edit navigation.
5. Enhance changelog + save pipeline on the client to include about diffs and payloads.
6. Update `/api/save-articles.js` to commit the new files and persist founder selections.
7. Migrate existing About copy into the Markdown file, verifying placeholders resolve correctly.
8. Update documentation (`Agent.md`) to mention the new data sources and Dev Tools tab once implemented.
9. Run `npm run build` and `npm run build:inline` to validate bundling and the single-file export.

## QA Checklist (post-implementation)
- Load About page in the app and confirm Markdown + founders render with expected styles and responsive layout.
- Toggle founders in Dev Tools → About tab; verify preview updates immediately and reverted state restores original selections.
- Edit Markdown, observe live preview + diff, and ensure GitHub save request includes updated `aboutContent.md` / `aboutConfig.json` (inspect network payload in dev tools).
- Confirm overall dataset diff still populates the change log and that no regressions appear in existing article editing flows.
- Validate `npm run build` and `npm run build:inline` both succeed.

## Open Questions / Follow-ups
- Should we support additional placeholders (e.g., auto-generating anchor hashes) or keep Markdown purely static aside from count tokens?
- Do we want the founders section to link to `#/contributors/<key>` automatically, or should that remain manual per Markdown copy?
- Would editors benefit from version history specific to the About document, or is the global change log sufficient for now?
