# Scripts

`package.json` is the executable command catalog. This guide owns script-wide target, safety, result, and recovery rules. Workflow-specific behavior belongs beside each script or in the linked feature guide, not in copied command recipes here.

## Running scripts

Install with `bun install --frozen-lockfile`. Prefer package commands and place script arguments after `--`:

```bash
npm run <command> -- <arguments>
```

Use `bun scripts/...` only when no package command exists. Postgres-backed scripts require Bun. Inspect the selected package entry and implementation before running it.

## Production data boundary

PlanetScale Postgres is production truth. Normal commands must not write Convex. Read [data credentials and write targets](../docs/agents/convex-credentials.md) before any remote database operation.

Every production data write requires all of the following:

- the command is already classified in `scripts/lib/production-writer-inventory.mjs`;
- explicit authorization for the exact operation and target;
- `DATA_BACKEND=postgres`;
- an explicit `--target` or `TARGET_POSTGRES_URL`;
- `--allow-remote` and `POSTGRES_IMPORT_CONFIRM=<host>` for a non-loopback target;
- a reviewed no-write plan or `--dry-run`;
- `--write`, `--confirm-write=<operation-phrase>`, `--expected-deployment=<host>/<database>`, and every operation-specific confirmation required by the command.

Implementing the shared guards does not authorize a command or expand the operator-write allowlist. `DATA_WRITES_FROZEN=1` must refuse all writes. Never bypass target, credential, freeze, role, or confirmation failures.

Expected result: the command names the intended target, reports the reviewed plan, then reports matching applied counts with no unexplained rejects or mismatches. On partial or unexpected output, stop and use the command's recovery artifact. Database-wide recovery is owner-gated and follows [the Postgres to Convex recovery procedure](../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex).

## Postgres operations

- `npm run postgres:migrate` is the sole schema migration path. It uses the fixed repository Drizzle configuration, requires an explicit target, rejects arbitrary forwarded Drizzle arguments, and must expose a no-write plan before execution.
- `npm run postgres:import` imports a reviewed Convex snapshot into an explicit Postgres target and verifies counts, hashes, duplicate IDs, and references.
- `npm run postgres:rehearse-publication`, `npm run postgres:rehearse-commands`, and other `postgres:rehearse-*` commands operate on explicit rehearsal targets. Scratch writes they create and delete are not production authorization.
- `npm run postgres:check-env-isolation` proves preview-shaped environments cannot inherit a production writer.
- `npm run postgres:verify-migrations` checks generated schema and migration snapshot agreement.
- `npm run postgres:reverse-export` is read-only against Postgres, but its output is an input to an owner-gated Convex recovery. It is not a normal publishing path.

For local rehearsal:

```bash
DATA_BACKEND=postgres npm run <command> -- \
  --target postgres://localhost:5432/dosewiki
```

For production-shaped planning, follow the literal environment and guard sequence in [data credentials](../docs/agents/convex-credentials.md). Do not mentally translate Convex examples.

## Read-only and generated workflows

A read-only script receives no mutation capability and must reject `--write`. Remote Postgres reads still require an explicit target plus the remote-host guard. Public DoseWiki and Effect Index remain credential-free read-only flavors.

Before changing generated output, inspect `src/data/artifactLineageManifest.json`, change the recorded producer input, and rerun its recorded command. Do not hand-edit generated article-schema helpers or Convex generated files.

The nightly molecule workflow is owner-blocked until GitHub has secret `POSTGRES_POOLED_READONLY_URL` and repository variable `REPLICATION_MEDIA_BASE_URL`. Its source contract is `DATA_BACKEND=postgres`, `DATA_WRITES_FROZEN=1`, and the read-only pooled URL. Do not create those values or claim the workflow is active.

## Workflow authorities

- Citation research and promotion: [citation workbench](../docs/agents/citation-workbench.md)
- Legality research and application: [legality-pi](../.agents/skills/legality-pi/SKILL.md)
- Isolated section regeneration: [sectionmaxxing](../.agents/skills/sectionmaxxing/SKILL.md)
- Replication intake: [replication intake runbook](../docs/agents/reddit-replication-intake.md)
- Locale mirrors: [locale mirrors runbook](../docs/agents/locale-mirrors.md)
- Deployment and artifact separation: [deployment](../docs/agents/deployment.md)
- Credentials, targets, confirmations, and recovery: [data credentials](../docs/agents/convex-credentials.md)

The citation workbench guide is the portable repository authority. Do not place workstation-specific private paths in always-loaded guidance or publish private queue contents.
