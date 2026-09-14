# Data credentials and write targets

This is the current authority for production data targets, credentials, write preconditions, expected results, and recovery. PlanetScale Postgres is production truth. Convex `glad-minnow-656` is frozen and is not a normal write target.

## Authority and allowlist

A command is permitted to write production only when it is already in the repository's operator-write allowlist and the owner authorizes that exact operation. The inventory and guard implementation live in `scripts/lib/production-writer-inventory.mjs` and `scripts/lib/production-write-command.mjs`. Adding a guarded command does not grant production authorization and does not expand the allowlist.

Application writes remain role- and intent-scoped. Public service writes are limited to the existing create-only allowlist. Public DoseWiki receives only the public-intake credential; Effect Index receives none. Only the editor deployment may carry the general admin credential tier.

## Literal Postgres command ceremony

Preconditions for any remote Postgres command:

1. Read the command entry in `package.json` and its implementation.
2. Confirm the operation is allowlisted and obtain authorization for the exact target and changes.
3. Load credentials without printing or committing them.
4. Select Postgres explicitly and set an explicit target. Application fallback variables never select a privileged target.
5. Run the command's no-write or dry-run form and review its target, plan, counts, rejects, and recovery output.
6. Repeat only the reviewed operation with every required confirmation flag.

Use this shape, substituting the actual package command and the confirmation phrase printed by that command:

```bash
set -a && . ./.env.local && set +a
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL"
export POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud

npm run <command> -- <operation-args> --dry-run --allow-remote
npm run <command> -- <operation-args> --write --allow-remote \
  --confirm-write=<operation-phrase> \
  --expected-deployment=aws-us-east-1-2.pg.psdb.cloud/postgres
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

Intent-scoped `CONVEX_ADMIN_TOKEN_*` names are retained because unchanged Convex handlers read them in-process on Postgres. Use the operation's scoped token when defined. `CONVEX_ADMIN_KEY` is a compatibility fallback only where source explicitly permits it. Never copy credential values into docs, argv, logs, or committed files.

`DATA_WRITES_FROZEN=1` is authoritative across editor routes, sessionless auth writes, service writes, and operator clients. A frozen result is expected safety behavior. Only an explicitly authorized operational decision may reopen writes.

The Postgres runtime needs `REPLICATION_MEDIA_BASE_URL` for correct replication reads. Read-only public and Effect Index processes must not receive `CONVEX_ADMIN_KEY` merely to satisfy runtime startup. `lib/postgres/runtime/deploymentEnv.ts` owns this split.

## Schema migrations

`npm run postgres:migrate` is the only production schema path. Its implementation must require an explicit `--target` or `TARGET_POSTGRES_URL`, preserve `--allow-remote` plus `POSTGRES_IMPORT_CONFIRM` for non-loopback targets, use the fixed repository Drizzle config, reject arbitrary forwarded arguments, and support a no-write plan before execution.

Preconditions: inspect generated migrations and `lib/postgres/migrations/meta/_journal.json`, run the migration's plan mode against the exact target, review pending migrations, and obtain production authorization. Expected result: only the reviewed pending migrations apply, followed by a clean schema verification. Recovery is the migration-specific forward repair or the owner-approved database recovery plan, never an ad hoc down migration.

## Nightly molecule reads

The nightly molecule source is read-only Postgres:

- `DATA_BACKEND=postgres`
- `DATA_WRITES_FROZEN=1`
- `POSTGRES_POOLED_URL` supplied from GitHub secret `POSTGRES_POOLED_READONLY_URL`
- `REPLICATION_MEDIA_BASE_URL` supplied from repository variable `REPLICATION_MEDIA_BASE_URL`

The workflow is registered on `main`, checks out `no-corpus-drain`, and runs
daily at 09:30 UTC. Its only Git write targets are
`public/dosewiki-molecules.json` and `public/dosewiki-molecules.zip` on
`no-corpus-drain`. The repository's Git deployment guard keeps these pushes
separate from explicit site releases.

Before initial activation or any configuration or source-revision change, verify both GitHub values and prove that the dedicated reader authenticates without write or admin privileges. Configuration alone does not publish the Postgres-capable producer and its dependencies: review the exact source revision present on the workflow branch before authorizing a run. Workflow publication and dispatch require owner approval because the job can commit and push public pack outputs. Expected result is a read-only database run with the freeze engaged. Recovery is to disable the schedule and inspect its report; it has no database-write rollback.

## Convex recovery only

Normal workflows must not translate a Postgres recipe into Convex flags. Convex `glad-minnow-656` remains byte-frozen through the ticket 24 observation decision. Read-only inventory commands may still inspect it when their implementation is explicitly read-only.

Post-cutover rollback is not an environment flip. It requires a new Postgres reverse export followed by a full Convex replace import. This is a production write and is owner-gated. Follow [release manifest section 10](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex) literally, including the write freeze, `--allow-production`, and `CONVEX_REVERSE_IMPORT_CONFIRM` gates. Preserve the cutover snapshot, PlanetScale recovery branch, mailing-list relay, and frozen Convex deployment until ticket 24 is explicitly completed.

## Ownership and recovery pointers

- Executable commands: `package.json`
- Script catalog: [scripts README](../../scripts/README.md)
- Backend and target selection: `scripts/lib/data-client.ts`
- Remote Postgres guard: `scripts/postgres/targetGuard.ts`
- Write confirmation boundary: `scripts/lib/production-write-command.mjs`
- Operator-write inventory: `scripts/lib/production-writer-inventory.mjs`
- Global freeze: `lib/runtime/dataWriteFreeze.ts`
- Deployment topology: [deployment](deployment.md)
- Recovery: [release manifest section 10](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex)
