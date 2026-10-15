# Auth and roles

Auth.js owns browser identity and sessions. The Postgres `memberships` table owns roles. Authorization always comes from a session plus the current membership row, never from a credential alone.

## Where it lives

- `lib/auth/authOptions.ts` configures Auth.js. Its credentials provider checks a username and password against `memberships`, and its `jwt` callback re-reads the stored role on every refresh.
- `lib/auth/passwords.ts` hashes and verifies passwords with scrypt.
- `lib/auth/runtimePolicy.ts` owns the active auth mode, provider readiness, Auth.js secret resolution, and editor credential availability.
- `src/lib/auth/roles.ts` defines the roles and what each one may do.
- `src/middleware.ts` gates `/dev` and other protected routes.
- `src/lib/http/protectedRouteOperation.ts` wraps every protected API route.
- `server/lib/auth.ts` resolves the actor and checks the role floor inside each Postgres handler.

## Roles

`src/lib/auth/roles.ts` defines six roles: `admin`, `editor_translator`, `editor`, `translator`, `contributor`, and `viewer`. Editor and Translator are independent capabilities. A banned account, or a session whose membership read fails, resolves to `viewer`, which passes no floor. `contributor` is the lowest floor a route can require.

## Accounts

Accounts come from two paths.

- `scripts/auth/seed-admin-accounts.mjs` seeds the first admins from a workstation. Only that script or an existing admin grants `admin`.
- Everyone else redeems an invite at `/invite?code=...` and chooses a username and password. An admin mints the invite in `/dev/people`, and the invite fixes one of the `MANAGED_ROLES`: `editor`, `translator`, `editor_translator`, or `contributor`.

An admin manages roles, bans, and password-reset links in `/dev/people`, beside each account's public contributor profile. The profile's membership email links the two. A ban or role change applies on the next request because the `jwt` callback re-reads the role.

## Protected routes

`protectedRouteOperation({ auth: <floor> })` calls `requireRoleSession(floor)` before the handler runs, and `auth` is a required option. Routes at the `contributor` floor then check ownership in the data backend. Every route write passes the session's `actorEmail`, and `server/lib/auth.ts` checks the actor's current membership row, so a misconfigured route cannot escalate.

Vercel previews and production need `AUTH_SECRET`. Preview sign-in uses a real account. There is no preview-only credential.
