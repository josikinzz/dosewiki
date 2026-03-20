# dose.wiki

Front-end for the dose.wiki harm-reduction knowledge base. A React + Tailwind application that renders substance profiles, dosage guidance, subjective effects, trip reports, and interaction references sourced from a Convex real-time database.

---

## Contents
- [Platform Overview](#platform-overview)
- [Data Architecture](#data-architecture)
- [Project Layout](#project-layout)
- [Key Features](#key-features)
- [Build, Run, and Deploy](#build-run-and-deploy)
- [Development Workflow](#development-workflow)
- [Scripts](#scripts)
- [Further Reading](#further-reading)

---

## Platform Overview

- **Type**: Next.js App Router application
- **Primary data source**: Convex database (679 substances, 164 trip reports, 233 subjective effects)
- **Routing**: Path-based URLs (`/lsd`, `/effects`, `/reports/{slug}`, `/dev/articles`)
- **Styling**: Tailwind CSS with dark cosmic theme and fuchsia accent gradients
- **Icons**: [Lucide React](https://lucide.dev/) for consistency
- **Offline**: No separate offline single-file build is maintained

## Data Architecture

**Convex is the source of truth.** All substance data, trip reports, subjective effects, and configuration live in Convex.

```
Convex Database
  ├── substanceIndex     → 679 substance articles
  ├── articleSources     → Scraped source content (~21MB)
  ├── tripReports        → 164 trip reports with timelines
  ├── subjectiveEffects  → 233 effect articles with VCode content
  ├── replications       → Effect videos/images with file storage
  ├── memberships        → Auth.js-backed editor/admin roles
  ├── indexLayouts       → Category page arrangements
  ├── siteConfig         → About page and global settings
  ├── prompts            → AI generation prompts (12 sections)
  ├── quotes             → Extracted source quotes per substance
  └── changelog          → Article modification history

Local files (scripts only):
  ├── SubstanceIndex.json    → Backup/migration scripts
  ├── parsed-sources.json    → Parser output for prepopulation
  └── tripsit-combos.json    → Interaction data
```

**Critical rule**: Never overwrite Convex with local JSON. Fetch from Convex first, modify in memory, sync back.

## Project Layout

```
src/
├── components/
│   ├── common/        # Primitives (SectionCard, GlobalSearch, DiffPreview)
│   ├── dev/           # DevMode system (forms, profile, tags, tools)
│   ├── effects/       # Effect-specific (EffectHero, ReplicationGallery)
│   ├── article/       # ArticleLayout orchestration
│   ├── layout/        # Header, Footer, PageHeader
│   ├── pages/         # Route shells (TripReportsPage, EffectsIndexPage)
│   ├── reports/       # Trip report components
│   ├── sections/      # Article sections (canonical, used everywhere)
│   ├── vcode/         # VCodeRenderer for EffectIndex markup
│   └── ui/            # Radix-based primitives
├── data/
│   ├── SubstanceIndex.json     # Local backup
│   ├── builders/               # contentBuilder, libraryBuilder, search
│   ├── config/                 # tagOptions, sectionPrompts/
│   └── schema/                 # Generated schema utilities
├── hooks/             # useArticleForm, useApiMutations, etc.
├── schema/            # Zod schemas (substance.schema.ts)
├── types/             # TypeScript models
└── utils/             # routing, interactions, slug, seo

convex/
├── schema.ts              # Database schema
├── substanceIndex.ts      # Substance CRUD
├── tripReports.ts         # Trip report queries
├── subjectiveEffects.ts   # Effect queries
├── replications.ts        # Effect media with file storage
├── articleSources.ts      # Source content (on-demand)
└── prompts.ts             # AI generation prompts

scripts/
├── batch/             # Batch AI generation and quote extraction
├── replications/      # Effect replication media management
├── migrate/           # Data migrations (Convex, schema changes)
├── prepopulate/       # Populate articles from parsed sources
├── seed/              # Seed initial Convex data
├── analyze/           # Data analysis and gap detection
├── convex/            # Convex import/export/sync
├── build/             # Build-time scripts (compress, sitemap)
├── parsers/           # Source extraction parsers
└── data/              # Data utilities

api/                   # Vercel serverless endpoints
```

## Key Features

### Substance Articles
- 679 indexed substances (252 high/normal priority visible, 325 low priority direct-URL only)
- Structured sections: dosage, duration, effects, pharmacology, interactions, harm potential, legality, history
- DevMode at `/dev/articles` for content creation with AI assistance

### Trip Reports
- 164 imported reports from EffectIndex
- Timeline-based narratives with onset/peak/offset phases
- Subject metadata (age, setting, medications)

### Subjective Effects
- 233 effect articles with VCode markup
- Replication gallery with videos/images
- Category pages for cognitive, sensory, physical effects

### DevMode
Six tabs at `/dev`:
1. **articles** - AI article generation with source integration
2. **change-log** - Modification tracking
3. **tag-editor** - Manage tags across articles
4. **profile** - Contributor profiles
5. **index-layout** - Category arrangement
6. **about** - About page editor

## Build, Run, and Deploy

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies (Node 20 LTS) |
| `npm run dev` | Next.js dev server at http://localhost:3000 |
| `npm run next:dev` | Alias for the Next.js dev server |
| `npm run build` | Canonical production build |
| `npm run next:build` | Alias for the Next.js production build |
| `npm run start` | Start the built Next.js app |
| `npm run test` | Run Vitest tests |
| `npm run lint` | ESLint with a11y rules |
| `npm run typecheck` | Run TypeScript without emitting |

**Environment**: The Next.js auth path uses `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_ADMIN_EMAILS`, and `NEXTAUTH_URL`. The Next `/dev` shell can use `NEXT_PUBLIC_CONVEX_URL` explicitly, or it falls back to `VITE_CONVEX_URL`. On Vercel previews and production, `AUTH_SECRET` must be present or any route that reads the Auth.js session will fail at runtime; if `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are missing, `/sign-in` renders a disabled GitHub sign-in state and `/dev` remains protected.

**Migration note**: `src/app/` is now the primary shell. The legacy Vite shell and offline inline build path have been retired.

### Auth.js Editor Access

- Active Next auth config lives in `auth.ts`.
- `src/app/sign-in` and `src/app/dev` are the new Auth.js-backed editor entry points.
- Convex `memberships` stores role assignments (`admin`, `editor`, `viewer`).
- `AUTH_ADMIN_EMAILS` bootstraps first admin accounts on sign-in without needing a manual seed script.
- Protected Next API routes now live in `src/app/api/save-substance-index/route.ts`, `src/app/api/save-user-profile/route.ts`, and `src/app/api/test-env/route.ts`.
- Those protected routes require an Auth.js session plus a Convex-backed `admin` or `editor` role.
- `src/app/api/reagent-proxy/route.ts` replaces the public reagent proxy in the Next shell.
- The Next editor now mounts at `src/app/dev/[[...segments]]/page.tsx` and preserves deep links like `/dev/articles/lsd`.
- If GitHub OAuth is not configured locally, the sign-in screen can expose a development-only Auth.js credentials fallback backed by the legacy password env vars.
- Shared GitHub commit helpers now live in `lib/server/github/` and are used by the Next route handlers directly.

## Development Workflow

1. **Read CLAUDE.md** - Contains operational constraints and patterns
2. **Consult style guide** - `notes-and-plans/guides/dosewiki-visual-style-guide.md`
3. **Read contributor guide** - `docs/next-auth-convex-contributor-guide.md`
4. **Source from Convex** - Never hard-code substance data
5. **Run tests** - `npm run test`
6. **Build** - `npm run build` after changes

### Next.js Data Fetching Rules

- Public Next routes should use `lib/convex/serverClient.ts` and `lib/convex/publicData.ts` for server-side Convex reads.
- Reuse `lib/next/metadata.ts` and `lib/next/sitemap.ts` when adding metadata or future sitemap routes.
- Keep client-side Convex hooks for live or interaction-heavy surfaces such as editor tooling, search interactions, and similar islands.
- Do not reintroduce `SubstanceIndex.json` as the primary source for public Next rendering.

### Next.js SEO Rules

- Public metadata should be generated with `buildPageMetadata` in `lib/next/metadata.ts`.
- `src/app/sitemap.ts` and `src/app/robots.ts` are the canonical SEO routes for the active app shell.

## Scripts

See [scripts/README.md](scripts/README.md) for full documentation.

## Contributor Guide

- `docs/next-auth-convex-contributor-guide.md` summarizes the route, auth, and data ownership rules for the current architecture.

### Batch Generation
```bash
export OPENROUTER_API_KEY="sk-or-..."
export VITE_CONVEX_URL="https://..."

node scripts/batch/batch-generate-legality.mjs --dry-run
node scripts/batch/batch-generate-history-culture.mjs --substance=lsd
node scripts/batch/batch-generate-harm-potential.mjs --all --concurrency=5
```

### Source Parsing
```bash
npm run parse:sources                              # Extract to parsed-sources.json
node scripts/prepopulate/prepopulate-*.mjs         # Populate articles from parsed data
```

### Migrations
```bash
node scripts/migrate/migrate-trip-reports.mjs      # Import trip reports
node scripts/migrate/migrate-effects.mjs           # Import subjective effects
node scripts/migrate/migrate-prompts-to-convex.mjs # Sync prompts
```

## Further Reading

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Comprehensive development guidelines |
| [notes-and-plans/index.md](notes-and-plans/index.md) | Documentation index |
| [notes-and-plans/guides/dosewiki-site-readme.md](notes-and-plans/guides/dosewiki-site-readme.md) | Deep architecture |
| [notes-and-plans/guides/dosewiki-visual-style-guide.md](notes-and-plans/guides/dosewiki-visual-style-guide.md) | UI styling |
| [.claude/skills/batch/SKILL.md](.claude/skills/batch/SKILL.md) | Batch generation guide |

---

Questions or improvements? Open an issue or update `notes-and-plans/` docs.
