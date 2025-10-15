# User Bio Dev Tools Plan

_Last updated: 2025-10-16_

## Goal
Provide authenticated contributors (identified via ENV key credentials) with a personal bio surface that shows their name and edit history by default, while letting them update a Markdown bio, avatar URL, and up to three external links. Editing must be restricted to the currently authenticated contributor and exposed through a new Dev Tools tab that appears only after credentials are stored.

## Current State & Constraints
- Credentials are saved locally inside `src/components/pages/DevModePage.tsx` under the `dosewiki-dev-password` key; saved values populate `username`/`adminPassword` state and drive GitHub commits once verified.
- `/api/auth` wraps `verifyCredentials` from `api/_utils/passwords.js`, using environment variables keyed by contributor usernames. The API response returns `authorized` and the canonical key.
- `/api/save-articles` currently commits `src/data/articles.json` and `src/data/devChangeLog.json` to GitHub after verifying credentials. No other datasets are persisted via the dev editor today.
- `src/data/devChangeLog.json` captures `submittedBy` values, which we can repurpose to render per-contributor edit history without querying GitHub directly.
- Routing is hash-based (`src/utils/routing.ts` + `AppView`), and Dev Tools tabs are hard-coded (`edit`, `create`, `change-log`, `tag-editor`).
- Visual styling for Dev Tools forms follows Tailwind token patterns documented in `notes and plans/dosewiki-visual-style-guide.md`.

## Proposed Data Model & Storage
- Add `src/data/userProfiles.json` (document schema at top of file). Shape proposal:
  ```json
  [
    {
      "key": "JOSIE",
      "displayName": "Josie",          // Required string; defaults to key if absent
      "avatarUrl": "https://…",         // Optional secure URL string
      "bio": "Markdown content",        // Optional markdown string (<= 4k chars)
      "links": [
        { "label": "Website", "url": "https://example.com" }
      ]
    }
  ]
  ```
- Each entry is keyed by the ENV username. The dataset should include stub records for known keys (from `getValidUsernames`) so every contributor has a default page even before adding custom content.
- Create `src/data/userProfiles.ts` exporting helpers:
  - `userProfiles` array and `profilesByKey` map.
  - `getProfileByKey(key: string)` returning a normalized object with fallbacks (empty bio, default avatar placeholder, empty links array).
  - `buildProfileHistory(key: string)` that filters `initialChangeLogEntries` (or `devChangeLog.json`) by `submittedBy` for later consumption.
- Consider adding a small default avatar asset (e.g., generated pattern) in `public/` if no `avatarUrl` is set.

## Persistence & API Changes
- Introduce `/api/save-user-profile` that mirrors the credential checks in `/api/save-articles`:
  - Accept body `{ username, password, profile }`.
  - Verify credentials via `verifyCredentials`.
  - Load current `src/data/userProfiles.json` from GitHub, upsert the caller’s record, and commit with a message like `"Update profile for <key>"`.
  - Optional: append a lightweight log entry to `devChangeLog.json` noting profile updates for future auditing (new `type: "profile"` entries).
- Share helper utilities with `save-articles` where possible (GitHub request helpers, commit creation) to avoid duplication—extract into `api/_utils/github.js` if the logic becomes large.
- Enforce server-side validation: limit `links` to <=3, require HTTPS URLs, clamp bio length, and whitelist image domains if needed.

## Dev Tools UI Updates
- Extend `DevModePage` tab model:
  - Update `DevModeTab` union to include `"profile"`.
  - Add a conditional tab button that renders when both `username` and `adminPassword` (or the derived `passwordKey`) are non-empty. Optionally trigger credential verification on mount of this tab by calling `/api/auth` to ensure stored credentials are still valid.
- Build a new `ProfileEditorTab` component under `src/components/dev/ProfileEditorTab.tsx` that receives the authenticated key, existing profile data, and callbacks for persistence.
  - Layout: reuse `SectionCard` wrappers. Include form controls for display name (editable), avatar URL, Markdown textarea with preview (`ReactMarkdown`), and link inputs (dynamic list capped at three entries).
  - Provide client-side validation with inline notices styled like existing Dev Tools alerts.
  - `Save` action posts to `/api/save-user-profile` with stored credentials; upon success, update local state and surface confirmation.
  - Add a read-only panel that surfaces recent edits derived from `buildProfileHistory` for context.

## Public Profile Surface
- Create `UserProfilePage` under `src/components/pages/UserProfilePage.tsx` using primitives from `components/common`.
  - Render avatar, name, Markdown bio, external links (with icons from Lucide), and a list of recent contributions from `devChangeLog` (limit to e.g. 5 entries with timestamps and affected substances).
  - Ensure layout matches the visual style guide (dark panels, fuchsia accents).
- Extend navigation types and router logic:
  - Update `AppView` and `parseHash`/`viewToHash` to handle `#/contributors/<key>` (fallback to 404-like panel if key missing).
  - Hook into `Header` or another discoverable area (e.g., Dev Tools or About page) to link to the active user’s profile.

## Access Control & Validation Notes
- Restrict profile editing strictly to the authenticated key returned by `/api/auth`; ignore client-supplied `key` fields and derive it server-side.
- Validate bio Markdown to prevent script injection—`react-markdown` should continue to use safe renderers, and we can disable HTML parsing.
- Sanitize and normalize URLs (force `https://`, reject javascript: schemes, etc.).
- Rate-limit profile updates server-side if spam becomes a concern (not required for MVP but keep in mind).

## Implementation Steps (Suggested Order)
1. Scaffold `userProfiles.json` with placeholder entries and add helper module (`userProfiles.ts`).
2. Update `AppView`, routing utilities, and create `UserProfilePage` to render data + edit history.
3. Extract shared GitHub commit helpers (if desired) and build `/api/save-user-profile` with validation + commit logic.
4. Add profile history helper leveraging `devChangeLog` data.
5. Implement `ProfileEditorTab` and integrate tab visibility/selection logic into `DevModePage`.
6. Wire up save flow, local state updates, and success/error notices.
7. Smoke-test hash routing, profile rendering, and successful save → GitHub commit.
8. Run `npm run build` and `npm run build:inline` before shipping.
9. Update `AGENTS.md` or other docs if new workflows warrant mention.

## Manual QA Checklist (post-implementation)
- Save credentials, open new Profile tab, and verify existing profile data loads.
- Update bio, avatar URL, and multiple links; ensure client-side limits (<=3 links) are enforced.
- Attempt to exceed limits or use invalid URLs; confirm validation prevents submission.
- Confirm save persists to GitHub (check updated `userProfiles.json`) and updates dev change log entry if implemented.
- Visit `#/contributors/<key>` to ensure profile displays Markdown, avatar, links, and edit history accurately.
- Clear saved credentials; verify Profile tab hides on reload.

## Open Questions
- Should non-ENV contributors (future accounts) share the same pipeline, or do we need a more general identity model later?
- Do we want to allow image uploads (requiring storage) or continue relying on externally hosted avatars?
- Is it acceptable to rely on `devChangeLog.json` for histories, or should we consume GitHub commit metadata directly for long-term accuracy?
