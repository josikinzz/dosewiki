# Project Layout

This is the quick map for contributors deciding where code belongs. Keep it focused on folder ownership and repository hygiene; deeper runtime details live in [Runtime and Data Architecture](runtime-and-data.md), and operational guidance lives in [Operations and Direction](operations-and-direction.md).

## Active Code Areas

```text
src/app/        Next.js App Router routes, layouts, metadata routes, and API handlers
src/features/   Feature-owned UI and editor workflows
src/components/ Shared presentation components and UI primitives
src/data/       Content loaders, static config, generated schema helpers
src/hooks/      Client hooks for editor, search, config, and data flows
src/schema/     Canonical Zod schemas
src/styles/     Global CSS partials imported by src/styles.css
src/utils/      Routing, SEO, tag, slug, and interaction helpers

lib/            Shared server helpers, including the production Postgres runtime
server/         Authored Postgres callable handlers, document schema, and domain helpers
scripts/        Local operational scripts for migration, generation, parsing, and audits
scripts/config/ Secondary tsconfig and Vitest configs for scripts and route handlers
scripts/tools/  RDKit asset copier and the Pi citation workflow bridge
scripts/perf/   Cold-load, bundle-size, and replication transport harnesses
scripts/eslint-plugins/  Local ESLint plugin loaded by eslint.config.mjs
scripts/deploy/ Vercel build, route warming, and the analytics redirect project config
data/           Tracked datasets, third-party inputs, and the generated-data lineage manifest
data/schemas/   JSON Schemas for the hand-maintained index files
content/        Authored prose and prompts loaded by code: About page, copy blocks, prompts, taxonomy text, UI catalogs, source corpora
docs/           Contributor documentation: architecture, ADRs, design, operations, workflows
vendor/         Repository-owned third-party forks with explicit provenance and rebuild contracts
```

App Router APIs live in `src/app/api/`. Reusable server-side helpers for those routes live in `lib/server/`; do not reintroduce tracked code under the retired root `api/` directory.

## UI Ownership

Shared UI promotion is intentional, not a holding area for route or editor code.

| Path | Owner | Promotion rule |
| --- | --- | --- |
| `src/components/ui/` | Shared primitives only | Keep variants semantic and primitive: tone, size, layout affordance. Feature recipes belong beside the consuming feature or route. |
| `src/components/common/` | Shared presentation helpers | Promote only after a second real runtime consumer, a stable prop API, and no feature-domain dependency. |
| `src/components/pages/` | Transitional route-owned public pages | Prefer new or materially changed page components beside the route in `src/app/` or under an owning feature. Do not add editor-only or single-tool components here. |
| `src/features/` | Feature-owned UI and workflows | Keep editor-only controls, form adapters, and feature recipes here until they meet the shared promotion rule. |

Use [UI System Ownership](../design/ui-kit.md#ownership) for the shared inventory and promotion criteria covering [`Surface`](../design/ui-kit.md#where-the-kit-lives), [`Button`](../design/ui-kit.md#button-variant-policy), [`Badge`](../design/ui-kit.md#where-the-kit-lives), [`ArticleSection`](../design/ui-kit.md#where-the-kit-lives), [`SectionCard`](../design/ui-kit.md#where-the-kit-lives), [`StateCard`](../design/ui-kit.md#where-the-kit-lives), public layout/content primitives, and protected dev editor primitives.

Boundary checks in `src/components/ui/ownership.test.ts` keep dev-owned editor widgets out of the common barrel, block `src/components/common` imports from feature/app/domain data modules, and prevent feature-named variants from returning to the shared `Button` primitive.

Package-level UI dependency ownership is documented in [Dependency Ownership](../design/ui-kit.md#dependency-ownership): shared icons go through `Icon`, motion defaults to CSS/shared tokens unless a feature needs `framer-motion`, gallery/lightbox packages stay with media features, and code/diff dependencies stay in protected editor/data utilities.

Feature folders must be reachable from the active App Router tree or explicitly listed in `docs/architecture/feature-reachability.json` with dormant ownership metadata (`owner`, `since`, and `deleteTrigger`). Run `npm run features:reachability` after adding or moving a feature folder.

## Operational and Generated Code

- `scripts/postgres/` owns the production database migration, import, rehearsal, and rollback-export tooling.
- `scripts/batch/`, `scripts/parsers/`, `scripts/migrate/`, and `scripts/data-ops/` are operational tooling, not public runtime code.
- `scripts/config/` holds `tsconfig.scripts.json`, `tsconfig.handlers.json`, `tsconfig.node.json`, and `vitest.scripts.config.ts`; `package.json` scripts pass them explicitly with `-p` or `-c`.
- `src/schema/substance/contract.ts` is the shared substance article contract adapter used before article ingestion and by contract tests.
- `src/data/schema/` contains generated and config-heavy schema helper code; update it through the schema generator when the source schema changes.
- `lib/postgres/runtime/` owns the native callable API, validators, schema definitions, and execution boundary; `server/` contains the authored handlers and domain schema.
- `npm run generate:postgres-schema` consumes the composed `server/schema.ts` through `scripts/postgres/schemaExport.ts` and produces both `lib/postgres/schema.generated.ts` and `lib/postgres/runtime/dataModel.ts`.
- `npm run generate:postgres-functions` consumes `lib/postgres/runtime/functionOwnership.json` and the owned `server/*.ts` modules, producing server-only `functions.generated.ts` and type-only `api.generated.ts`. `lib/postgres/runtime/api.ts` exposes browser-safe named references. Edit the ownership input and handlers, not these generated outputs.
- `vendor/openchemlib/` is the self-contained, BSD-licensed OpenChemLib fork used by the molecule editor. Its source, license, provenance, distribution artifacts, and artifact manifest are tracked intentionally; rebuild rather than hand-editing `vendor/openchemlib/dist/`. See [DoseWiki-owned OpenChemLib fork](openchemlib-fork.md).

## Local Artifact Hygiene

`scripts/lib/local-artifact-hygiene-policy.mjs` is the authority for removable paths, protected paths, and generated-export retention.

## Ignored Local Artifacts

The policy covers these active local artifact paths:

- Generated output: `.next`, `.generated`, `dist`, `dist-inline`, `coverage`, `public/share`, and `tmp`.
- Protected export boundary: `notes-and-plans/exports`, an ignored scratch directory that batch, translation, and citation scripts write to. The cleanup command never removes tracked files from this boundary, and a generated record is committed only when a current consumer and the lineage manifest require it.
- macOS metadata: `.DS_Store`.

Use:

- `npm run hygiene:check` to list local artifacts.
- `npm run hygiene:clean` to remove only artifacts that the policy classifies as cleanable.

The contract test keeps this list aligned with the policy.

## Documentation Pointers

- Root contributor overview: `README.md`
- Contribution workflow and verification commands: `CONTRIBUTING.md`
- Architecture entrypoint: `ARCHITECTURE.md`
- Agent workflow rules: `AGENTS.md`
- Documentation index: [docs/README.md](../README.md)
- Script catalog: `scripts/README.md`
