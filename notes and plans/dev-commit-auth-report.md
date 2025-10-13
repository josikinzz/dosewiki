# Dev Commit Auth Report

_Last updated: 2025-10-13_

## Executive Summary
- Production commits from the Dev Tools editor still fail at `/api/auth` with HTTP 500, leaving the dataset locked despite working credentials; local development succeeds with the same secrets.
- The failure path consistently shows that the supplied username is recognised but `process.env[<USERNAME>]` resolves to `undefined` in Vercel’s Node runtime, causing `verifyCredentials` to return `false` and the handler to surface "Configuration error.".
- Front-end flows, credential persistence, and the GitHub commit pipeline remain intact—the blocker is the production function’s inability to see the configured environment variables for committer accounts.

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

## Current Production Behaviour (Unresolved)
- `/api/auth` responds with `500` for valid credentials (e.g., `username: "JOSIE"`), and console logs show `process.env.JOSIE: UNDEFINED` even though the variable is configured in Vercel.
- The UI shows `Authentication failed.` followed by the failure notice; `/api/save-articles` is never reached.
- The same credential pair succeeds locally (Vite dev server proxying to local Vercel emulation or within unit tests), confirming the logic path works when env vars resolve.
- Additional console noise (`Permissions-Policy` warnings, missing Chrome extension assets) is unrelated to the auth failure.

## Diagnostics to Date
1. Reworked the UI to collect username + password, enforce trimmed inputs, and show the resolved key post-auth.
2. Refactored server helpers to stop scanning `process.env` indiscriminately and rely on `verifyCredentials`.
3. Added verbose logging in `/api/auth` to print username validity and env lookup status.
4. Extracted `parseBody` helper to ensure both `/api/auth` and `/api/save-articles` parse JSON payloads consistently (avoiding earlier `parseBody is not defined` crashes).
5. Relaxed changelog requirements and error states so auth can be tested independently of article edits.
6. Introduced `api/test-env` to verify env propagation from Vercel.
7. Despite these changes, production redeploys continue to show `process.env[username]` as `undefined` and return `500 Configuration error.`.
8. Implemented a follow-up fix (2025-10-13) that removes the `getEnv()` proxy wrapper so every helper reads `process.env` directly; this is ready for deployment but still awaiting production validation.

## Open Questions & Risk Areas
- Are the username env variables defined at the _project_ level but not the _production_ environment/branch? Need confirmation from Vercel dashboard and redeploy logs.
- Could secrets be scoped to edge functions or missing because the function runs on a build that predates the new vars? Verify last successful redeploy timestamp v. secret updates.
- Does Vercel’s Node runtime require `VERCEL_ENV=production` or other settings for function-level secrets to load? No evidence yet, but worth cross-checking.
- `api/test-env` currently checks only the default keys; if credentials rely on `DEV_PASSWORD_KEYS`, the endpoint may offer a false negative.
- `save-articles` defines a local `parseBody` shadowing the shared helper, which is redundant but harmless; keep an eye on diverging behaviour if one implementation changes.

## Recommended Next Steps
1. **Confirm secrets in production**: Inspect Vercel dashboard → Project → Settings → Environment Variables → Production. Ensure each username key (e.g., `JOSIE`) is defined and has the expected value.
2. **Trigger redeploy after secret audit**: Use "Redeploy" on the latest production deployment once secrets are verified; note the timestamp to correlate with logs.
3. **Pull function logs after a failed attempt**: Using `vercel logs dose.wiki/api/auth --since <timestamp>`, capture the full log block to confirm the debug statements still report missing env values.
4. **Hit `/api/test-env` in production**: Validate that the expected keys show `EXISTS` with non-zero length. If they report `UNDEFINED`, re-save secrets or check for case mismatches.
5. **Add temporary log for `DEV_PASSWORD_KEYS`** (optional): Extend `api/auth.js` to log the raw value during investigation, then remove once resolved.
6. **Document verified resolution**: After fixing env propagation, remove `api/test-env.js`, trim noisy logging, and update this report with the confirmed remediation steps.
7. **Deploy direct `process.env` access fix**: Redeploy with the updated `api/_utils/passwords.js`, test `/api/auth`, and record whether the change resolves the `process.env` visibility issue.

## Related Files
- Front-end credential + commit UI: `src/components/pages/DevModePage.tsx`
- Auth helper utilities: `api/_utils/passwords.js`, `api/_utils/parseBody.js`
- Auth endpoint: `api/auth.js`
- GitHub commit pipeline: `api/save-articles.js`
- Env verification endpoint (temporary): `api/test-env.js`
- Vercel function config: `vercel.json`
