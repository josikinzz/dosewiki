# Dev Tools Change Log Tab: Implementation Plan

## Objective
Create a third tab on the Dev Tools (`DevModePage.tsx`) called “Change log” that lists every successful GitHub commit triggered from the draft editor. Each entry must capture the generated markdown diff, commit metadata, and affected articles so editors can audit how `articles.json` evolves over time. The plan keeps the existing Draft editor and New article tabs untouched while extending the GitHub save pipeline to write an additional data file.

## Current State Snapshot
- `DevModePage.tsx` holds all draft tooling with `activeTab` limited to `"edit" | "create"` and renders a two-button segmented control around line 985.
- The draft tab already builds a single-article changelog via `collectDiff` → `generateChangelogMarkdown` and exposes clipboard/download helpers (`copyChangelog`, `downloadChangelog`).
- GitHub persistence lives in `/api/auth.js` (password check) and `/api/save-articles.js` (Content API `PUT` that only overwrites `src/data/articles.json`). The client’s `handleSaveToGitHub` posts `{ password, articlesData, commitMessage }` without any changelog payload.
- No bundled storage exists for past commits; the Dev Tools view is stateless beyond the current editing session.

## Target Data Model
1. **Static dataset**: add `src/data/devChangeLog.json` with an empty array and a top-of-file schema comment.
   ```ts
   /**
    * Change log entries appended by the Dev Tools GitHub workflow.
    * - id: yyyyMMdd-HHmmss-<sha> unique key
    * - createdAt: ISO timestamp (server generated)
    * - commit: { sha: string, url: string, message: string }
    * - articles: { id: number, title: string, slug: string }[]
    * - markdown: string (combined diff markdown)
    */
   ```
2. **Helper module**: create `src/data/changeLog.ts` exporting:
   - `type ChangeLogEntry` that mirrors the JSON schema.
   - `getChangeLogEntries()` returning the parsed data array.
   - Utility selectors (e.g., `getArticlesTouchedMap(entries)`) to support filters without recomputing in the component.
3. Limit size: whenever an entry is appended, trim to the most recent ~250 records to keep bundles lean. The helper should expose a `appendEntry(entries, next)` function reused by both client optimistic updates and server persistence to guarantee consistent trimming + sorting.

## Serverless Workflow Updates (`/api/save-articles.js`)
1. Accept new payload fields `changelogMarkdown` (string) and `changedArticles` (`{ id: number; title: string; slug: string }[]`). Reject the request if `changedArticles` is empty to avoid logging no-op commits.
2. Replace the current single-file Content API `PUT` with a Git data API flow so `articles.json` and `devChangeLog.json` update in one commit:
   - Fetch the main ref (`/git/ref/heads/main`) to obtain the latest commit SHA, then fetch the tree (`/git/trees/:sha?recursive=1`). Reuse a small helper (e.g., `fetchGitData(token, path)`) to keep code tidy.
   - Build blobs for both files using `POST /git/blobs` (base64-encoded content) and collect their SHAs.
   - Create a new tree referencing the updated blobs while reusing untouched items from the previous tree.
   - Create a commit referencing the new tree and parent commit, then update the ref via `PATCH /git/refs/heads/main`.
   - Return `{ commitSha, commitUrl, createdAt }` plus the sanitized `changedArticles` so the UI can hydrate its local state optimistically.
3. Load and update `devChangeLog.json` server-side:
   - Retrieve the current file (from the tree or via Contents API once per request) to parse existing entries.
   - Append the new entry using the helper logic (`appendEntry`) with a server-generated timestamp (`new Date().toISOString()`), server commit metadata, and the markdown payload.
   - Serialize with `JSON.stringify(data, null, 2)` to preserve formatting conventions.
4. Error handling:
   - Bubble up GitHub API errors with the original `message` for debugging.
   - If blob/tree creation fails, abort before touching refs so the repo state stays consistent.
   - Send 422 when `changelogMarkdown` is missing or empty to prompt the UI to retry before the commit step.

## Frontend Data Flow (`DevModePage.tsx`)
1. Extend the component state:
   - Load existing entries via `import changeLogEntriesData from "../../data/devChangeLog.json";` and seed a `useState<ChangeLogEntry[]>(changeLogEntriesData)`.
   - Add `activeTab` union type to include `"changelog"` and adjust `handleTabChange` to clear notices appropriately (`notice`, `creatorNotice`, `githubNotice`).
   - Introduce derived values (`filteredEntries`, `filterState`) for search + date filtering.
2. Build aggregate changelog payloads:
   - Move the current per-article markdown generator into a shared utility (e.g., `src/utils/changelog.ts`) that exposes `buildArticleChangelog(article, original)` and `buildDatasetChangelog({ articles, originals })` returning `{ markdown, articles }`.
   - In `handleSaveToGitHub`, compute the aggregate before hitting `/api/auth`: compare each draft article with its original (`getOriginalArticle(index)`) using existing `collectDiff` logic. Only include entries where diffs exist.
   - Add the resulting `{ markdown, articles }` to the POST body alongside `articlesData`.
3. Handle server responses:
   - When `/api/save-articles` resolves, destructure `{ commitSha, commitUrl, createdAt, changedArticles, markdown }` (markdown echo optional). Update local `changeLogEntries` state by appending the new entry so the Change log tab reflects the commit instantly.
   - Reset the admin password input and keep all draft data intact.
4. Clipboard/download actions per entry:
   - Reuse the existing `copyChangelog` and `downloadChangelog` helpers by parameterising them (`copyMarkdown(text, successMessage)` etc.) to avoid code duplication.
5. Type safety + performance:
   - Memoize expensive filter computations with `useMemo` keyed by `[changeLogEntries, filterState]`.
   - Use `useCallback` for chip click handlers to keep renders smooth.

## UI Specification (Change Log Tab)
1. **Tab switcher**: convert the segmented control to three buttons (Draft editor, New article, Change log). Maintain the same accent class (`bg-fuchsia-500/20 text-white`) when active. Use `aria-controls`/`aria-selected` on the active button.
2. **Layout**: follow the existing two-column grid pattern used in the edit tab.
   - Left column (sticky on `md`+) hosts filters inside a `SectionCard` (`bg-white/[0.04] space-y-5`). Include:
     - Article multi-select (reuse `baseSelectClass` with search) backed by the aggregated options map.
     - Date range inputs (`type="date"`) and quick pills for “Past 7 days / 30 days / All time”.
     - Summary chips: total entries, newest entry timestamp, most frequently changed article.
   - Right column renders history entries stacked vertically inside a `SectionCard` with scroll margin top/bottom.
3. **Entry card**: for each `ChangeLogEntry` render:
   - Header row with `formatInTimeZone` (existing helper) to display `MMM d, yyyy • h:mm a` and the commit message as a link.
   - Secondary line listing article pills. Clicking a pill applies the article filter (update `filterState` and scroll to top).
   - Collapsible markdown preview using `details/summary` or a custom toggle button to keep cards compact. Provide `Copy markdown` + `Download .md` buttons using `lucide-react` icons (`Copy`, `Download`).
   - Optional badge when the entry includes more than N articles (e.g., “Bulk update”).
4. **Empty state**: reuse the cosmic gradient background, `Wrench` icon, and typography from other empty cards in the file (see `New article` tab empty states). Provide guidance text: “No commits captured yet. Ship your first draft to populate the timeline.”
5. **Accessibility**: ensure filter controls have `aria-label`s and that the entry list is navigable by keyboard (e.g., `tabIndex` on the copy/download buttons).

## Filtering & Sorting Logic
- Default ordering is reverse chronological by `createdAt` (server timestamp). Keep sorting logic shared between server trims and client rendering.
- Filters apply as follows:
  1. Article filter (one or many): match when any touched article slug appears in the entry.
  2. Date range: inclusive start/end; quick pills should set the range relative to `Date.now()`.
  3. Text search (optional stretch): match commit message or markdown body.
- Display an inline “X filters active” chip with a “Clear filters” button.

## Dev Tool UX Hooks
- When switching tabs, maintain filter state for the Change log tab but reset notices so previous success/error messages don’t bleed.
- Persist the most recent filter settings in `localStorage` (namespaced key) so editors return to their preferred view without adding router state.
- After a successful commit, automatically toggle to the Change log tab and focus the newest entry card to draw attention to the result.

## QA & Validation Checklist
1. Populate `.env.local` with `ADMIN_PASSWORD` + `GITHUB_TOKEN`, run `vercel dev`, and walk through:
   - Successful commit updating both data files; verify GitHub commit shows both blobs.
   - Invalid password path (should never hit `/api/save-articles`).
   - API error during changelog append (simulate by removing write permission token) — UI must surface error and not mutate local change-log state.
2. Run `npm run build` and `npm run build:inline` to ensure bundler accepts the new dataset.
3. Manual UI checks in desktop + mobile breakpoints:
   - Tab navigation order and focus states.
   - Sticky filter behavior on `md` viewports.
   - Copy/download actions operate per entry (verify clipboard contents).
4. Future automation: once a test harness lands, cover the dataset diff helper and the new API request builder with unit tests; add Playwright coverage for tab navigation + filter interactions.

## Follow-ups / Open Decisions
- Confirm retention cap (250 entries) is acceptable; consider moving older logs to long-term storage (S3/planetscale) if bundle size becomes an issue.
- Decide whether to include GitHub author info (would require additional API scope) — currently out of scope.
- Evaluate exposing the change log to non-dev users in the public app once the dataset proves useful.
