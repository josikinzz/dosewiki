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

npm run <command> -- <operation-args> --dry-run --allow-remote
npm run <command> -- <operation-args> --write --allow-remote \
  --confirm-write=<operation-phrase> \
  --expected-deployment=<region>.pg.psdb.cloud/postgres
```

For commands that accept only a planning invocation rather than `--dry-run`, omit `--write` and follow the command's printed next step. Operation-specific confirmations remain additional requirements.

For a local rehearsal, use an explicit target:

```bash
DATA_BACKEND=postgres npm run <command> -- <operation-args> \
  --target postgres://localhost:5432/dosewiki
```

A non-loopback read also requires `--allow-remote` and `POSTGRES_IMPORT_CONFIRM=<host>`. Prefer `POSTGRES_POOLED_URL` for application-shaped reads and ordinary operators. Migrations use the fixed Drizzle configuration and direct connection owned by `drizzle.config.ts`; never forward arbitrary Drizzle arguments.

Expected result: the plan names the intended host/database, reports no unexplained rejects or mismatches, and the write result matches the reviewed plan. Stop on target drift, missing confirmation, partial failure, unexpected counts, or a frozen-write refusal. Do not bypass a refusal.

## Credentials and freeze

The native source reads `DATA_ADMIN_KEY` and the scoped `DATA_ADMIN_TOKEN_*` names declared in `server/lib/adminIntentTokens.ts`. That module owns the intent vocabulary. Each scoped token name preserves its intent suffix; no legacy-name fallback aliases exist.

Use the operation's scoped token when defined. The existing general-key fallback, where permitted by the intent policy, reads only `DATA_ADMIN_KEY`. Never copy credential values into docs, argv, logs, or committed files. Source edits do not change local secret files, provider environments, token values, or revocations.

Release must atomically pair the approved native artifacts and matching scoped configuration across application, cron, CI, and ordinary operator processes. Inventory each actual environment, approve its exact rename set and destination, retain a previous compatible artifact/configuration pair for rollback, and keep public and Effect Index credential isolation intact.

`DATA_WRITES_FROZEN=1` is authoritative across editor routes, sessionless auth writes, service writes, and operator clients. A frozen result is expected safety behavior. Only an explicitly authorized operational decision may reopen writes.

The Postgres runtime needs `REPLICATION_MEDIA_BASE_URL` for correct replication reads. Read-only public and Effect Index processes must not receive `DATA_ADMIN_KEY` merely to satisfy runtime startup. `lib/postgres/runtime/deploymentEnv.ts` owns this split. A signup receiver additionally requires `MAILING_LIST_IP_HASH_SECRET` and the shared limiter table from migration `0015_shared_signup_rate_limits`; missing storage or hashing configuration fails closed, not to a process-local allowance.

## Schema migrations

`npm run postgres:migrate` is the only production schema path. Its implementation must require an explicit `--target` or `TARGET_POSTGRES_URL`, preserve `--allow-remote` plus `POSTGRES_IMPORT_CONFIRM` for non-loopback targets, use the fixed repository Drizzle config, reject arbitrary forwarded arguments, and support a no-write plan before execution.

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

## Application rollback

Application rollback restores a previous compatible Postgres artifact and configuration while retaining current data. There is no alternate-backend rollback command in this checkout; PlanetScale Postgres is the only runtime. Any exceptional database recovery requires fresh owner authorization and all target, freeze, role and confirmation gates.

## Ownership and recovery pointers

- Executable commands: `package.json`
- Script catalog: [scripts README](../../scripts/README.md)
- Backend and target selection: `scripts/lib/data-client.ts`
- Remote Postgres guard: `scripts/postgres/targetGuard.ts`
- Write confirmation boundary: `scripts/lib/production-write-command.mjs`
- Operator-write inventory: `scripts/lib/production-writer-inventory.mjs`
- Global freeze: `lib/runtime/dataWriteFreeze.ts`
- Deployment topology: [deployment](deployment.md)
