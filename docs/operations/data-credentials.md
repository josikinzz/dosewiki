# Data credentials and write targets

This is the current authority for production data targets, credentials, write preconditions, expected results, and recovery. PlanetScale Postgres is the only active database backend.

## Authority and allowlist

A command is permitted to write production only when it is already in the repository's operator-write allowlist and the owner authorizes that exact operation. The inventory and guard implementation live in `scripts/lib/production-writer-inventory.mjs` and `scripts/lib/production-write-command.mjs`. Adding a guarded command does not grant production authorization and does not expand the allowlist.

Application writes remain role- and intent-scoped. Public service writes are limited to the existing create-only allowlist. In the native source contract, Public DoseWiki receives only `DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE`; Effect Index receives no data write credential and forwards intake to the approved receiver. Only the editor deployment may carry the general admin credential tier. This describes the required release configuration, not a claim that live variables have been renamed.

## Literal Postgres command ceremony

Preconditions for any remote Postgres command:

1. Read the command entry in `package.json` and its implementation.
2. Obtain authorization for the exact remote read scope. For a production write, additionally confirm the command is already allowlisted and obtain approval for the exact target and changes; a read authorization never grants a write.
3. Load credentials without printing or committing them.
4. Select Postgres explicitly and set an explicit target. Application fallback variables never select a privileged target.
5. Run the command's no-write or dry-run form and review its target, plan, counts, rejects, and recovery output.
6. For a separately approved write only, repeat the reviewed operation with every required confirmation flag. Read-only completion stops without mutation.

Use this shape, substituting the actual package command and the confirmation phrase printed by that command:

```bash
set -a && . ./.env.local && set +a
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL"
export POSTGRES_IMPORT_CONFIRM=<region>.pg.psdb.cloud

bun run <command> -- <operation-args> --dry-run --allow-remote
bun run <command> -- <operation-args> --write --allow-remote \
  --confirm-write=<operation-phrase> \
  --expected-deployment=<region>.pg.psdb.cloud/postgres
```

For commands that accept only a planning invocation rather than `--dry-run`, omit `--write` and follow the command's printed next step. Operation-specific confirmations remain additional requirements.

For a local rehearsal, use an explicit target:

```bash
DATA_BACKEND=postgres bun run <command> -- <operation-args> \
  --target postgres://localhost:5432/dosewiki
```

A non-loopback read also requires `--allow-remote` and `POSTGRES_IMPORT_CONFIRM=<host>`. Prefer `POSTGRES_POOLED_URL` for application-shaped reads and ordinary operators. Migrations use the fixed Drizzle configuration and direct connection owned by `drizzle.config.ts`; never forward arbitrary Drizzle arguments.

Expected result: the plan names the intended host/database, reports no unexplained rejects or mismatches, and the write result matches the reviewed plan. Stop on target drift, missing confirmation, partial failure, unexpected counts, or a frozen-write refusal. Do not bypass a refusal.

## Credentials and freeze

The native source reads `DATA_ADMIN_KEY` and the scoped `DATA_ADMIN_TOKEN_*` names declared in `server/lib/adminIntentTokens.ts`. That module owns the intent vocabulary. Each scoped token name preserves its intent suffix; no legacy-name fallback aliases exist.

Use the operation's scoped token when defined. The existing general-key fallback, where permitted by the intent policy, reads only `DATA_ADMIN_KEY`. Never copy credential values into docs, argv, logs, or committed files. Source edits do not change local secret files, provider environments, token values, or revocations.

Release must atomically pair the approved native artifacts and matching scoped configuration across application, cron, CI, and ordinary operator processes. Inventory each actual environment, approve its exact rename set and destination, retain a previous compatible artifact/configuration pair for rollback, and keep public and Effect Index credential isolation intact.

`DATA_WRITES_FROZEN=1` is authoritative across editor routes, sessionless auth writes, service writes, and operator clients. A frozen result is expected safety behavior. Only an explicitly authorized operational decision may reopen writes.

The Postgres runtime needs `REPLICATION_MEDIA_BASE_URL` for correct replication reads. Read-only public and Effect Index processes must not receive `DATA_ADMIN_KEY` merely to satisfy runtime startup. `lib/postgres/runtime/deploymentEnv.ts` owns this split. A signup receiver additionally requires `MAILING_LIST_IP_HASH_SECRET` and the shared limiter table from migration `0015_shared_signup_rate_limits`; missing storage or hashing configuration fails closed, not to a process-local allowance. An Effect Index relay and its receiver share `MAILING_LIST_RELAY_SECRET` so the receiver limits each relayed reader by a signed client address; without it the receiver limits the relay's own address.

## Schema migrations

`bun run postgres:migrate` is the only production schema path. Its implementation must require an explicit `--target` or `TARGET_POSTGRES_URL`, preserve `--allow-remote` plus `POSTGRES_IMPORT_CONFIRM` for non-loopback targets, use the fixed repository Drizzle config, and reject arbitrary forwarded arguments. Without `--write` it only prints the plan (`--dry-run` names that mode explicitly) and never starts Drizzle. Applying migrations takes `DATA_BACKEND=postgres`, an open freeze, and `--write --confirm-write=postgres-migrate --expected-deployment=<host/database>`; the plan prints the exact deployment value.

Preconditions: inspect generated migrations and `lib/postgres/migrations/meta/_journal.json`, run the migration's plan mode against the exact target, review pending migrations, and obtain production authorization. Expected result: only the reviewed pending migrations apply, followed by a clean schema verification. Recovery is the migration-specific forward repair or the owner-approved database recovery plan, never an ad hoc down migration.

Application receipts (migration readback, receiver-role privilege proof) are
retained outside this repository. A receipt proves only the environment it was
taken from; it never proves another environment or authorizes grants. Retain
additive schema on application rollback; never drop shared limiter state as an
improvised rollback. The pooled receiver role needs public-schema usage plus
SELECT, INSERT, UPDATE, and DELETE on `subscribeRateLimitBuckets`,
`mailingListSubscribers`, and `documentIds`.

## Nightly molecule reads

`.github/workflows/molecule-pack-nightly.yml` owns the source branch, schedule,
read-only secret/variable bindings and exact generated-pack Git write targets.
Do not infer live activation from this document or from configuration alone.
The database run must remain read-only with `DATA_WRITES_FROZEN=1`, while pack
publication is a separate Git mutation behind the repository deployment guard.

Before initial activation or any configuration or source-revision change, verify both GitHub values and prove that the dedicated reader authenticates without write or admin privileges. Configuration alone does not publish the Postgres-capable producer and its dependencies: review the exact source revision present on the workflow branch before authorizing a run. Workflow publication and dispatch require owner approval because the job can commit and push public pack outputs. Expected result is a read-only database run with the freeze engaged. Recovery is to disable the schedule and inspect its report; it has no database-write rollback.

## Remote build deploy token

The remote build workflow (see [security CI](security-ci.md#remote-build-workflow))
authenticates to Vercel with one token per GitHub environment. Provisioning it
is a human step:

- Create the token in Vercel with the narrowest scope the account offers (the
  team that owns the three projects, nothing wider). Vercel tokens cannot be
  restricted to "deploy but never alias", so the token is production-capable.
  The workflow's lack of an alias or promote step is what keeps it from
  promoting.
- Store it only as `VERCEL_TOKEN` in the GitHub environment for that surface,
  never in `.env.local`, argv, logs, or this file.
- Record here the token's scope, the environment it lives in, and the date it
  was created, without the value. Rotate it with the same record.

| Environment | Surface | Token scope | Created | Notes |
| ----------- | ------- | ----------- | ------- | ----- |
| `remote-build-public` | public | team `josies-projects`, no expiry | 2026-09-23 | token `github-remote-build-public`; `VERCEL_PROJECT_ID` is `dosewiki-public` |
| `remote-build-editor` | editor | team `josies-projects`, no expiry | 2026-09-23 | token `github-remote-build-editor`; `VERCEL_PROJECT_ID` is `dosewiki-admin` |
| `remote-build-effectindex` | effectindex | team `josies-projects`, no expiry | 2026-09-23 | token `github-remote-build-effectindex`; `VERCEL_PROJECT_ID` is `effectindex` |

Each `VERCEL_TOKEN` is created in the Vercel dashboard (the API refuses to mint
tokens from a CLI login session) and scoped to the team, not one project. The
CLI reads the user and team before any project call. A project-scoped token is
refused both, so `vercel pull` and `vercel deploy` fail with "Could not
retrieve Project Settings". The token has no expiry by owner decision, so
rotation is manual: revoke it under Account Settings, Tokens, create a
replacement with the same name and scope, and set it with
`gh secret set VERCEL_TOKEN --env <environment>`.

### Environment contents

`.github/workflows/remote-build.yml` reads exactly these values from the
selected environment:

| Name | Kind | Purpose |
| ---- | ---- | ------- |
| `VERCEL_TOKEN` | secret | Deploy token described above. It can create production deployments. |
| `VERCEL_ORG_ID` | secret | The Vercel team id |
| `VERCEL_PROJECT_ID` | secret | The project id for this surface only |
| `RELEASE_BUILD_ENABLED` | variable | Must be `true`. The same explicit gate the policy workflow uses. |

It reads no database URL, because Vercel builds the upload with the project's
own environment. `POSTGRES_POOLED_READONLY_URL` (secret) and
`REPLICATION_MEDIA_BASE_URL` (variable) belong to the `release-build` job in
`.github/workflows/vercel-policy-checks.yml`. That job builds on the runner
and resolves them from its selected environment or the repository. No
environment either workflow selects may hold `DATA_ADMIN_KEY`, any
`DATA_ADMIN_TOKEN_*`, or a Postgres URL with write grants.

### Environment protection

Read on 2026-10-20 with `gh api repos/josikinzz/dosewiki/environments`:
`remote-build-public`, `remote-build-editor`, and `remote-build-effectindex`
have no protection rules (no required reviewer, no wait timer) and no
deployment branch policy. The repository is public, and GitHub offers required
reviewers on public repositories on every plan. The earlier "private
repository" reason for having none no longer applies. Adding a reviewer is an
owner decision.

Until then, anyone with write access can dispatch a build of any ref into any
of these environments, including a `target: production` upload. That upload
holds no domain. Promotion stays the manual release ceremony in
[deployment](deployment.md#build-and-release-sequence). Re-read the live state
before you rely on it.

## Application rollback

Application rollback restores a previous compatible Postgres artifact and configuration while retaining current data. There is no alternate-backend rollback command in this checkout; PlanetScale Postgres is the only runtime. Any exceptional database recovery requires fresh owner authorization and all target, freeze, role and confirmation gates.

## Ownership and recovery pointers

- Executable commands: `package.json`
- Script catalog: [scripts README](../../scripts/README.md)
- Backend and target selection: `scripts/lib/data-client.ts`
- Remote Postgres guard: `scripts/postgres/targetGuard.ts` (the one explicit target resolver and loopback list: `--target` or `TARGET_POSTGRES_URL` only, a blank value is refused; guarded writer package entries run with `bun --no-env-file`)
- Write confirmation boundary: `scripts/lib/production-write-command.mjs`; `authorizeProductionWrite` runs the freeze, the confirmation and deployment match, then the remote-host guard, in that order, and returns the target a script builds its pool from. Every `productionBoundary` writer calls it with `--write` right after printing its command, before any upload, file write, or mutation, and `executeProductionWrite` calls it before its mutation. `scripts/lib/production-write-command-surface.test.mjs` fails a writer that only asserts the ceremony, and `node scripts/util/authorize-production-writers.mjs` adds the call
- Storage write boundary: `scripts/lib/storage-write-authorization.mjs`; `authorizeStorageWrite` runs the freeze, then requires `--write` and exact `--confirm-write`, `--confirm-plan`, `--confirm-target`, and `--confirm-bucket` values. Every `storageUploadEntrypoint` uploader calls it before its first upload and rechecks the freeze at each upload sink. The surface test fails an uploader that does not call it. Storage writes never take a Postgres target.
- Data-ops write boundary: `scripts/lib/data-ops-run-context.mjs`; `assertDataOpsWriteAllowed` runs the freeze, the dry-run and write-mode checks, the operation confirmation and deployment match, then the remote-host guard, and `createBatchTargetClient` in `scripts/batch/lib/batch-targets.mjs` calls it before it builds a client. Every `dataOpsBoundary` writer and data-ops guarded entrypoint runs it in write mode before its first database read, network call, or file write.
- Operator-write inventory: `scripts/lib/production-writer-inventory.mjs`
- Global freeze: `lib/runtime/dataWriteFreeze.ts`
- Deployment topology: [deployment](deployment.md)
