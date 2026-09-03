# Next + Auth.js + Convex Contributor Guide

This project now has one primary application path: `Next.js` App Router in `src/app/`.

## Core Rules

- Public pages render through Next route segments in `src/app/`.
- Auth.js owns browser identity and session handling.
- `lib/auth/runtimePolicy.ts` owns active auth mode, provider readiness, Auth.js secret resolution, and editor credentials availability.
- Convex remains the live data source and business layer.
- Convex `memberships` is the source of truth for roles: `admin`, `editor`, `contributor`. A banned account carries `bannedAt` and resolves to `viewer`, which passes no floor.
- Local JSON files are backup or export artifacts, not the authoritative runtime source.

## Main Entry Points

- App shell: `src/app/layout.tsx`
- Auth config: `auth.ts`
- Middleware: `middleware.ts`
- Protected API handlers: `src/app/api/`
- Shared server GitHub write helpers: `lib/server/github/`
- Public Convex server reads: `lib/convex/serverClient.ts`, `lib/convex/publicData.ts`

## Public Route Work

- Prefer server components for public route framing and data loading.
- Use `lib/next/metadata.ts` for public metadata behavior.
- Add new crawlable routes under `src/app/`, not under a client-side router.

## Editor/Auth Work

Sign-in is username + password against the Convex `memberships` table; there
is no OAuth provider and no env-var password. The details, including seeding,
invites, resets, and the hashing scheme, live in
[agents/convex-credentials.md](agents/convex-credentials.md#sign-in-accounts).

- Accounts exist only through two paths. The first admins are seeded from a
  workstation with `scripts/auth/seed-admin-accounts.mjs`; everyone else
  redeems an invite an admin minted in `/dev/members` at `/invite?code=...`,
  choosing a username and password. The invite fixes the role (`editor` or
  `contributor`).
- Roles, bans, and password-reset links are managed in `/dev/members` by an
  admin. Admin itself is a stored role granted only by the seed script or an
  existing admin; the roster cannot grant or revoke it.
- `auth.ts` verifies the password with scrypt (`lib/auth/passwords.ts`) and
  re-reads the stored role on every JWT refresh, so a ban or role change lands
  on the next request. A failed membership read degrades the session to
  `viewer` rather than keeping the old role.
- Protect `/dev` through Auth.js session checks and role checks.
- Guard every protected route with `protectedRouteOperation({ auth: <floor> })`
  (`src/lib/http/protectedRouteOperation.ts`), which calls
  `requireRoleSession(floor)`. `contributor` is the lowest floor; routes at that
  floor then check ownership in Convex. Do not add a floor below it.
- Every route write names the session's `actorEmail`; Convex's `requireRole`
  resolves the role from the membership row, so a misconfigured route cannot
  escalate.
- Do not reintroduce password-only browser auth, OAuth providers, or Vercel
  `api/*.js` entrypoints.
- For Vercel previews or production, set `AUTH_SECRET` or Auth.js-backed routes
  will fail in production mode. Preview sign-in uses a real account; there is
  no preview-only credential.

## Data Work

- Treat `glad-minnow-656` as the sole Convex source of truth. Point every active
  read and write URL at it; do not mirror production into another deployment.
- Reuse existing schema helpers before introducing new cross-boundary validators.
- Keep Zod at real runtime boundaries rather than duplicating schemas unnecessarily.

## Commands

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
- `npm run lint`
- `npm run typecheck`

## Current Deferred Debt

- Some shared routing helpers still exist because Next client surfaces reuse them for internal path generation.
- End-to-end preview role verification still requires a real browser sign-in against the live Auth.js provider.
