# dose.wiki Architecture

This is the root current-state architecture map. Source files remain authoritative for details, and fast-changing operator procedures belong in their owning runbooks.

## System

This repository builds three Next.js application surfaces from one route tree:

- public DoseWiki, built as `DOSEWIKI_BUILD_SURFACE=public` for `dose.wiki` and `www.dose.wiki`;
- editor DoseWiki, built as `DOSEWIKI_BUILD_SURFACE=editor` for `dev.dose.wiki` and `dosewiki-admin.vercel.app`;
- Effect Index, a separate public, read-only flavor selected by `NEXT_PUBLIC_SITE_FLAVOR=effectindex`.

`src/config/siteFlavor.ts` owns publication identity and route availability. `src/middleware.ts` and `lib/next/flavorGatedRoutes.ts` own host and route enforcement. Public and editor delivery are separate compiled artifacts, not request-time branches of one build. [Deployment](docs/operations/deployment.md) owns the Vercel topology and release procedure.

## Runtime data

PlanetScale Postgres is production runtime truth. `DATA_BACKEND=postgres` runs authored `server/` handlers in-process through `lib/postgres/runtime/`. `server/schema.ts` owns persisted document validation; the handler modules own callable contracts. `src/schema/substance.schema.ts` owns the stricter article shape.

The active repository contains only the native Postgres runtime and operator graph. [Data credentials](docs/operations/data-credentials.md) owns current targets and write gates. There is no alternate backend or environment flip; application rollback restores a previous compatible Postgres artifact and configuration.

Public DoseWiki and Effect Index are read-only and carry no admin credential. Only the editor deployment may carry the write credential tier. All surfaces require `REPLICATION_MEDIA_BASE_URL` for complete replication reads. `DATA_WRITES_FROZEN=1` closes application and operator write boundaries.

## Runtime boundaries

- Public pages use the App Router under `src/app/`, with static generation or ISR where declared.
- Public data loaders live under `lib/data/` and `lib/next/`; native Postgres executes the registered handlers.
- Protected editor routes live under `/dev`; `src/middleware.ts`, `auth.ts`, and `src/lib/auth/roles.ts` own access.
- Auth.js supplies identity, database membership rows supply roles, and server write capabilities enforce actor and intent.
- The public `/api/v1` surface exposes public-safe, cursor-paginated projections. Its OpenAPI document is authoritative for endpoints.
- Local JSON and Markdown are migration inputs, exports, prompts, backups, or generated artifacts unless active source reads them. `data/lineage.json` owns generated-data lineage.

## Repository ownership

| Path | Responsibility |
| --- | --- |
| `src/app/` | App Router pages and route handlers |
| `src/features/` | Feature UI and editor modules |
| `lib/` | Runtime, server, Postgres, auth, and Next adapters |
| `server/` | Authored Postgres schema, handlers, and domain contracts |
| `scripts/` | Guarded operator, migration, generation, and analysis workflows, plus `config/` (secondary tsconfig and Vitest configs), `tools/`, `perf/`, `eslint-plugins/`, and `deploy/` |
| `src/data/` | Content builders, static configuration, and generated helpers |
| `data/` | Tracked datasets, `schemas/` for the hand-maintained index files, third-party inputs, and the lineage manifest |
| `docs/` | Contributor documentation ([index](docs/README.md)): architecture appendices, ADRs, design, operations runbooks, and editorial workflows |

Use [project layout](docs/architecture/project-layout.md) for detailed ownership, [runtime and data](docs/architecture/runtime-and-data.md) for the data model and flows, [operations and direction](docs/architecture/operations-and-direction.md) for quality gates, and [scripts README](scripts/README.md) for script-wide execution rules.

## Change rules

- Keep public links on ordinary App Paths. `/preview` exists only for permanent compatibility redirects.
- Keep public artifacts free of editorial browser modules and credentials.
- Preserve explicit data targets, intent credentials, write confirmations, the global freeze, read-only flavor boundaries, and generated-data lineage.
- Update this map when runtime ownership or build topology changes. Update the owning runbook rather than copying branch-specific credential or release detail here.

Expected result after an architecture change: source ownership, this map, and each owning guide agree. Recovery is to restore the previous local source and documentation snapshot; no documentation change proves or performs a deployment.
