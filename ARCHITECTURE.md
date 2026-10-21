# dose.wiki architecture

This is the current-state map of the repository. When this file and the source disagree, the source is right.

## System

The repository builds three Next.js applications from one route tree:

- public DoseWiki, built as `DOSEWIKI_BUILD_SURFACE=public` for `dose.wiki` and `www.dose.wiki`;
- editor DoseWiki, built as `DOSEWIKI_BUILD_SURFACE=editor` for `dev.dose.wiki` and `dosewiki-admin.vercel.app`;
- Effect Index, a separate public, read-only flavor selected by `NEXT_PUBLIC_SITE_FLAVOR=effectindex`.

`scripts/build/build-surface.mjs` owns artifact identity. From a release artifact name (`public`, `editor`, `effectindex`) it derives the build surface, flavor, build directory, cron ownership, and prebuilt-upload rules that `next.config.ts`, the deploy scripts, and the build workflows read. `src/config/siteFlavor.ts` owns publication identity and route availability. `src/middleware.ts` and `lib/next/flavorGatedRoutes.ts` enforce hosts and routes. Public and editor delivery are separate compiled artifacts, not request-time branches of one build. `bun run build` ends with `scripts/build/editor-artifact-audit.mjs`, which fails when a public artifact contains an editor-only module. [Deployment](docs/operations/deployment.md) owns the Vercel topology and release procedure.

## Runtime data

PlanetScale Postgres is the production runtime source of truth. `DATA_BACKEND=postgres` runs the authored `server/` handlers in-process through `lib/postgres/runtime/`. There is no alternate backend. `server/schema.ts` owns persisted document validation, and `src/schema/substance/` owns the stricter article shape.

Public DoseWiki and Effect Index carry no admin or editorial credential. Public DoseWiki may hold `DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE`, which lets its intake routes run only the create-only service mutations listed in [Auth](docs/architecture/auth.md#token-checked-exceptions). Only the editor deployment carries the editorial write tier. Every surface needs `REPLICATION_MEDIA_BASE_URL` for complete replication reads. `DATA_WRITES_FROZEN=1` closes application and operator write boundaries through `lib/runtime/dataWriteFreeze.ts`. [Data credentials](docs/operations/data-credentials.md) owns targets, credential tiers, and the production write ceremony.

## Runtime boundaries

- Public pages use the App Router under `src/app/`, with static generation or ISR where declared. [Runtime and data](docs/architecture/runtime-and-data.md#rendering-and-revalidation) covers rendering and cache freshness.
- `/glossary` and its locale mirrors share `src/features/language-glossary/GlossaryRoute.tsx` and one renderer.
- Public data loaders live under `lib/data/` and `lib/next/`. `lib/data/publicData.cacheTags.ts` owns the pure cache tags shared by the publication contract and the Next cache adapter in `lib/data/publicData.cache.ts`.
- Protected editor routes live under `/dev`. `src/middleware.ts`, `lib/auth/authOptions.ts`, `server/lib/auth.ts`, and `src/lib/auth/roles.ts` own access. [Auth](docs/architecture/auth.md) describes accounts and roles.
- `lib/auth/devScreenshotViewer.ts` lets a local `next dev` render `/dev` documents without an account. It never admits an API call, a mutation, or a production build.
- `server/lib/articleWrite.ts` owns editorial article patches and their revision journal. `server/saveArticleBatch.ts` owns atomic staged publication and durable batch receipts. Other article writers are listed in [runtime and data](docs/architecture/runtime-and-data.md#article-write-owners).
- The public `/api/v1` surface serves public-safe, cursor-paginated projections. Its OpenAPI document is authoritative for endpoints, and [docs/api.md](docs/api.md) is the consumer contract.
- Local JSON and Markdown under `data/` and `content/` are seeds, exports, prompts, and generated artifacts. Code that imports one compiles it in as a static input, so editing it changes what that code renders. It never changes a Postgres record, and Postgres stays the editorial source of truth.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/app/` | App Router pages, layouts, metadata routes, and API route handlers (`src/app/api/`). `src/app/_components/` is private to the routes |
| `src/features/` | Feature UI and editor workflows. The editor kit is `src/features/dev/components/`, and the appearance controls are `src/features/appearance/` |
| `src/components/` | Shared UI: `ui/` primitives, `common/` recipes, `layout/` page chrome, `pages/` route-owned public pages ([UI kit](docs/design/ui-kit.md)) |
| `src/schema/` | Canonical Zod schemas. The article schema and its adapter `contract.ts` live in `substance/`, and `substance.schema.ts` re-exports them |
| `src/data/` | Content loaders, static configuration, domain models with their transforms (`tags/`, `changelog/`), and generated schema helpers (`schema/`) |
| `src/lib/` | Shared helpers and server-only route code. `auth/roles.ts` is shared. `auth/requireEditorSession.ts` and the `http/` route wrappers run only on the server |
| `src/utils/`, `src/hooks/` | URL, routing, SEO, slug, and date helpers, and React hooks with their API clients |
| `src/styles/`, `src/theme/` | Global CSS partials, theme tokens, and the appearance palette sources ([visual style guide](docs/design/visual-style-guide.md)) |
| `src/i18n/` | Locale registry, message providers, and generated catalog manifests |
| `lib/` | Server runtime (`postgres/`, `data/`, `auth/`, `http/`, `next/`, `runtime/`) and the pure contracts that browser code imports. `@lib/*` and `@server/*` both resolve to `lib/`, so neither alias means server-only |
| `server/` | Authored Postgres handlers, the document schema `schema.ts`, and `lib/` domain helpers |
| `scripts/` | Operator, generation, migration, build, deploy, lint, and security tooling ([scripts README](scripts/README.md)) |
| `data/` | Tracked open datasets, third-party inputs, and the generated-data manifest `lineage.json` ([data README](data/README.md)) |
| `content/` | Authored prose and prompts loaded by code ([content README](content/README.md)) |
| `public/` | Static assets, fonts, icons, the molecule pack, and the archival `SubstanceIndex.json` |
| `vendor/openchemlib/` | The repository-owned OpenChemLib fork ([fork contract](docs/architecture/openchemlib-fork.md)) |
| `docs/` | Contributor documentation ([index](docs/README.md)) |

## Where new code goes

- Domain models and their transforms go in `src/data/<domain>/`. Tags live in `src/data/tags/`. The changelog models and their diff builder, `diff.ts`, live in `src/data/changelog/`.
- URL, string-format, and route helpers go in `src/utils/`. React state goes in a hook or in the feature that owns it.
- UI that more than one route uses goes in `src/components/` or `src/features/`. ESLint fails an import of `src/app/_components/` from either directory.
- Postgres handlers go in `server/`, and their transaction and domain helpers in `server/lib/`. A new handler module needs an entry in `lib/postgres/runtime/functionOwnership.json`, then `bun run generate:postgres-functions`.
- A root `lib/` module that browser code imports is a pure contract. List it in the pure-contract block of `eslint.config.mjs`, which already covers all of `lib/article/`, `lib/citations/`, `lib/generatedPublication/`, and `lib/proposals/`. That block fails `bun run lint` when a listed file imports `server-only`, a Node built-in, a Next or Auth.js adapter, a database client, a Postgres module other than `postgres/runtime/values`, a session or role check, or React. Nothing adds a new file to the list for you.

## Shared contracts

- **Slugs.** `slugify` in `src/utils/slug.ts` is the one label-to-slug rule: lowercase, collapse each run of characters outside `[a-z0-9]` to `-`, and strip edge dashes. A caller that needs a fallback word, Unicode folding, or value coercion applies it before or after `slugify`, and scripts import the same file. A helper with a different output, such as `generateReplicationSlug`, has its own name.
- **Projection readers.** A Postgres reader that selects only some columns declares them as a tuple in `lib/postgres/runtime/projectionReads.ts` and returns a `Pick` of the document type over that tuple, so reading an unselected column fails the type check. `fromProjectedRow` in `lib/postgres/runtime/dbRows.ts` keeps only the selected columns of the decoded row. Every reader a handler reaches through `ctx.db` is declared on `SubstanceProjectionReads`, `PublicProjectionReads`, or `EditorialProjectionReads`, which `DatabaseReader` in `lib/postgres/runtime/server.ts` extends. Call readers through `ctx.db` without a cast, so renaming or retyping one fails the type check.
- **Projections.** A function that projects reader rows takes a `Pick` of the fields it reads. Call it as `rows.map((row) => project(row))`. `tsconfig.json` sets `strict: false`, which leaves `strictFunctionTypes` off, and a point-free `rows.map(project)` would not catch a projection that reads an unselected column.

`package.json` is the command catalog. `scripts/lib/local-artifact-hygiene-policy.mjs` decides which ignored local artifacts `bun run hygiene:clean` may remove.

## Generated code

`data/lineage.json` records every generated artifact with its producer, inputs, `editPolicy`, and typed `refresh` instructions ([format](data/README.md)). `bun run provenance:check` validates the manifest paths, retention, and refresh commands. It does not check that outputs are fresh. The generators with drift checks are:

- `bun run generate:postgres-schema` reads `server/schema.ts` and writes `lib/postgres/schema.generated.ts` and `lib/postgres/runtime/dataModel.ts`. `bun run postgres:check-schema` fails in CI when either is stale.
- `bun run generate:postgres-functions` reads `lib/postgres/runtime/functionOwnership.json` and the owned `server/*.ts` modules, and writes `lib/postgres/runtime/functions.generated.ts` and `lib/postgres/runtime/api.generated.ts`. `scripts/build/check-function-references.mjs` fails in CI when a call site names a function the checkout does not define.
- `bun run postgres:verify-migrations` fails in CI when `lib/postgres/migrations/` drifts from the schema.

`bun run generate:schema` writes `src/data/schema/` from the article schema. `src/schema/substance.schema.ts` is a one-line facade over `src/schema/substance/`. `substanceArticleSchema` is defined in `src/schema/substance/article.ts` from the section modules beside it. `bun run schema:check` fails in CI when the generated helpers drift, or when a field override or section list names a path the registry does not have. `vendor/openchemlib/dist/` is rebuilt from the fork source, never edited by hand.
