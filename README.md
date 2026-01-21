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

- **Type**: Client-side single page application with Convex backend
- **Primary data source**: Convex database (679 substances, 164 trip reports, 233 subjective effects)
- **Routing**: Path-based URLs (`/lsd`, `/effects`, `/reports/{slug}`, `/dev/articles`)
- **Styling**: Tailwind CSS with dark cosmic theme and fuchsia accent gradients
- **Icons**: [Lucide React](https://lucide.dev/) for consistency
- **Offline**: `npm run build:inline` outputs a single self-contained HTML file

## Data Architecture

**Convex is the source of truth.** All substance data, trip reports, subjective effects, and configuration live in Convex.

```
Convex Database
  ├── substanceIndex     → 679 substance articles
  ├── articleSources     → Scraped source content (~21MB)
  ├── tripReports        → 164 trip reports with timelines
  ├── subjectiveEffects  → 233 effect articles with VCode content
  ├── replications       → Effect videos/images with file storage
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
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Production build to `dist/` |
| `npm run build:inline` | Single-file HTML for offline |
| `npm run test` | Run Vitest tests |
| `npm run lint` | ESLint with a11y rules |

**Environment**: Requires `VITE_CONVEX_URL` for database connection.

## Development Workflow

1. **Read CLAUDE.md** - Contains operational constraints and patterns
2. **Consult style guide** - `notes-and-plans/guides/dosewiki-visual-style-guide.md`
3. **Source from Convex** - Never hard-code substance data
4. **Run tests** - `npm run test`
5. **Build inline** - `npm run build:inline` after changes

## Scripts

See [scripts/README.md](scripts/README.md) for full documentation.

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
