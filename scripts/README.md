# Scripts

`package.json` is the executable command catalog. This guide owns script-wide target, safety, result, and recovery rules. Workflow-specific behavior belongs beside each script or in the linked feature guide, not in copied command recipes here.

## Running scripts

Install with `bun install --frozen-lockfile`. Prefer package commands and place script arguments after `--`:

```bash
npm run <command> -- <arguments>
```

Use `bun scripts/...` only when no package command exists. Postgres-backed scripts require Bun. Inspect the selected package entry and implementation before running it.

## Production data boundary

PlanetScale Postgres is production truth. Normal commands use only the native data runtime. Read [data credentials and write targets](../docs/operations/data-credentials.md) before any remote database operation.

For a production write, follow the complete [authorization and command ceremony](../docs/operations/data-credentials.md#literal-postgres-command-ceremony).
The production-writer inventory is admission, not authorization: reviewed code,
credentials or a successful dry-run cannot expand it. Preserve the global freeze,
exact target, role, scoped intent and operation-specific confirmations.

Expected result: the command names the intended target, reports the reviewed plan, then reports matching applied counts with no unexplained rejects or mismatches. On partial or unexpected output, stop and use the command's recovery artifact. Database-wide recovery requires separate owner authorization; historical hosted-backend recovery is not an active command surface.

## Postgres operations

When changing schema, use only `postgres:migrate` and the migration gates in
[data credentials](../docs/operations/data-credentials.md#schema-migrations).
For import, rehearsal, isolation and migration-verification commands, inspect
their `package.json` entries and implementations. Rehearsal scratch writes do
not authorize production work; historical snapshot IDs and provenance remain intact.

For local rehearsal:

```bash
DATA_BACKEND=postgres npm run <command> -- \
  --target postgres://localhost:5432/dosewiki
```

For production-shaped planning, follow the literal environment and guard sequence in [data credentials](../docs/operations/data-credentials.md). Do not adapt historical provider examples.

## Read-only and generated workflows

A read-only script receives no mutation capability and must reject `--write`. Remote Postgres reads still require an explicit target plus the remote-host guard. Public DoseWiki and Effect Index remain credential-free read-only flavors.

Before changing generated output, inspect `data/lineage.json`, change the recorded producer input, and rerun its recorded command. Do not hand-edit generated article-schema helpers or native data runtime registries.

For nightly molecule operations, follow [nightly molecule reads](../docs/operations/data-credentials.md#nightly-molecule-reads) and the workflow source. Activation, configuration and source-revision changes require owner evidence and approval; do not create credentials or infer live state from a cached documentation claim.

## Workflow authorities

- Citation research and promotion: [citation workflow](../docs/workflows/citations.md)
- Legality research and application: [legality workflow](../docs/workflows/legality.md)
- Replication intake: [replication intake runbook](../docs/workflows/replication-intake.md)
- Locale mirrors: [locale mirrors runbook](../docs/operations/locale-mirrors.md)
- Deployment and artifact separation: [deployment](../docs/operations/deployment.md)
- Credentials, targets, confirmations, and recovery: [data credentials](../docs/operations/data-credentials.md)

The citation workbench guide is the portable repository authority. Do not place workstation-specific private paths in always-loaded guidance or publish private queue contents.

## Directory catalog

One row per directory that ships in the repository. Every script keeps its inputs and outputs inside the checkout, under an explicit flag, or under an environment variable such as `DOSEWIKI_CITATION_WORKBENCH`; none assumes a particular workstation layout.

| Directory | Purpose |
| --- | --- |
| `scripts/admin/` | Guarded data-admin CLI for reviewed production edits. |
| `scripts/analyze/` | Read-only audits: plagiarism, prose language, cleanup metrics, feature reachability, binding-site renames. |
| `scripts/article-source-documents/` | Contract for the article source-document shape. |
| `scripts/articles/` | Markdown shortcode and paragraph repair for article bodies. |
| `scripts/auth/` | Password hashing and admin account seeding. |
| `scripts/batch/` | OpenRouter batch generation for article sections, quotes, and reviewed-section publishing. |
| `scripts/build/` | Build-time generators: social cards, icon data, appearance CSS, manifests, editor artifact audit. |
| `scripts/chemistry/` | Molecule rendering, IUPAC audits, and the OpenChemLib fork verification. |
| `scripts/citations/` | Formal citation drafting, workbench export/rebase/apply, reference metadata repairs, subsection rollout tracking, and citation-pi verdicts. |
| `scripts/contributors/` | Contributor profile seeding, patches, bios, and avatar generation. |
| `scripts/data/` | Local data maintenance: SMILES maps, reagent caches, favicons, provenance checks, reviewed delta files. |
| `scripts/data-ops/` | Guarded Postgres data operations: imports, exports, shape repairs, route and dose normalization, production sync. |
| `scripts/deploy/` | Vercel build wiring and public route warming. |
| `scripts/effects/` | Subjective-effect article media repairs and embed upgrades. |
| `scripts/feedback/` | Feedback register scheduling. |
| `scripts/generate/` | Article schema helper generation. |
| `scripts/legality/` | Legality subsection audits, drafts, validation, and guarded application. |
| `scripts/lib/` | Shared runtime: data client, run context, production-write boundary, command surfaces, artifact lineage, hygiene policy. |
| `scripts/migrate/` | Effect Index and legacy-shape migrations into Postgres, prompt sync, citation restructuring. |
| `scripts/parsers/` | Source-document parsers behind `parse:sources`. |
| `scripts/postgres/` | Local database, migrations, snapshot import, derived-table rebuilds, and rehearsal suites. |
| `scripts/prepopulate/` | Source-citation prepopulation from legacy articles. |
| `scripts/reports/` | Trip report timeline formatting. |
| `scripts/research/` | PsychonautWiki 2015 subjective-effects collection. |
| `scripts/review/` | Editorial review run export, plans, briefings, and flag application. |
| `scripts/security/` | Secret scanning and CI security policy tests. |
| `scripts/seed/` | Site config, layouts, and copy-block seeding. |
| `scripts/test/` | Workflow test discovery, runner, and evidence reporting. |
| `scripts/translation/` | Locale translation, glossaries, packs, mirrors, and publication index backfill. |
| `scripts/util/` | Local artifact hygiene and small one-file utilities. |
| `scripts/replications/` | Replication corpus maintenance: provenance audits, rights metadata, R2 renditions and delivery worker, galleries, slug and credit corrections. |
| `scripts/config/` | Secondary TypeScript and Vitest configs for scripts and route handlers. |
| `scripts/deploy/analytics-redirect/` | Vercel config for the analytics redirect project. |
| `scripts/eslint-plugins/` | Local ESLint plugin loaded by `eslint.config.mjs`. |
| `scripts/perf/` | Cold-load, bundle-size, and replication transport measurement harnesses. |
| `scripts/tools/pi-citation-workflow/` | Citation run manifest, campaign status, and local proposal run preparation. |
| `scripts/tools/copyRdkitAssets.mjs` | Copies the RDKit runtime into `public/rdkit/`. |

Root-level scripts (`scripts/*.mjs`, `scripts/parse-sources*.ts`) are single-purpose maintenance entry points; read the header comment before running one.
