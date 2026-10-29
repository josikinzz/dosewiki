# Scripts

`package.json` is the executable command catalog. This guide owns script-wide target, safety, result, and recovery rules. Workflow-specific behavior belongs beside each script or in the linked feature guide, not in copied command recipes here.

## Running scripts

Install with `bun install --frozen-lockfile`. Prefer package commands and place script arguments after `--`:

```bash
bun run <command> -- <arguments>
```

Use `bun scripts/...` only when no package command exists. Postgres-backed scripts require Bun. Inspect the selected package entry and implementation before running it.

## Command catalog

Each package command appears in exactly one group. `bun run check:command-catalog` fails when this table and `package.json` disagree, so add each new command to its group here. The last column names what to read before you run a command in that group. `scripts/lib/production-writer-inventory.mjs` lists every script that can write production, and running one needs the [command ceremony](../docs/operations/data-credentials.md#literal-postgres-command-ceremony) and a human's approval.

| Group | Commands | Read first |
| --- | --- | --- |
| Local development | `dev`, `predev`, `start`, `dev:screenshot-viewer`, `dev:screenshot`, `dev:journeys-server`, `test:journeys`, `hygiene:check`, `hygiene:clean`, `prepare` | [Run](../CONTRIBUTING.md#run). `predev` runs before `dev`, and `prepare` runs on install |
| Tests and checks | `test`, `test:watch`, `test:coverage`, `test:workflow`, `test:evidence`, `typecheck`, `typecheck:scripts`, `typecheck:handlers`, `lint`, `lint:files`, `knip`, `security:check`, `provenance:check`, `schema:check`, `postgres:check-schema`, `postgres:verify-migrations`, `check:function-references`, `check:build-wiring`, `check:test-policy`, `check:repository-policy`, `check:command-catalog`, `verify`, `verify:checkout`, `verify:drift` | [Verify](../CONTRIBUTING.md#verify) |
| Build and release | `build`, `prebuild`, `build:vercel`, `build:census`, `warm:public-routes`, `deploy:localization-preflight` | [Deployment](../docs/operations/deployment.md). `prebuild` runs before `build` |
| Generated code and styles | `generate:schema`, `generate:postgres-schema`, `generate:postgres-functions`, `generate:appearance-palette-data`, `generate:appearance-css`, `generate:accent-css`, `generate:chroma-css`, `generate:surface-css`, `generate:appearance-sheets`, `generate:icon-data`, `generate:theme-lab-bootstrap`, `generate:home-tile-glyphs`, `generate:smiles`, `generate:favicons`, `generate:mantra-spiral`, `generate:world-map`, `generate:subjective-effects-provenance` | The output's `refresh` entry in `data/lineage.json` ([format](../data/README.md)) |
| Social cards | `generate:social-cards`, `publish:social-cards`, `verify:social-cards` | [Social cards](../docs/operations/social-cards.md) |
| Chemistry, molecules, and reagents | `openchemlib:build`, `openchemlib:verify`, `openchemlib:test`, `molecules:setup-venv`, `molecules:smiles-coverage`, `molecules:merge-smiles`, `molecules:seed`, `molecules:seed-classes`, `molecules:rerender`, `molecules:copy-overrides`, `molecules:pack`, `audit:iupac-names`, `reagents:cache`, `reagents:check`, `reagents:import` | [OpenChemLib fork](../docs/architecture/openchemlib-fork.md), [nightly molecule reads](../docs/operations/data-credentials.md#nightly-molecule-reads), and [the ProtestKit snapshot](../docs/architecture/runtime-and-data.md#protestkit-reagent-test-snapshot) |
| Citations | `citations:formal`, `citations:apply-workbench`, `citations:rebase-workbench`, `citations:export-workbench-task`, `citations:campaign`, `citations:plan-second-pass`, `citations:archive-production-dataset`, `citations:audit-subsections`, `citations:seed-subsection-tracker`, `citations:update-subsection-status`, `citations:verdict-audit`, `citations:verdict-export`, `citations:verdict-validate`, `citations:verdict-apply` | [Citation workflow](../docs/workflows/citations.md) |
| Legality | `legality:audit-subsections`, `legality:audit-voice`, `legality:build-repair-drafts`, `legality:export`, `legality:validate`, `legality:apply`, `legality:cite` | [Legality workflow](../docs/workflows/legality.md) |
| Article section batches | `batch:extract`, `batch:summary`, `batch:proposal`, `batch:publish-reviewed-section`, `batch:tolerance`, `batch:legality`, `batch:harm-potential`, `batch:history-culture`, `batch:dosage-duration`, `batch:dosage-duration:export`, `batch:dosage-duration:run`, `batch:dosage-duration:apply`, `batch:watch` | The script under `scripts/batch/`. Quote extraction follows [its contract](../docs/workflows/article-source-quote-extraction.md) |
| Translation and locale mirrors | `translate:locale`, `translate:glossary`, `translate:glossary:import-drafts`, `translate:glosses`, `translate:charset`, `translate:audit`, `translate:ui`, `translate:evaluation-candidates`, `translate:verify-release`, `translate:registry`, `translate:packs`, `translate:packs:check`, `translate:freeodwiki`, `translate:offline`, `translate:refresh`, `translate:publication-index`, `mirror:warm` | [Translation workbench](../docs/workflows/translation-workbench.md) and [locale mirrors](../docs/operations/locale-mirrors.md) |
| Replications | `replications:audit-provenance`, `replications:apply-provenance`, `replications:apply-dates`, `replications:regenerate-substance-galleries`, `replications:regenerate-thumbnails`, `replications:generate-gif-motion`, `replications:prepare-image-renditions` | [Replication intake](../docs/workflows/replication-intake.md) and [media delivery](../docs/operations/replication-media-delivery.md) |
| Postgres | `postgres:local`, `postgres:migrate`, `postgres:migrate:generate`, `postgres:synthesize-export`, `postgres:import`, `postgres:rebuild-derived`, `postgres:check-env-isolation`, `postgres:rehearse-publication`, `postgres:rehearse-auth`, `postgres:rehearse-article-lifecycle`, `postgres:rehearse-citation-publication`, `postgres:rehearse-effects`, `postgres:rehearse-http-surface`, `postgres:rehearse-reports-feedback`, `postgres:rehearse-storage-fallbacks`, `postgres:rehearse-content-tools`, `postgres:rehearse-replications-identity`, `postgres:rehearse-editor-reads`, `postgres:rehearse-commands`, `postgres:rehearse-exports`, `postgres:rehearse-release` | [Schema migrations](../docs/operations/data-credentials.md#schema-migrations) and [Postgres operations](#postgres-operations) |
| Data operations and migrations | `data:sync-production`, `data:export`, `data:normalize-dose-units`, `data:fill-route-gaps`, `data:apply-subjective-effects`, `migrate:trip-reports`, `migrate:effects`, `migrate:binding-sites`, `migrate:user-profiles`, `prompts:compare`, `prompts:migrate`, `review:export`, `review:apply`, `reports:format-flat` | [Data credentials](../docs/operations/data-credentials.md). Review runs also follow [ADR 0003](../docs/adr/0003-advisory-review-flags.md) |
| Sources and research | `parse:sources`, `scry:query` | The source of `scripts/parse-sources.ts` or `scripts/scry-query.mjs` |

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
DATA_BACKEND=postgres bun run <command> -- \
  --target postgres://localhost:5432/dosewiki
```

For production-shaped planning, follow the literal environment and guard sequence in [data credentials](../docs/operations/data-credentials.md). Do not adapt historical provider examples.

## Read-only and generated workflows

A read-only script receives no mutation capability and must reject `--write`. Remote Postgres reads still require an explicit target plus the remote-host guard. Public DoseWiki and Effect Index remain credential-free read-only flavors.

Before changing generated output, inspect `data/lineage.json`, change the recorded producer input, and follow its `refresh` entry. Do not hand-edit generated article-schema helpers or native data runtime registries.

For nightly molecule operations, follow [nightly molecule reads](../docs/operations/data-credentials.md#nightly-molecule-reads) and the workflow source. Activation, configuration and source-revision changes require owner evidence and approval; do not create credentials or infer live state from a cached documentation claim.

## Workflow authorities

- Citation research and promotion: [citation workflow](../docs/workflows/citations.md)
- Legality research and application: [legality workflow](../docs/workflows/legality.md)
- Replication intake: [replication intake runbook](../docs/workflows/replication-intake.md)
- Locale mirrors: [locale mirrors runbook](../docs/operations/locale-mirrors.md)
- Social-card generation and R2 publication: [social cards runbook](../docs/operations/social-cards.md)
- Deployment and artifact separation: [deployment](../docs/operations/deployment.md)
- Credentials, targets, confirmations, and recovery: [data credentials](../docs/operations/data-credentials.md)

The citation workbench guide is the portable repository authority. Do not place workstation-specific private paths in always-loaded guidance or publish private queue contents.

## Directory catalog

One row per directory that ships in the repository. Every script keeps its inputs and outputs inside the checkout, under an explicit flag, or under an environment variable such as `DOSEWIKI_CITATION_WORKBENCH`; none assumes a particular workstation layout.

| Directory | Purpose |
| --- | --- |
| `scripts/admin/` | Guarded data-admin CLI for reviewed production edits. |
| `scripts/analyze/` | Shared public-prose validation for batch writers. |
| `scripts/article-source-documents/` | Contract for the article source-document shape. |
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
| `scripts/generate/` | Article schema helper generation. |
| `scripts/legality/` | Legality subsection audits, drafts, validation, and guarded application. |
| `scripts/lib/` | Shared runtime: data client, run context, production-write boundary, production-writer inventory and detector, storage-write authorizer, artifact lineage, hygiene policy. |
| `scripts/migrate/` | Effect Index and legacy-shape migrations into Postgres, prompt sync, citation restructuring. |
| `scripts/parsers/` | Source-document parsers behind `parse:sources`. |
| `scripts/postgres/` | Local database, migrations, snapshot import, derived-table rebuilds, and rehearsal suites. |
| `scripts/perf/` | Cold-load and build bundle measurements. |
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
| `scripts/config/` | Secondary TypeScript configs for scripts and route handlers. |
| `scripts/deploy/analytics-redirect/` | Vercel config for the analytics redirect project. |
| `scripts/eslint-plugins/` | Local ESLint plugins loaded by `eslint.config.mjs`: `code-hygiene`, `editor-guardrails`, and `vercel-guardrails`. |
| `scripts/lint/` | The CSS comment and em dash scanners, the `lint:files` dispatcher, and the command catalog check. |
| `scripts/tools/journeys/` | Browser journeys and the deterministic fixtures behind `test:journeys` and `dev:screenshot`. |
| `scripts/tools/screenshot-dev-tool.mjs` | Screenshots a `/dev` document for `dev:screenshot`. |
| `scripts/tools/pi-citation-workflow/` | Citation run manifest, campaign status, and local proposal run preparation. |
| `scripts/tools/copyRdkitAssets.mjs` | Copies the RDKit runtime into `public/rdkit/`. |

Root-level scripts (`scripts/*.mjs`, `scripts/parse-sources*.ts`) are single-purpose maintenance entry points; inspect the selected script's package entry, argument handling, and owning runbook before running it.

## Removing code comments

`code-hygiene/no-comments` is the local ESLint rule and autofixer. It covers JavaScript and TypeScript, including root configs and local plugins. Machine directives, shebangs, license headers, and the generated and vendor exclusions survive. `scripts/lib/comment-scope.mjs` owns the shared exclusions and reads `data/lineage.json`.

To rerun only the comment rule, create a temporary flat config outside the repository. Import `scripts/eslint-plugins/code-hygiene/index.mjs`, `typescript-eslint`, and the scope exports using absolute paths. Set `languageOptions.parser` to `tseslint.parser`, enable JSX, set `files` to `codeCommentFiles`, and globally ignore `commentExclusions` plus `generatedCommentPaths(repoRoot)`. Enable only `code-hygiene/no-comments` at `error`, with inline config disabled and unused-disable reporting off. Then run:

```bash
bunx eslint --config /absolute/path/to/comment-only.config.mjs --fix .
node scripts/lint/check-css-comments.mjs --fix
bun run generate:appearance-sheets
```

`bun run lint` enforces both comment checks. The CSS fixer uses PostCSS comment positions. Regenerate appearance sheets after their authored CSS changes so the public copies and cache hashes match.
