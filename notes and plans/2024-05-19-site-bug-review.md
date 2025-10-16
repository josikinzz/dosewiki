# dose.wiki Site Bug Review — 2024-05-19

## Findings

1. **High – Change log commits drop commit metadata** (`api/save-articles.js:136`)
   - `save-articles` serializes the new dev change-log entry *before* the GitHub commit exists, so `commit.sha` and `commit.url` remain empty strings in `devChangeLog.json`. The API response patches the entry in-memory, but the file pushed to `main` still contains the blank metadata.
   - Impact: downstream UIs (Dev Tools change log, contributor history, etc.) cannot link back to the real commit and have no reliable SHA for audit trails.
   - Fix: after `createCommit` returns, update the pending change-log entry with the real `commitSha`/URL prior to building the tree, or rebuild the serialized log with the populated commit fields before writing it to the repo.

2. **Medium – Invalid substance slugs silently fall back to LSD without correcting the route** (`src/App.tsx:105`, `src/components/layout/Header.tsx:20`)
   - Navigating to a nonexistent slug (e.g. `#/substance/not-real`) renders the LSD record via the fallback `DEFAULT_RECORD`, but `view.slug` stays `not-real`. The header’s “Substances” link and the hash in the address bar keep the invalid slug, so the UI suggests you are viewing a record that does not exist.
   - Impact: users see mismatched content/URL, and header navigation loops back to the bad slug instead of recovering.
   - Fix: detect missing records while resolving `activeRecord` and either redirect to `DEFAULT_SLUG` (updating `window.location.hash`) or surface a proper “Not found” state.
   - Status: Resolved — `src/App.tsx` now normalizes unknown substance slugs to the default record and replaces the hash with the canonical `/substance/lsd` route.

3. **Medium – Interactions card renders empty chrome when data is absent** (`src/components/sections/InteractionsSection.tsx:35`)
   - `InteractionsSection` always renders the section wrapper even when `group.items` is empty. Substances such as 4-Chloroethcathinone (no interaction data in `articles.json`) show a titled card with no body content.
   - Impact: confusing blank sections and uneven spacing in profiles without interaction guidance.
   - Fix: short-circuit the component when `interactions.length === 0`, or inject a friendly “No documented interactions” placeholder.

## Additional Notes

- `npm run build` completes, but Vite flags a 2.4 MB JS bundle. Consider splitting Dev Tools into a lazy chunk or tuning `build.rollupOptions.output.manualChunks` so public visitors avoid loading authoring tooling.
