# Scripts

`package.json` is the executable command catalog. This guide owns script-wide target, safety, result, and recovery rules. Workflow-specific behavior belongs beside each script or in the linked feature guide, not in copied command recipes here.

## Running scripts

Install with `bun install --frozen-lockfile`. Prefer package commands and place script arguments after `--`:

```bash
npm run <command> -- <arguments>
```

Use `bun scripts/...` only when no package command exists. Postgres-backed scripts require Bun. Inspect the selected package entry and implementation before running it.

## Production data boundary

PlanetScale Postgres is production truth. Normal commands use only the native data runtime. Read [data credentials and write targets](../docs/agents/data-credentials.md) before any remote database operation.

For a production write, follow the complete [authorization and command ceremony](../docs/agents/data-credentials.md#literal-postgres-command-ceremony).
The production-writer inventory is admission, not authorization: reviewed code,
credentials or a successful dry-run cannot expand it. Preserve the global freeze,
exact target, role, scoped intent and operation-specific confirmations.

Expected result: the command names the intended target, reports the reviewed plan, then reports matching applied counts with no unexplained rejects or mismatches. On partial or unexpected output, stop and use the command's recovery artifact. Database-wide recovery requires separate owner authorization; historical hosted-backend recovery is not an active command surface.

## Postgres operations

When changing schema, use only `postgres:migrate` and the migration gates in
[data credentials](../docs/agents/data-credentials.md#schema-migrations).
For import, rehearsal, isolation and migration-verification commands, inspect
their `package.json` entries and implementations. Rehearsal scratch writes do
not authorize production work; historical snapshot IDs and provenance remain intact.
- `scripts/recovery/convex/` contains non-executable historical references, not normal publishing or rollback commands. Any hosted-backend recovery requires a separately approved isolated historical checkout; never run or adapt these records as routine production tooling.

For local rehearsal:

```bash
DATA_BACKEND=postgres npm run <command> -- \
  --target postgres://localhost:5432/dosewiki
```

For production-shaped planning, follow the literal environment and guard sequence in [data credentials](../docs/agents/data-credentials.md). Do not adapt historical provider examples.

## Read-only and generated workflows

A read-only script receives no mutation capability and must reject `--write`. Remote Postgres reads still require an explicit target plus the remote-host guard. Public DoseWiki and Effect Index remain credential-free read-only flavors.

Before changing generated output, inspect `src/data/artifactLineageManifest.json`, change the recorded producer input, and rerun its recorded command. Do not hand-edit generated article-schema helpers or native data runtime registries.

For nightly molecule operations, follow [nightly molecule reads](../docs/agents/data-credentials.md#nightly-molecule-reads) and the workflow source. Activation, configuration and source-revision changes require owner evidence and approval; do not create credentials or infer live state from a cached documentation claim.

## Workflow authorities

- Citation research and promotion: [citation workbench](../docs/agents/citation-workbench.md)
- Legality research and application: [legality-pi](../.agents/skills/legality-pi/SKILL.md)
- Isolated section regeneration: [sectionmaxxing](../.agents/skills/sectionmaxxing/SKILL.md)
- Replication intake: [replication intake runbook](../docs/agents/reddit-replication-intake.md)
- Locale mirrors: [locale mirrors runbook](../docs/agents/locale-mirrors.md)
- Deployment and artifact separation: [deployment](../docs/agents/deployment.md)
- Credentials, targets, confirmations, and recovery: [data credentials](../docs/agents/data-credentials.md)

The citation workbench guide is the portable repository authority. Do not place workstation-specific private paths in always-loaded guidance or publish private queue contents.
