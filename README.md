# dose.wiki

Next.js + Convex application for the dose.wiki harm-reduction knowledge base. The public site renders substance articles, subjective effects, trip reports, classifications, and editor-managed project content from Convex. The protected `/dev` surface provides editorial tools for maintaining that data.

---

## Contents
- [Platform Overview](#platform-overview)
- [Data Architecture](#data-architecture)
- [Project Layout](#project-layout)
- [Public Routes](#public-routes)
- [Editor Surface](#editor-surface)
- [Build, Run, and Deploy](#build-run-and-deploy)
- [Development Workflow](#development-workflow)
- [Scripts](#scripts)
- [Further Reading](#further-reading)

---

## Platform Overview

- **Type**: Next.js 16 App Router application
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Primary runtime data source**: Convex
- **Auth**: Auth.js (`next-auth`) with Convex-backed membership roles
- **Package manager**: Bun-lock repo with npm scripts
- **Current live dataset**: 577 substances, 233 subjective effects, 163 trip reports
- **Current static build surface**: 1,898 prerendered pages in the active production build

## Data Architecture

**Convex is the source of truth for runtime data.** Public pages and the active Next.js editor shell read live records from Convex.

### Convex tables

```text
substanceIndex       → full substance articles
articleSources       → scraped source content
tripReports          → trip report entries
subjectiveEffects    → subjective effect articles
effectIndexArticles  → supplementary EffectIndex content
replications         → effect gallery media
memberships          → editor/admin/viewer roles
indexLayouts         → psychoactive / chemical / mechanism layouts
categoryLayout       → legacy public category layout document
siteConfig           → about-page content and global settings
prompts              → generator and section prompts
quotes               → extracted source quotes
citationEvidence     → citation evidence rows backing public reference markers
changelog            → article change history
contributorProfiles  → public contributor profiles and profile ownership
```

### Local data files

Local JSON and markdown files still exist for backup, migration, export/import, batch generation, and selected GitHub-backed editing flows. They are **not** the authoritative public runtime state.

Key local artifacts:

- `src/data/SubstanceIndex.json`
- `src/data/parsed-sources.json`
- `src/data/config/generatorPrompt.md`
- `src/data/config/sectionPrompts/*.md`

`src/data/config/userProfiles.json` is now a migration seed/backfill artifact for contributor profiles, not the live runtime source.

### Schema ownership

- Canonical article contract: `src/schema/substance.schema.ts`
- Shared article contract adapter: `src/schema/substance/contract.ts`
- Generated schema helpers: `src/data/schema/`
- Convex schema: `convex/schema.ts`

The Convex schema is intentionally permissive. Convex article ingestion uses the shared contract adapter before storage, so editor, script, and sync writes fail with typed Zod validation issues before invalid article shapes are persisted.

## Project Layout

```text
src/
├── app/                 # Next.js App Router shell, routes, metadata routes, API handlers
├── features/
│   ├── article/         # Substance article rendering
│   ├── dev/             # Protected editor surface and tools
│   ├── effects/         # Subjective effect pages and VCode renderer
│   └── reports/         # Trip report pages
├── components/
│   ├── common/          # Shared primitives
│   ├── layout/          # Header, footer, page chrome
│   ├── pages/           # Page-level presentational components
│   └── ui/              # Shared UI components
├── data/                # Local artifacts, builders, config, generated schema helpers
├── hooks/               # Client hooks for editor/search/config flows
├── schema/              # Zod schemas
├── lib/                 # Client-side shared helpers
└── utils/               # Routing, SEO, tags, slugging, interaction helpers

lib/
├── auth/                # Auth/Convex membership sync
├── convex/              # Server-side Convex reads and write health helpers
├── http/                # Rate limiting and request helpers
├── next/                # Metadata, sitemap, static param helpers
├── runtime/             # Runtime env helpers
└── server/github/       # GitHub-backed write helpers

convex/
├── schema.ts
├── substanceIndex.ts
├── subjectiveEffects.ts
├── tripReports.ts
├── memberships.ts
├── prompts.ts
├── quotes.ts
├── replications.ts
├── siteConfig.ts
└── indexLayouts.ts

scripts/
├── analyze/             # Coverage and data audits
├── batch/               # AI generation and quote extraction
├── build/               # Build-time generators
├── convex/              # Convex import/export/sync
├── data/                # Data transforms
├── migrate/             # Schema/data migrations
├── parsers/             # Source parsers
├── prepopulate/         # Prepopulation from parsed sources
├── replications/        # Effect gallery media tooling
└── seed/                # Initial config/layout seed scripts
```

### Repository notes

This repository may contain legacy, local, or generated material that is not part of the active runtime path, including `.next/`, `dist/`, `dist-inline/`, `coverage/`, `archive/`, and `notes-and-plans/`. Use `npm run hygiene:check` to inspect approved local artifact noise and `npm run hygiene:clean` to remove it.

## Public Routes

Active public route groups live under `src/app/`:

- `/substances`
- `/[slug]`
- `/effects`
- `/effects/[effectSlug]`
- `/effects/category/[categorySlug]`
- `/reports`
- `/reports/[slug]`
- `/category/[categoryKey]`
- `/chemical/[slug]`
- `/psychoactive/[slug]`
- `/mechanism/[mechanismSlug]`
- `/mechanism/[mechanismSlug]/[qualifierSlug]`
- `/contributors/[profileKey]`
- `/search` and `/search/[query]`
- `/docs/how` and `/docs/code` (visual explainers served from `public/docs/`)
- `/about`

The production hosts `dose.wiki` and `www.dose.wiki` are currently gated behind an under-construction homepage in `middleware.ts`: only `/` and required static assets are served there, and other paths redirect home. Other hosts (previews, local dev) serve the full site.

Legacy redirect routes also exist for compatibility:

- `/effect/[effectSlug]` → `/effects/[effectSlug]`
- `/data` → `/about`
- `/interactions` → `/substances`

SEO and crawl surfaces:

- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `lib/next/metadata.ts`

## Editor Surface

Protected editor entry points:

- `/sign-in`
- `/dev`
- `/dev/[tab]`
- `/dev/[tab]/[slug]`

Current editor tabs:

1. `articles`
2. `change-log`
3. `tag-editor`
4. `profile`
5. `index-layout`
6. `about`
7. `citation-review`

### Auth and authorization

- Auth config: `auth.ts`
- Auth runtime policy: `lib/auth/runtimePolicy.ts`
- Middleware gate for `/dev`: `middleware.ts`
- Role source of truth: Convex `memberships`
- Bootstrap admins: `AUTH_ADMIN_EMAILS`
- Allowed editor roles: `admin`, `editor`
- `/dev/profile` is available to any authenticated user for self-profile edits; the rest of `/dev` remains editor-only.

The sign-in page supports an Auth.js credentials provider backed by server-side editor password env vars such as `ADMIN_PASSWORD`, `JOSIE`, or keys listed in `DEV_PASSWORD_KEYS`. Vercel preview/production credentials sign-in requires `AUTH_SECRET`. GitHub OAuth is optional. `lib/auth/runtimePolicy.ts` centralizes the Auth.js secret fallback, provider readiness, and deployment restrictions.

### Protected API handlers

- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-substance-index/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/reagent-proxy/route.ts`
- `src/app/api/search-suggestions/route.ts`
- `src/app/api/test-env/route.ts`

The preferred editor write path for live content is `save-to-convex`. Contributor profile writes now persist to Convex through `save-user-profile`.
API route rate limits are selected through named policies in `lib/http/rateLimitPolicy.ts`; Upstash remains the preferred storage adapter with in-memory fallback when Redis is unavailable.

## Build, Run, and Deploy

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start the Next.js dev server on `http://localhost:3000` |
| `npm run next:dev` | Alias for `npm run dev` |
| `npm run build` | Production build |
| `npm run next:build` | Alias for `npm run build` |
| `npm run start` | Start the built app |
| `npm run test` | Run Vitest |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emit |
| `npm run cleanup:metrics` | Print current cleanup and size metrics for the active source tree |
| `npm run hygiene:check` | List approved ignored/generated local artifacts currently present |
| `npm run hygiene:clean` | Remove approved ignored/generated local artifacts |
| `npm run generate:schema` | Regenerate schema helpers |
| `npm run provenance:check` | Report generated-data provenance manifest, command, output, and docs coverage issues |
| `npm run parse:sources` | Parse raw source files and print stats |

Cleanup review note:
Run `npm run cleanup:metrics -- --check` before or during review work on known hotspots. The report now separates active logic from generated/config-heavy files and fails when tracked cleanup budgets regress.

### Key environment variables

- `AUTH_SECRET`
- `NEXTAUTH_SECRET` (deprecated compatibility alias)
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `GITHUB_ID` / `GITHUB_SECRET` (deprecated compatibility aliases)
- `AUTH_ADMIN_EMAILS`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SITE_URL`
- `CONVEX_URL`
- `VITE_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_PUBLIC_READ_URL`
- `TARGET_CONVEX_URL`
- `CONVEX_ADMIN_KEY`
- `OPENROUTER_API_KEY`
- `SCRY_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `GITHUB_TOKEN`
- `ENABLE_TEST_ENV`

### Deployment notes

- Vercel previews and production need `AUTH_SECRET`.
- `NEXT_PUBLIC_SITE_URL` controls canonical, Open Graph, structured-data, and sitemap URLs. Keep it on `https://dosewiki-admin.vercel.app` while `dose.wiki` / `www.dose.wiki` are construction-gated; set it to `https://dose.wiki` only as part of the explicit public launch.
- Vercel previews and production can use server-side editor password env vars such as `ADMIN_PASSWORD` or `JOSIE` for credentials sign-in; GitHub OAuth is optional.
- The editor save-to-Convex flow needs `CONVEX_ADMIN_KEY` on the server.
- Runtime env validation is centralized in `lib/runtime/envContract.ts` and currently runs in report-only mode for diagnostics.
- Convex runtime targeting is capability-specific in `lib/convex/runtimeTargets.ts`: public server reads prefer `CONVEX_PUBLIC_READ_URL`, `/dev` browser reads prefer `NEXT_PUBLIC_CONVEX_URL`, and privileged writes plus auth membership sync prefer `CONVEX_URL`.
- Compatibility mode preserves legacy write fallback to `VITE_CONVEX_URL`, then `NEXT_PUBLIC_CONVEX_URL`; editor config health reports that risky production fallback as diagnostics.
- Auth compatibility mode preserves `NEXTAUTH_SECRET`, `GITHUB_ID`, and `GITHUB_SECRET` while new deployments should use `AUTH_SECRET`; `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are only needed when enabling the optional GitHub OAuth provider.
- Set `CONVEX_PUBLIC_READ_URL` in local development if you want public App Router pages to read the live production dataset while the `/dev` shell and save flows stay on the local/dev Convex deployment.
- The reagent proxy and protected API handlers run on the Node.js runtime.

## Development Workflow

1. Read `AGENTS.md` and `CLAUDE.md` before changing shared architecture or workflows.
2. Treat Convex as the runtime source of truth.
3. Check the article schema before changing shared content shape.
4. Prefer server-side Convex reads for public App Router routes.
5. Reserve client-side Convex hooks for editor and interaction-heavy surfaces.
6. Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build` before shipping meaningful changes.

### Data-fetching rules

- Public server reads belong in `lib/convex/serverClient.ts`, `lib/convex/publicData.ts`, and `lib/convex/publicLibrary.ts`.
- Metadata should go through `lib/next/metadata.ts`.
- Static param planning belongs in `lib/next/staticParams.ts`.
- Do not reintroduce `SubstanceIndex.json` as the public rendering source.

## Scripts

See [scripts/README.md](scripts/README.md) for the script catalog and the stable workflow command surface.

Common workflows:

### Batch generation

```bash
export OPENROUTER_API_KEY="sk-or-..."
export VITE_CONVEX_URL="https://..."

npm run batch:legality -- --dry-run
npm run batch:history-culture -- --substance=lsd
npm run batch:harm-potential -- --all --concurrency=5
npm run batch:dosage-duration:export
npm run batch:dosage-duration:run
npm run batch:dosage-duration:apply
npm run citations:formal -- --slug=2c-b --dry-run
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
npm run citations:apply-workbench -- --slug=2c-b --dry-run
```

Batch scripts and the Next `/dev` section generator both use the official OpenRouter TypeScript SDK via shared helpers instead of raw `fetch` calls.

Scry public-corpus SQL access is available through `npm run scry:query` with
`SCRY_API_KEY` set in the shell or `.env.local`.

Formal citation drafts default to dry-run and require `--write --confirm-citation-write`
before updating Convex article references or citation evidence rows.

The external citation queue lives in `/Users/josie/.codex/dosewiki-citation-workbench`.
Reviewed workbench `citation-draft.json` output should be adapted through
`npm run citations:apply-workbench`, not by hand-editing local article JSON.
Workbench runs are review-ready only after the six-section status table is
resolved, section worker launches were verified against the citable section set,
existing section outputs pass worker-output checks, remap/proactive scan passed,
missing sections preserve original text without public markers, final validation
passes, and article-wide output is stable, non-empty, and has marker/evidence
parity over accepted section work.
Production rollout uses [docs/citation-production-rollout.md](docs/citation-production-rollout.md):
archive the current public dataset, promote `2c-b` as the canary, verify the
public page, then continue with small common-drug batches.

### Source parsing

```bash
npm run parse:sources
npm run prepopulate:high-confidence -- --dry-run
npm run prepopulate:dosage-duration -- --dry-run
```

### Migrations and sync

```bash
npm run migrate:trip-reports
npm run migrate:effects
npm run prompts:migrate
npm run convex:sync-production -- --confirm-production-sync
```

## Further Reading

| Document | Description |
|----------|-------------|
| [AGENTS.md](AGENTS.md) | Current repo-specific agent guidance |
| [CLAUDE.md](CLAUDE.md) | Operational notes and workflow constraints |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture entrypoint and links to runtime appendices |
| [public/docs/code.html](public/docs/code.html) | Visual codebase overview, served at `/docs/code` |
| [public/docs/how.html](public/docs/how.html) | Visual walkthrough of how articles are made, served at `/docs/how` |
| [CONTEXT.md](CONTEXT.md) | Domain language for the citation workflow |
| [docs/architecture/project-layout.md](docs/architecture/project-layout.md) | Contributor-facing folder map and local artifact hygiene rules |
| [docs/citation-workbench-tracker.md](docs/citation-workbench-tracker.md) | Current citation workbench integration tracker |
| [docs/next-auth-convex-contributor-guide.md](docs/next-auth-convex-contributor-guide.md) | Next/Auth.js/Convex contributor guide |
| [scripts/README.md](scripts/README.md) | Script catalog and examples |
| [notes-and-plans/index.md](notes-and-plans/index.md) | Internal documentation index |
| [notes-and-plans/guides/dosewiki-site-readme.md](notes-and-plans/guides/dosewiki-site-readme.md) | Retired Vite/static app guide; not current architecture |
| [notes-and-plans/guides/dosewiki-visual-style-guide.md](notes-and-plans/guides/dosewiki-visual-style-guide.md) | UI styling guidance |

---

If project workflows, schema ownership, or editor/save paths change, update this file together with `AGENTS.md`, `CLAUDE.md`, and any affected script docs.
