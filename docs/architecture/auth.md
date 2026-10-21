# Auth and roles

Auth.js owns browser identity and sessions. The Postgres `memberships` table owns roles. Authorization comes from a session plus the current membership row. A credential alone authorizes only a few scoped callers, listed under [Token-checked exceptions](#token-checked-exceptions).

## Where it lives

- `lib/auth/authOptions.ts` configures Auth.js. Its credentials provider checks a username and password against `memberships`, and its `jwt` callback re-reads the stored role on every refresh.
- `lib/auth/passwords.ts` hashes and verifies passwords with scrypt.
- `lib/auth/runtimePolicy.ts` resolves the Auth.js secret from `AUTH_SECRET`, then `NEXTAUTH_SECRET`, then a fallback under `NODE_ENV=development` only, and reports whether sessions are available.
- `src/lib/auth/roles.ts` defines the roles and what each one may do.
- `src/middleware.ts` gates `/dev` and other protected routes.
- `src/lib/http/protectedRouteOperation.ts` wraps each session-protected API route.
- `server/lib/auth.ts` resolves the actor and checks the role floor inside each Postgres handler.

## Roles

`src/lib/auth/roles.ts` defines six roles: `admin`, `editor_translator`, `editor`, `translator`, `contributor`, and `viewer`. Editor and Translator are independent capabilities. A banned account, or a session whose membership read fails, resolves to `viewer`, which passes no floor. `contributor` is the lowest floor a route can require.

## Accounts

Accounts come from two paths.

- `scripts/auth/seed-admin-accounts.mjs` seeds the first admins from a workstation. Only that script or an existing admin grants `admin`.
- Everyone else redeems an invite at `/invite?code=...` and chooses a username and password. An admin mints the invite in `/dev/people`, and the invite fixes one of the `MANAGED_ROLES`: `editor`, `translator`, `editor_translator`, or `contributor`.

An admin manages roles, bans, and password-reset links in `/dev/people`, beside each account's public contributor profile. The profile's membership email links the two. A ban or role change applies on the next request because the `jwt` callback re-reads the role.

## Protected routes

`protectedRouteOperation({ auth: <floor> })` calls `requireRoleSession(floor)` before the handler runs, and `auth` is a required option. Routes at the `contributor` floor then check ownership in the data backend. Every session route write passes the session's `actorEmail`, and `server/lib/auth.ts` checks the actor's current membership row, so a misconfigured route cannot escalate.

## Token-checked exceptions

These callers authenticate a credential in the handler instead of a session.

- `/api/dev/revalidate-article` accepts a bearer `citationEvidenceWrite` admin-intent token, checked by `validateAdminIntentToken`. `src/middleware.ts` lets only its POST past the editor session gate.
- The cron routes under `src/app/api/cron/` and `src/app/api/warm/route.ts` accept `CRON_SECRET` through `cronRoute` in `lib/http/cronAuthorization.ts`. `src/middleware.ts` lets the service cron GETs listed in `lib/http/serviceCronPaths.ts` past the editor session gate.
- `/api/public-cache/revalidate` runs on public hosts and accepts a body signed with the publication secret. It can only expire caches.
- The public intake routes take anonymous reader posts: `/api/article-feedback`, `/api/site-feedback`, `/api/glossary-feedback` (comments and reactions), `/api/trip-report-submissions`, and `/api/subscribe`. Each writes through `getPublicIntakeWriteCapability` in `lib/data/serverWriteCapability.ts`, which holds the server's `DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE`. The feedback and submission handlers check that token as the `publicIntakeCreate` intent. `mailingList:subscribe` checks no token itself. Its only caller is `/api/subscribe`, which answers 503 when the capability is missing. `mutationAsService` refuses any mutation outside `SERVICE_MUTATION_NAMES`: these creates, `mailingList:subscribe`, and the two publication-delivery mutations the cron calls.
- Workstation scripts call Postgres handlers with an admin-intent token. A call that names an `actorEmail` acts with that member's role. A call that names nobody resolves to `admin` in `server/lib/auth.ts`.

Adding another exception is a judgment call. Public source code grants no access to editorial systems and does not authorize data writes.

## Deployment secrets

Vercel previews and production need `AUTH_SECRET`. Preview sign-in uses a real account. There is no preview-only credential.
