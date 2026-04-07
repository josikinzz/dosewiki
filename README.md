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
- **Frontend**: React 18 + TypeScript + Tailwind CSS
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
changelog            → article change history
```

### Local data files

Local JSON and markdown files still exist for backup, migration, export/import, batch generation, and selected GitHub-backed editing flows. They are **not** the authoritative public runtime state.

Key local artifacts:

- `src/data/SubstanceIndex.json`
- `src/data/parsed-sources.json`
- `src/data/config/userProfiles.json`
- `src/data/config/generatorPrompt.md`
- `src/data/config/sectionPrompts/*.md`

### Schema ownership

- Canonical article contract: `src/schema/substance.schema.ts`
- Generated schema helpers: `src/data/schema/`
- Convex schema: `convex/schema.ts`

The Convex schema is intentionally permissive. The Zod schema is the stricter article definition used by the app.

## Project Layout

```text
src/
├── app/                 # Next.js App Router shell, routes, metadata routes, API handlers
├── features/
│   ├── article/         # Substance article rendering
│   ├── dev/             # Protected editor surface and tools
│   ├── effects/         # Subjective effect pages and VCode renderer
│   ├── reports/         # Trip report pages
│   └── graph/           # Graph feature code (not part of the active route tree)
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

This repository still contains legacy or generated material that is not part of the active runtime path, including `.next/`, `dist/`, `dist-inline/`, `coverage/`, `archive/`, and `notes-and-plans/`.

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
- `/about`

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

### Auth and authorization

- Auth config: `auth.ts`
- Middleware gate for `/dev`: `middleware.ts`
- Role source of truth: Convex `memberships`
- Bootstrap admins: `AUTH_ADMIN_EMAILS`
- Allowed editor roles: `admin`, `editor`

If GitHub OAuth is not configured locally, the sign-in page can fall back to a development-only credentials provider backed by the legacy password env vars.

### Protected API handlers

- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-substance-index/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/reagent-proxy/route.ts`
- `src/app/api/search-suggestions/route.ts`
- `src/app/api/test-env/route.ts`

The preferred editor write path for live content is `save-to-convex`. GitHub-backed routes remain in the repo for selected file-backed workflows.

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
| `npm run generate:schema` | Regenerate schema helpers |
| `npm run parse:sources` | Parse raw source files and print stats |

### Key environment variables

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_ADMIN_EMAILS`
- `NEXTAUTH_URL`
- `CONVEX_URL`
- `VITE_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_PUBLIC_READ_URL`
- `CONVEX_ADMIN_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `GITHUB_TOKEN`

### Deployment notes

- Vercel previews and production need `AUTH_SECRET`.
- The editor save-to-Convex flow needs `CONVEX_ADMIN_KEY` on the server.
- The public/editor shell needs a readable Convex URL from `CONVEX_URL`, `VITE_CONVEX_URL`, or `NEXT_PUBLIC_CONVEX_URL`.
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

See [scripts/README.md](scripts/README.md) for the script catalog.

Common workflows:

### Batch generation

```bash
export OPENROUTER_API_KEY="sk-or-..."
export VITE_CONVEX_URL="https://..."

node scripts/batch/batch-generate-legality.mjs --dry-run
node scripts/batch/batch-generate-history-culture.mjs --substance=lsd
node scripts/batch/batch-generate-harm-potential.mjs --all --concurrency=5
node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs
node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs
node scripts/batch/apply-dosage-duration-rewrite-results.mjs
```

Batch scripts and the Next `/dev` section generator both use the official OpenRouter TypeScript SDK via shared helpers instead of raw `fetch` calls.

### Source parsing

```bash
npm run parse:sources
node scripts/prepopulate/prepopulate-*.mjs
```

### Migrations and sync

```bash
node scripts/migrate/migrate-trip-reports.mjs
node scripts/migrate/migrate-effects.mjs
node scripts/migrate/migrate-prompts-to-convex.mjs
node scripts/convex/sync-convex-to-production.mjs
```

## Further Reading

| Document | Description |
|----------|-------------|
| [AGENTS.md](AGENTS.md) | Current repo-specific agent guidance |
| [CLAUDE.md](CLAUDE.md) | Operational notes and workflow constraints |
| [docs/next-auth-convex-contributor-guide.md](docs/next-auth-convex-contributor-guide.md) | Next/Auth.js/Convex contributor guide |
| [scripts/README.md](scripts/README.md) | Script catalog and examples |
| [notes-and-plans/index.md](notes-and-plans/index.md) | Internal documentation index |
| [notes-and-plans/guides/dosewiki-site-readme.md](notes-and-plans/guides/dosewiki-site-readme.md) | Deep architecture notes |
| [notes-and-plans/guides/dosewiki-visual-style-guide.md](notes-and-plans/guides/dosewiki-visual-style-guide.md) | UI styling guidance |

---

If project workflows, schema ownership, or editor/save paths change, update this file together with `AGENTS.md`, `CLAUDE.md`, and any affected script docs.
