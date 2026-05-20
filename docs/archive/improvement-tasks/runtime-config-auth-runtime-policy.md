# Runtime Config Auth Runtime Policy

## Files

- `auth.ts`
- `middleware.ts`
- `lib/auth/legacyCredentials.ts`
- `lib/auth/convexMemberships.ts`
- `src/app/sign-in/page.tsx`
- `src/lib/auth/requireEditorSession.ts`
- `.env.example`
- `README.md`
- `CLAUDE.md`
- `docs/next-auth-convex-contributor-guide.md`

## Problem

Auth runtime policy is split between `auth.ts`, `middleware.ts`, sign-in UI behavior, membership sync, and docs. `auth.ts` and `middleware.ts` duplicate the Auth.js secret fallback chain, provider availability is derived at module load from env vars, and the development-only credentials adapter is selected implicitly when GitHub OAuth is absent. Production requirements are described in docs, but there is no single executable Module that says which auth modes are allowed for local, preview, and production.

That makes the Auth.js Interface shallow. Callers and operators must know provider env aliases, secret fallback rules, development-only credential behavior, and Convex membership sync implications. The real policy is distributed across Implementation files instead of being named and tested at a seam.

## Proposed deepening opportunity

Create an auth runtime policy Module that resolves the active auth mode, required secrets, provider readiness, legacy credentials availability, and production restrictions. `auth.ts`, `middleware.ts`, the sign-in page, and protected route helpers should consume this policy instead of reading auth env vars directly.

The Module should make the development credentials adapter explicit: allowed only in development, never in preview/production, and visibly reported as the active local auth adapter. It should also centralize Auth.js secret resolution so middleware token reads and server session creation always share the same Interface.

## Benefits

- Module: turns Auth.js runtime policy into one Module shared by session creation, middleware, and UI.
- Interface: callers receive an auth mode and resolved secret policy instead of knowing env aliases and fallbacks.
- Implementation: provider detection, legacy adapter rules, production restrictions, and diagnostics live together.
- Depth: one policy Interface hides Auth.js, Convex membership, and local fallback details.
- Seam: middleware, sign-in UI, and route protection share a seam for auth behavior.
- Adapter: GitHub OAuth and legacy credentials become explicit adapters selected by policy.
- Leverage: preview/production can fail or warn consistently when `AUTH_SECRET` or GitHub OAuth values are missing.
- Locality: changing auth provider names, aliases, or fallback behavior is isolated to the policy Module.

## Test plan

- Add table-driven tests for auth policy resolution in development, preview, and production.
- Add tests that production rejects the legacy credentials adapter even when legacy password env vars are present.
- Add tests that `auth.ts` and `middleware.ts` resolve the same secret for a given env set.
- Add sign-in page tests for GitHub configured, GitHub missing, local credentials enabled, and production disabled states.

## Risk/rollout notes

- Preserve current local development fallback behavior while making it explicit in diagnostics.
- Keep existing provider env aliases during rollout to avoid breaking deployed environments.
- Introduce production enforcement as a Vercel preview warning before blocking builds or protected routes.
