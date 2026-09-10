# Convex credentials

Read this before running any script that writes to Convex. It exists because the
same failure keeps recurring: a write is rejected, the rejection looks like a
missing key, a new key gets minted and added to `.env.local`, and the pile of
keys grows without the write ever succeeding.

## Run the doctor first

```bash
npm run convex:doctor                 # inspect the resolved write target
npm run convex:doctor -- --url=https://glad-minnow-656.convex.cloud
```

It is read-only, prints no secret values (only SHA-1 prefixes), and answers the
three questions that actually matter: which deployment am I pointed at, which
credential will be sent, and will that deployment accept it.

## Function drift: does the deployment even have the function?

A credential problem is not the only invisible failure. **The app build used to
never deploy Convex functions.** `vercel.json` now runs `bun install` /
`bun run build:vercel`; its wrapper (`scripts/deploy/vercel-build.mjs`) publishes
functions only when the `dosewiki-admin` Production build receives the production
`CONVEX_DEPLOY_KEY`. Without that key, it verifies the checkout and builds but
cannot compare or update the live function inventory. See
[deployment.md](deployment.md) for the build branches.

**Historical incident (2026-07-30):** `substanceIndex:setArticleField` existed in
the checkout but not on `glad-minnow-656`. The review portal's inline
click-to-edit failed in production for a day even though local checks, the app
build, and the Vercel deployment all passed.

**Runtime probing cannot diagnose it.** Production redacts all error detail — a
missing function and a bad argument both come back as a bare `Server Error`:

```
{"status":"error","errorMessage":"[Request ID: …] Server Error"}
```

Static comparison of two inventories is the only thing that works.

```bash
npm run convex:check-functions -- --prod            # compare with glad-minnow-656
npm run convex:check-functions -- --checkout-only   # no credential needed
npm run convex:check-functions -- --prod --json
```

Use `--prod` for every live comparison. `npm run convex:doctor` prints the same
comparison as its final section without a non-zero exit. Both commands are
read-only: they run `convex function-spec`, never `convex deploy` or a mutation,
and print function names only.

### What it reports

| Direction | Meaning | Exit |
| --- | --- | --- |
| BROKEN | the app calls it, the deployment does not have it | fails |
| DANGLING | the app calls it, this checkout does not define it | fails |
| UNDEPLOYED | in the checkout, absent from the deployment, nothing calls it | warns |
| AT RISK OF SILENT DELETION | live on the deployment, absent from the working tree | warns |
| VISIBILITY CHANGED | public/internal differs between the two | warns |

The last one matters because `convex deploy` publishes the **working tree**, not
git HEAD, so anything live but absent from the tree is deleted by the next
deploy — see [deployment.md](deployment.md). Pass `--strict` to fail on warnings
too, which is the right setting immediately before a production deploy.

### When to run it

- Before `npm run convex:deploy -- --prod`, run the live comparison with
  `--strict`.
- After any deploy, to confirm the deployment now matches.
- When a UI action fails in production with a bare `Server Error` and works
  locally. That symptom is this bug until proven otherwise.

### Which key reads the deployment

A deploy key is bound to one deployment, and the Convex CLI resolves its target
from the key **ahead of** `--prod` and `CONVEX_DEPLOYMENT`. The production drift
check uses `CONVEX_DEPLOY_KEY_PROD`.

Trust only the `url` field in the `function-spec` response. It must identify
`glad-minnow-656`. If it identifies any other deployment, stop and fix the
credential or environment before continuing. In particular,
`enchanted-echidna-791` is retired; seeing it is a wrong-target result, not a
valid dev check.

### CI coverage

`.github/workflows/vercel-policy-checks.yml` has two branches:

- **Call-site integrity** (`--checkout-only`) always runs without a credential.
  It catches a call site naming a function this checkout does not define. This
  is the static coverage for untyped string names in
  `lib/convex/publicData.reads.ts`; typecheck cannot see them.
- **Function drift against production** runs only when the repository has
  `CONVEX_DEPLOY_KEY_PROD`. Without that secret, the step uses
  `--skip-without-credentials`, prints `SKIPPED`, and exits 0. Treat that result
  as an unenforced check, not a pass.

When the secret is absent, run
`npm run convex:check-functions -- --prod` locally before shipping any caller of
a new Convex function.

## The rule that causes the confusion

**An admin token is only valid on the deployment where it was configured.** The
token is checked inside the Convex function against that deployment's own
environment (`convex/lib/adminIntentTokens.ts`), not against anything local. A
local token that has drifted or belongs to another deployment authenticates
locally and is then rejected by the mutation. The authorization error can look
like a missing key, but minting another local value does not repair the mismatch.

The authoritative value is the deployment's own:

```bash
bunx convex env get CONVEX_ADMIN_KEY --prod
```

Minting a new key does not help unless you also set it on the deployment.

## Who a write acts as

The admin key only proves the caller is our server or a workstation. It never
decides the role. `requireRole(ctx, args, floor)` in `convex/lib/auth.ts` is
the one write gate and resolves the actor from `actorEmail`:

- Server routes acting for a signed-in user name `actorEmail`. The client
  returned by `getServerConvexWriteCapability` (`ServerConvexWriteClient` in
  `lib/convex/serverWriteCapability.ts`) rejects ordinary mutations and actions
  without a non-empty actor before sending them. The role comes from that
  email's membership row, and a banned member is refused at every floor.
- Public feedback and trip-report intake have no authenticated user to name.
  Their three create mutations use the client's allowlisted
  `mutationAsService` path, then authenticate the server token inside Convex.
- Scripts run headless as admin. A server-key call with no `actorEmail` is a
  workstation or Convex-environment script and resolves to admin.
- No email pattern grants admin. The old `@local.dose.wiki` shortcut is gone;
  an actor without a membership row has no role, whatever the address.

## Sole Convex target

All local, development, Vercel Preview, and Production reads and writes target:

| Role | Deployment |
| --- | --- |
| Live data and functions | `glad-minnow-656` |

Do not mirror production into a second deployment or route a local or preview
environment elsewhere. `enchanted-echidna-791` is retired.

The runtime resolution rules live in `lib/convex/runtimeTargets.ts`; script
resolution and write guards live in
`scripts/lib/data-ops-run-context.mjs` and
`scripts/lib/production-write-command.mjs`, and every script obtains its client
from `scripts/lib/data-client.ts`. Configure every resolved URL to
`https://glad-minnow-656.convex.cloud`. Privileged scripts must receive that URL
explicitly through `TARGET_CONVEX_URL` or `--target-url`; do not rely on a browser
or compatibility fallback to select a write target.

### Postgres backend (migration rehearsals)

With `DATA_BACKEND=postgres` the same scripts run their Convex functions
in-process against Postgres (`lib/postgres/runtime/client.ts`). The credential
model is unchanged: `CONVEX_ADMIN_KEY` and the scoped `CONVEX_ADMIN_TOKEN_*`
variables are read from the process environment exactly as the Convex
deployment reads its own, so a token that works locally works on Postgres. What
changes is the target:

| Convex | Postgres equivalent |
| --- | --- |
| `--target-url` or `TARGET_CONVEX_URL` | `--target <url>` or `TARGET_POSTGRES_URL` |
| `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL` (ignored for writes) | `POSTGRES_POOLED_URL`, `POSTGRES_DIRECT_URL` (ignored for writes) |
| `--expected-deployment=glad-minnow-656` | `--expected-deployment=<host>/<database>` |
| HTTPS `.convex.cloud` host check | `--allow-remote` plus `POSTGRES_IMPORT_CONFIRM=<host>` for any non-loopback host |

`npm run postgres:check-env-isolation` asserts that a `VERCEL_ENV=preview`
environment cannot reach a production writer through a fallback variable on
either backend. Run it after touching either guard module.

## Wrong-target and split detection

Stale environment variables can still make the editor browser read one
deployment while its server writes another. That creates two failures:

- optimistic-concurrency writes report a false "changed since you loaded it"
  conflict because the comparison runs against different stored data;
- full editor saves can report success after writing the wrong deployment.

`/dev` and `/review` therefore refuse to render when the browser-read and
privileged-write deployments differ. The comparison runs in the server component
so the privileged URL never reaches the browser; only deployment names appear in
the error. `npm run convex:doctor` reports the same result under **Editor surface
read/write alignment**, and `/api/editor-config-health` includes it in
`diagnostics.warnings`.

| Resolved configuration | Verdict |
| --- | --- |
| Every configured Convex URL resolves to `glad-minnow-656` | aligned |
| Browser-read and privileged-write URLs resolve to different deployments | split — editor and review refuse to render |
| Any active URL resolves to a deployment other than `glad-minnow-656` | wrong target — stop |
| No privileged write target or admin credential is configured | read-only |

Fix a split or wrong target by pointing every active Convex URL at
`glad-minnow-656`; bypassing the refusal does not make the configuration safe.

## Intent-scoped tokens

Each data operation asks for its own scoped token. When that token is absent,
most operations use `CONVEX_ADMIN_KEY` as a compatibility fallback. The doctor
shows the credential actually selected for each intent and whether production
accepts it.
`generatedPublicationWrite` is the exception: its publication boundary requires
the scoped token and rejects the legacy admin key.

| Intent | Environment variable |
| --- | --- |
| `editorArticleWrite` | `CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE` |
| `publicIntakeCreate` | `CONVEX_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE` |
| `promptMigrationWrite` | `CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE` |
| `quoteMigrationWrite` | `CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE` |
| `profileMediaWrite` | `CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE` |
| `replicationMaintenance` | `CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE` |
| `articleSourceMigration` | `CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION` |
| `productionSync` | `CONVEX_ADMIN_TOKEN_PRODUCTION_SYNC` |
| `citationEvidenceWrite` | `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE` |
| `citationEvidenceReview` | `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW` |
| `generatedPublicationWrite` | `CONVEX_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE` |
| `reagentTestImport` | `CONVEX_ADMIN_TOKEN_REAGENT_TEST_IMPORT` |

The registry is duplicated on both sides — `scripts/lib/data-ops-run-context.mjs`
(client) and `convex/lib/adminIntentTokens.ts` (server). Adding an intent means
editing both.

The public DoseWiki project receives only `publicIntakeCreate`, never an
editorial admin key. Its create-only factories require that scoped variable and
do not fall back to `CONVEX_ADMIN_KEY`. Convex accepts it only for creating trip
report submissions, article feedback, and site feedback. It cannot list private
queues, moderate submissions, or publish content. Existing trusted admin
credentials remain valid for those creates during deployment cutovers.
Effect Index remains credential-free.

## Fixing a rejected write

1. Run the doctor against production:
   `npm run convex:doctor -- --url=https://glad-minnow-656.convex.cloud`.
   Confirm the reported target is `glad-minnow-656`.
2. If the verdict is REJECTED, take the value accepted by that deployment:
   `bunx convex env get CONVEX_ADMIN_KEY --prod`.
3. Copy that value into the matching local variable. For an intent-scoped token,
   configure the same value on the deployment and in the caller:
   `bunx convex env set CONVEX_ADMIN_TOKEN_<INTENT> <value> --prod`.
4. Re-run the doctor and confirm both the production target and an OK credential
   verdict before running the write.

Do not add another local key until the doctor has confirmed the target. An
unverified new value is indistinguishable from the one that just failed.

## Write guardrails

Production writes additionally require, per `scripts/lib/production-write-command.mjs`:

- `--write`
- `--confirm-write=<operation-name>`
- `--expected-deployment=<fingerprint>` matching the resolved target
- the operation's own confirm flag where one exists (e.g. `--confirm-audio-import`)

Every script's default is a dry run. Dry runs need no credential and are the
correct way to inspect a plan.

## Sign-in accounts

Editor sign-in is username + password. Each account is a `memberships` row
carrying `username`, a scrypt `passwordHash` (`lib/auth/passwords.ts`, format
`scrypt$N$r$p$saltB64$hashB64`), and its `role`. The Auth.js server callback
(`auth.ts`) looks the row up through `memberships:getCredentialsByUsername`
with `CONVEX_ADMIN_KEY`, verifies the password, refuses banned rows, and stamps
`lastSeenAt` via `memberships:touchSignIn`. The stored role is the session
role; no env var and no email pattern grants admin.

Two details of that callback are deliberate:

- An unknown username still costs one scrypt derivation. `authorizeCredentials`
  verifies against `UNMATCHABLE_PASSWORD_HASH` (well formed, all-zero digest)
  when there is no row or no hash, so response time does not reveal whether an
  account exists.
- Every JWT refresh re-reads the role through `memberships:getByEmail`, a
  projection (`email`, `username`, `role`, `name`, `image`, `bannedAt`) that
  never carries a hash or reset token. A banned row, a missing row, and a
  failed read all resolve to `viewer`: the session fails closed and regains its
  role on the next successful refresh.

**Hashing deviation.** The permissions spec asked for argon2id or bcrypt. The
app uses Node's built-in scrypt (`N=16384, r=8, p=1`, 16-byte salt, 64-byte
key) because it needs no native dependency on Vercel and the parameters travel
with each hash, so they can be raised without invalidating rows. Do not swap
the scheme without a migration that rehashes on next sign-in.

**Admin is a stored role, not a list.** The permissions spec described an admin
allow-list that would demote any `admin` row outside it on the next sign-in.
That list was not implemented and there is no plan to add one. `admin` is
granted only by `scripts/auth/seed-admin-accounts.mjs`
(`memberships:setAdminAccount`) or by an existing admin editing the row
directly on the deployment; the roster's `setRole` validator has no `admin`
value and `requireManagedTarget` refuses every admin row, so the Members tab
can neither grant nor revoke it. Auditing who holds admin means reading the
`memberships` table by role, not an env var.

The only auth-specific env the Next app needs is `AUTH_SECRET` (session
signing). `ADMIN_PASSWORD`, `DEV_PASSWORD_KEYS`, `AUTH_ADMIN_EMAILS`, and the
GitHub OAuth variables are retired; the doctor lists any that are still set so
they can be removed.

### Seeding the first admins

Accounts are normally created by invitation. The very first admins (and any
admin whose password must be reset from a workstation) are seeded with:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  node scripts/auth/seed-admin-accounts.mjs --write \
    --confirm-write=seed-admin-accounts --expected-deployment=glad-minnow-656
```

The script uses the shared production-write boundary: without `--write` it
prints the target and exits, and the confirmation and deployment flags are
required. It needs `TARGET_CONVEX_URL` (or `--target-url=`) and
`CONVEX_ADMIN_KEY` from the environment or `.env.local`; the ambiguous
`CONVEX_URL` fallbacks are refused. It prompts for username, email, display
name, and password (hidden, entered twice, minimum 12 characters), hashes the
password locally with `scripts/auth/password-hash.mjs` (the same scheme the app
verifies against), and calls `memberships:setAdminAccount`. Re-running for an
existing username rotates that password and forces the role to `admin`; an
existing email-only row gains the username instead of being duplicated. Leave
the username blank to finish. Passwords are never read from env, files, or
argv.

### Retiring OAuth-era viewer rows

The retired OAuth sign-in minted `viewer` rows for anyone who signed in. They
grant nothing and have no username. Delete them once, after the admins are
seeded:

```bash
bunx convex run memberships:retireViewerMemberships '{"apiKey":"<CONVEX_ADMIN_KEY>"}' --prod
```

It deletes only rows with role `viewer` and no `username`, and reports the
count. Rows that already carry a username are accounts and are kept whatever
their role.

### Roster, roles, bans, and password resets

Everything after seeding happens in `/dev/members` (admin only). The tab reads
`memberships:listRoster` through `GET /api/dev/members` (a projection with no
hashes or tokens) and writes through `POST /api/dev/members/{role,ban,unban,reset}`,
each passing the session's `actorEmail` so `requireRole` decides at the admin
floor. Convex refuses three targets whatever the route says: an admin row (use
the seed script), the actor's own row, and, for roles, anything but `editor`
or `contributor` (the validator has no `admin` value).

A password reset is a one-time link. The reset route draws 32 random bytes,
stores only their sha256 in `resetTokenHash` with a one-hour
`resetTokenExpiresAt` (index `by_reset_token_hash`), and returns
`/reset-password?token=<hex>` exactly once; the tab shows it with a copy
button. A banned member gets no link (`MEMBER_BANNED`): unban first. The public
page posts `{ token, password }` to `POST /api/reset-password`, which shares
the sign-in rate limit, validates with `validateNewPassword`, hashes with
`hashPassword`, and calls `memberships:consumePasswordReset` with the server
key alone (no session exists yet). That mutation clears the token fields, so a
link dies on first use or after the hour, and it refuses a link whose member
was banned after it was issued, so a ban is never undone by an unexpired link.
An admin who needs a reset re-runs the seed script for their own username.

### Invites

Invites are the only way an account is created. An admin mints one in
`/dev/members` (`POST /api/dev/invites`, session actor at the admin floor):
the route draws 24 random base32-style characters, shown once as
`xxxx-xxxx-xxxx-xxxx-xxxx-xxxx`, and stores only the sha256 of the
normalized code (lowercase, dashes stripped) in `inviteCodes` with the role
(`editor` or `contributor`), expiry (default 7 days), and use count (default
1). `GET /api/dev/invites` lists rows with a derived status (`active`,
`expired`, `exhausted`, `revoked`) and never the hash; `POST
/api/dev/invites/{id}/revoke` refuses a fully redeemed code. The public page
`/invite?code=...` posts `{ code, username, password, email?, name? }` to
`POST /api/invite/redeem`, which shares the sign-in rate limit, validates the
username (`lib/auth/usernamePolicy.ts`) and password, hashes both, and calls
`inviteCodes:redeem` with the server key alone. That mutation checks the
code, then refuses a taken username or email before it inserts the
membership (role from the code, `invitedBy`, `inviteCodeId`) and appends the
redemption; without an email the row is keyed `<username>@members.dose.wiki`.
The page then signs in with the new credentials. `/invite` and `/api/invite`
live on the editor host like sign-in.
