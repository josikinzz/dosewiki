# Dev Tools Auth Investigation

_Last updated: 2025-10-16_

## Current Flow
- **Credential capture**: The Dev Tools landing card in `src/components/pages/DevModePage.tsx` stores the ENV username and password the contributor enters, persisting them to `localStorage` under `dosewiki-dev-password`. Saving does not hit the server, so invalid credentials can be stored without feedback.
- **Verification path**: The shared `verifyDevCredentials` callback (`DevModePage.tsx`, ~line 592) posts `{ username, password }` to `/api/auth`, which delegates to `verifyCredentials` in `api/_utils/passwords.js`. A successful response resolves with `{ authorized: true, key }`, and the canonical key is cached in component state as `passwordKey`.
- **Usage in flows**:
  - Commits require a fresh `verifyDevCredentials()` call before `/api/save-articles` runs; success updates the UI message to "Ready to commit as <KEY>".
  - The Profile tab is gated on `hasStoredCredentials` (non-empty fields). On first visit it auto-calls `verifyDevCredentials()`; the dedicated `ProfileEditorTab` repeats the check inside `handleSave` before posting to `/api/save-user-profile`.
- **Feedback today**: Until a verification succeeds, the only indicator is the helper text under the credential form. The "Profile" tab appears as soon as credentials are saved, even if they are wrong. Clearing fields and pressing Save removes the stored values and resets the state.

## Pain Points
- Saving credentials offers no immediate validation, so typos only surface when a commit/profile save fails.
- `hasStoredCredentials` is treated as "logged in", which can unlock UI (Profile tab) without real authentication.
- `passwordKey` and any success notices live only in component state; a page reload resets the "verified" indicator even if credentials remain in `localStorage`.
- Raw passwords are persisted client-side for convenience; there is no notion of session expiry, explicit logout feedback, or last verified timestamp.

## Options For A Clearer Login Experience

### 1. Verify-on-save auth panel (minimal changes)
- Trigger `verifyDevCredentials()` immediately after the user hits Save. Only persist to `localStorage` if `/api/auth` returns `authorized: true`.
- Surface a prominent badge (e.g., `Logged in as KEY • verified <timestamp>`) tied to `passwordKey` and store `lastVerifiedAt` in state/localStorage for display.
- Add a `Log out` button that clears stored credentials and state; keep existing commit/profile flows unchanged.
- Effort: Low. Keeps ENV key + password flow intact but gives instant validation and visible status.

### 2. Centralized DevAuth context with gated tabs
- Extract auth state into a `useDevAuth` context that exposes `{ isAuthenticated, key, lastVerifiedAt, login(), logout() }`.
- Gate Dev Tools tabs (profile, commit actions) on `isAuthenticated`. When credentials are saved, call `login()` which handles verification and stores a small session object (username, obfuscated password, timestamp).
- Show persistent header UI (e.g., status pill + last verified time + logout). Optionally auto-reverify on page load when credentials exist to restore `isAuthenticated`.
- Effort: Medium. Requires reshaping Dev Tools to consume the new context but keeps API surface identical and clarifies state globally.

### 3. Short-lived session token issued by `/api/auth`
- Extend `/api/auth` to return a signed session token (HMAC using server secret) alongside the canonical key when credentials validate. Store token client-side (preferably in `sessionStorage`).
- Subsequent actions (`/api/save-articles`, `/api/save-user-profile`) accept either `{ token }` or `{ username, password }`; client code sends token to avoid resending the password.
- Dev Tools UI can present a dedicated "Log in" button that exchanges the ENV credentials for the token, then clears the raw password from memory. Add expiry handling (`expiresAt` payload) so the UI prompts for re-login when needed.
- Effort: Medium/High. Provides clearest logged-in semantics and avoids persisted passwords, but introduces token validation logic server-side and wider client updates.

## Recommendation & Follow-ups
- Start with Option 1 to give contributors immediate feedback and a visible status indicator with minimal churn.
- If the team wants stronger separation between "saved credentials" and "logged in", plan the Option 2 refactor—this can coexist with Option 1 by reusing the verify-on-save behavior inside the new context.
- Evaluate Option 3 if storing raw passwords locally becomes a concern or if we need expiring sessions; it builds on Option 2's structure but changes the API contract.

## Suggested Next Steps
1. Decide whether instant verification (Option 1) is sufficient or if the team wants to invest in a full auth context/token flow.
2. For any chosen path, document the UX in `AGENTS.md` so contributors know how to log in/out and what the status indicators mean.
3. Once changes are implemented, ensure `npm run build` and `npm run build:inline` still succeed to keep the single-file export current.
