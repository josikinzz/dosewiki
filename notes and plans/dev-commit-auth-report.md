# Dev Commit Auth Report

_Last updated: 2025-10-13_

## Executive Summary
- Production authentication now succeeds end-to-end after redeploying with the direct `process.env` access patch and explicit `.js` imports for the shared utilities; Dev Tools commits are working in production again.
- Root cause: Vercel’s Node runtime could not resolve `./_utils/passwords` without a `.js` extension, emitting `ERR_MODULE_NOT_FOUND` and short-circuiting the handler before env reads occurred; the earlier `getEnv()` proxy also masked the issue.
- Debug logging and `api/test-env` remain in place for short-term monitoring; plan to remove them once the team is satisfied the regression is fully resolved.

## System Overview
The Dev Tools “Save to GitHub” feature is split across a React front-end surface and two serverless API routes deployed on Vercel.

- **Front-end surface** – `src/components/pages/DevModePage.tsx`
  - Credentials UI captures `username` + `password`, stores them in `localStorage` under `dosewiki-dev-password`, and echoes the active key when verification succeeds.
  - `handleSaveToGitHub` validates JSON syntax, calls `/api/auth` with the saved credentials, and only proceeds to `/api/save-articles` after a positive auth response.
  - Notices guide editors through saving drafts, verifying credentials, and handling commit errors.

- **Serverless API**
  - `api/auth.js` verifies the provided credentials against environment variables via `verifyCredentials` from `api/_utils/passwords.js`.
  - `api/save-articles.js` re-validates the credentials, serialises `articles.json` + `devChangeLog.json`, and creates/direct-pushes commits to GitHub using the app token in `GITHUB_TOKEN`.
  - Shared helpers live in `api/_utils/parseBody.js` (lightweight JSON parser) and `api/_utils/passwords.js` (username registry, env lookups, and credential verification).

## Detailed Flow
### 1. Credential Capture & Validation
- `handleCredentialsSave` trims user input, persists `{ username, password }` to `localStorage`, and clears saved data when both fields are emptied.
- `handleSaveToGitHub` enforces that both fields are present and the draft JSON is valid before contacting the backend.
- On successful `/api/auth` response, the UI caches the returned key, shows "Verified as <KEY>", and proceeds to the commit request; failures raise inline notices and abort the commit.

### 2. `/api/auth` Implementation (`api/auth.js`)
- Accepts `POST` with JSON `{ username, password }` and rejects other methods with `405`.
- Logs diagnostic detail (method, raw values, length, valid username list, `process.env` lookup results).
- Valid usernames come from `getValidUsernames()`, combining the hard-coded allowlist (`ADMIN_PASSWORD`, `ZENBY`, `KOSM`, `COE`, `JOSIE`, `WITCHY`, `ARCTIC`) with any comma-separated extras supplied via `DEV_PASSWORD_KEYS`.
- `verifyCredentials(username, password)` trims both values, ensures the username is on the allowlist, and does a direct `process.env[username]` equality check.
- Failure paths:
  - Unknown username → `401 Invalid username.`
  - Username present but env missing → `500 Configuration error.` (current production symptom)
  - Password mismatch → `401 Invalid password.`
  - Unexpected exceptions bubble to a `500` with the captured stack trace.

### 3. `/api/save-articles` Implementation (`api/save-articles.js`)
- Repeats credential validation using the same helper to guard the commit flow even after `/api/auth` succeeds.
- Requires `GITHUB_TOKEN`, the incoming `articlesData`, and optionally `changedArticles`, `changelogMarkdown`, and `commitMessage`.
- Builds a new change-log entry (with `submittedBy: username`, timestamp, and the provided markdown) and prepends it to `src/data/devChangeLog.json` (capping at 250 entries).
- Uses the GitHub REST API to:
  1. Fetch the current `main` ref and base tree.
  2. Create blobs for the updated dataset and change log.
  3. Create a tree pointing to the new blobs.
  4. Create a commit with author `dose.wiki Dev Editor` and the supplied message.
  5. Update the `main` ref (non-forced) to the new commit SHA.
- Responds with `{ success, commitSha, commitUrl, submittedBy, entry }`; the front-end surfaces the link and pushes the entry into the Dev Tools change-log tab.
- Any GitHub API error returns `500` with the message from GitHub for quicker debugging.

### 4. Environment & Deployment Assumptions
- **Required secrets**
  - Commits: `GITHUB_TOKEN` with repo write scopes.
  - Auth usernames: one env variable per username (e.g., `JOSIE=<password>`). Optional extras via `DEV_PASSWORD_KEYS`.
- **Runtime**
  - Vercel Node functions (see `vercel.json`) with 1024 MB memory, 10s max duration.
  - No edge runtime; full Node environment expected, so direct `process.env` access should work.
- **Testing aid**
  - `api/test-env.js` enumerates the default username keys, reporting length metadata to confirm exposure. It does _not_ inspect extra keys declared via `DEV_PASSWORD_KEYS`.

## Current Production Behaviour
- `/api/auth` now returns `200 { authorized: true, key: <username> }` for configured credentials; the subsequent `/api/save-articles` call completes and pushes commits to GitHub.
- Front-end notices display "Verified as <KEY>" followed by the commit confirmation, matching the expected UX.
- Server logs confirm the explicit `.js` imports resolved `ERR_MODULE_NOT_FOUND`; env lookups report `process.env.<KEY>: EXISTS` for the tested accounts.
- Remaining console noise (`Permissions-Policy`, Chrome extension 404s) persists but is orthogonal to auth.

## Diagnostics to Date
1. Reworked the UI to collect username + password, enforce trimmed inputs, and show the resolved key post-auth.
2. Refactored server helpers to stop scanning `process.env` indiscriminately and rely on `verifyCredentials`.
3. Added verbose logging in `/api/auth` to print username validity and env lookup status.
4. Extracted `parseBody` helper to ensure both `/api/auth` and `/api/save-articles` parse JSON payloads consistently (avoiding earlier `parseBody is not defined` crashes).
5. Relaxed changelog requirements and error states so auth can be tested independently of article edits.
6. Introduced `api/test-env` to verify env propagation from Vercel.
7. Despite these changes, production redeploys continued to show `process.env[username]` as `undefined` and return `500 Configuration error.` before the final fix.
8. Implemented a follow-up fix (2025-10-13) that removes the `getEnv()` proxy wrapper so every helper reads `process.env` directly; deployed alongside the import corrections.
9. Investigated production error `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_utils/passwords'` and updated server imports to reference `./_utils/passwords.js` (ESM requires explicit extensions) before redeploying.
10. Post-deploy verification (2025-10-13): `/api/auth` + `/api/save-articles` succeed in production, `process.env` debug logs show populated credentials, and Dev Tools commits land on `main` as expected.

## Open Questions & Risk Areas
- Debug logging in `api/auth.js` is still verbose; keep it temporarily for monitoring but plan to prune once confidence is high.
- `api/test-env.js` remains deployed; leaving it too long could expose unnecessary surface area—schedule removal after a short soak period.
- Only a subset of credentials has been re-tested; run through the full username roster (including any `DEV_PASSWORD_KEYS` entries) to ensure parity.

## Recommended Next Steps
1. **Audit remaining credentials**: Log in with each configured username (including any `DEV_PASSWORD_KEYS` additions) to confirm parity.
2. **Retire debug aids**: When comfortable, remove the noisy console logging from `api/auth.js` and delete `api/test-env.js`, then redeploy.
3. **Add regression guardrails**: Consider adding a lightweight integration test or deployment smoke check that hits `/api/auth` with a mock credential to catch module resolution regressions early.

## Related Files
- Front-end credential + commit UI: `src/components/pages/DevModePage.tsx`
- Auth helper utilities: `api/_utils/passwords.js`, `api/_utils/parseBody.js`
- Auth endpoint: `api/auth.js`
- GitHub commit pipeline: `api/save-articles.js`
- Env verification endpoint (temporary): `api/test-env.js`
- Vercel function config: `vercel.json`
