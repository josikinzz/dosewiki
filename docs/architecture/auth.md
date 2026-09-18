# Next + Auth.js contributor guide

This project has one primary application path: the Next.js App Router in
`src/app/`. PlanetScale Postgres is the production data authority. Authored
handlers live in `server/`; `lib/data/` owns public server adapters and
`lib/postgres/runtime/` owns native execution.

## Core Rules

- Public pages render through Next route segments in `src/app/`.
- Auth.js owns browser identity and session handling.
- `lib/auth/runtimePolicy.ts` owns active auth mode, provider readiness, Auth.js secret resolution, and editor credential availability.
- The Postgres `memberships` table is the source of truth for roles: `admin`, `editor`, and `contributor`. A banned account resolves to `viewer`, which passes no floor.
- Local JSON files are inputs, exports, or recovery artifacts only when their owning consumer says so.

## Main Entry Points

- App shell: `src/app/layout.tsx`
- Auth config: `lib/auth/authOptions.ts`
- Middleware: `src/middleware.ts`
- Protected API handlers: `src/app/api/`
- Shared server GitHub write helpers: `lib/server/github/`
- Public data adapters: `lib/data/publicData.ts`; active backend selection: `lib/postgres/runtime/backend.ts`

## Public Route Work

- Prefer server components for public route framing and data loading.
- Use `lib/next/metadata.ts` for public metadata behavior.
- Add new crawlable routes under `src/app/`, not under a client-side router.

## Editor/Auth Work

Sign-in is username plus password against the active backend's `memberships`
table; there is no OAuth provider and no env-var password. Account operations
remain actor- and intent-scoped. The production ceremony lives in
[data credentials](../operations/data-credentials.md#credentials-and-freeze).

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
  floor then check ownership in the active data backend. Do not add a floor below it.
- Every route write names the session's `actorEmail`; the backend role check
  resolves the current membership row, so a misconfigured route cannot escalate.
- Do not reintroduce password-only browser auth, OAuth providers, or Vercel
  `api/*.js` entrypoints.
- For Vercel previews or production, set `AUTH_SECRET` or Auth.js-backed routes
  will fail in production mode. Preview sign-in uses a real account; there is
  no preview-only credential.

## Data Work

- Set `DATA_BACKEND=postgres` for production operations and bind
  `TARGET_POSTGRES_URL` explicitly under the shared write ceremony.
- Use the native callable references, `/api/save-article`, and `DATA_ADMIN_TOKEN_*`
  credentials; do not restore historical aliases.
- Reuse existing schema helpers before introducing cross-boundary validators.
- Keep Zod at real runtime boundaries rather than duplicating schemas.

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
