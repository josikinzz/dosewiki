# dose.wiki Architecture

Last verified: 2026-03-30

## Purpose

This document describes the current technical architecture of the `dose.wiki` codebase as it exists in this repository. It is intended to be the root-level technical design / architecture reference for contributors working on the active Next.js + Convex application.

This is a living document. When the system architecture, runtime ownership model, deployment model, or editor workflows change, update this file together with `AGENTS.md`, `README.md`, and any affected operational docs.

## Executive Summary

`dose.wiki` is a Next.js App Router application backed by Convex. The public site serves static and server-rendered pages for substance articles, subjective effects, trip reports, contributor pages, and classification indexes. The protected `/dev` surface is an editorial environment that combines Auth.js session handling, Convex-backed role checks, live Convex reads/writes, and selected GitHub-backed file persistence flows.

The current architecture is a partial modernization rather than a fully greenfield system:

- The active runtime is Next.js + Convex.
- Convex is the source of truth for live runtime content.
- A large amount of file-based tooling still exists for migration, batch generation, exports, and legacy workflows.
- The public App Router shell is in good working order.
- The editor and script layers still contain meaningful legacy complexity.

## System Goals

Primary goals:

- Serve harm-reduction content through a crawlable, production-grade public web application.
- Store and fetch live content from Convex.
- Support editorial maintenance, generation workflows, and metadata curation through a protected admin/editor UI.
- Preserve the ability to run migrations, imports, exports, and batch AI-assisted content workflows from local scripts.

Non-goals of the active runtime:

- Running the old Vite shell as a first-class application path.
- Treating `src/data/SubstanceIndex.json` as the canonical public rendering source.
- Anonymous editing or password-only browser-side write flows.

## Current Verified System State

As of 2026-03-30, the current live data and build surface verified from the repo and local environment are:

- 577 substances
- 248 visible substances
- 329 low-priority substances
- 233 subjective effects
- 163 trip reports
- 12 psychoactive layout categories
- 43 chemical-class layout categories
- 20 mechanism layout categories
- 1,898 prerendered pages in the current production build

Local validation status at the time of this document:

- `npm run test`: passes
- `npm run lint`: passes
- `npm run typecheck`: passes
- `npm run build`: passes

## Technology Stack

Application stack:

- Next.js 16 App Router
- React 18
- TypeScript
- Tailwind CSS
- Auth.js (`next-auth`)
- Convex
- TanStack Query
- Radix UI
- Zod
- Vitest + Testing Library

Supporting infrastructure / integrations:

- Vercel-style deployment model for the Next app
- Upstash Redis for rate limiting when configured
- GitHub token-backed file persistence for selected editor flows
- ProtestKit proxy integration through a Next route handler
- OpenRouter-backed batch generation through local scripts

## High-Level System Context

There are four distinct operating modes in this repository:

1. Public web runtime
2. Protected editor runtime
3. Convex backend and data model
4. Offline/local scripts for migration, generation, analysis, and asset ingestion

The critical design distinction is that the public and editor runtimes are live application paths, while many scripts and local files are operational support artifacts.

## Architectural Principles

### 1. Convex is the runtime source of truth

Live public pages should read from Convex, not from local JSON.

### 2. Public routes prefer server-side data loading

Public App Router routes should fetch through server helpers in `lib/convex/` and `lib/next/`, not through client-side bootstrapping of the entire dataset.

### 3. Client-side Convex is reserved for interactive/editor surfaces

The editor shell and certain interaction-heavy features can still use live client-side Convex hooks.

### 4. Zod defines the canonical article contract

The Convex schema is intentionally permissive. The stricter content shape lives in `src/schema/substance.schema.ts`.

### 5. Legacy file-backed workflows are tolerated, not canonical

`SubstanceIndex.json`, prompt markdown files, and other local artifacts remain important for scripts and some GitHub-backed editor flows, but they are not the authoritative public runtime state.

## Repository Topology

Top-level areas of responsibility:

- `src/app/`: active Next.js route tree, layouts, metadata routes, route handlers
- `src/features/`: feature-level UI and editor code
- `src/components/`: shared presentation and UI primitives
- `src/data/`: local artifacts, builders, static config, generated schema helpers
- `src/hooks/`: client-side hooks
- `src/schema/`: canonical Zod schemas
- `lib/`: shared server helpers and runtime utilities
- `convex/`: Convex schema and backend functions
- `scripts/`: import/export/migration/batch-generation tooling

Important non-runtime directories still present in the repo:

- `.next/`
- `dist/`
- `dist-inline/`
- `coverage/`
- `archive/`
- `notes-and-plans/`

These should not be treated as part of the active runtime architecture.

## Runtime Architecture

### Public runtime

The public site is built with Next.js App Router under `src/app/`.

Key public paths:

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

Compatibility redirects:

- `/effect/[effectSlug]` → `/effects/[effectSlug]`
- `/data` → `/about`
- `/interactions` → `/substances`

Public route behavior:

- Server components fetch Convex data through `lib/convex/publicData.ts` and `lib/convex/publicLibrary.ts`.
- Metadata is built through `lib/next/metadata.ts`.
- Static route generation is planned through `lib/next/staticParams.ts`.
- Sitemap planning is handled in `lib/next/sitemap.ts` and surfaced at `src/app/sitemap.ts`.
- Robots rules live at `src/app/robots.ts`.

### Shared chrome

The root layout in `src/app/layout.tsx` provides:

- global metadata
- theme bootstrap
- skip link
- route chrome
- footer

`RouteChrome` is a client-side shell component that translates the current pathname into the app’s internal view model and drives the shared header/navigation behavior.

### Editor runtime

The protected editor surface is mounted under `/dev`.

Key components:

- `auth.ts`
- `middleware.ts`
- `src/app/sign-in/page.tsx`
- `src/app/dev/layout.tsx`
- `src/app/dev/[[...segments]]/page.tsx`
- `src/app/dev/_components/NextDevRouteClient.tsx`
- `src/features/dev/`

Protection model:

- middleware redirects unauthenticated users away from `/dev`
- Auth.js session state provides browser identity
- Convex `memberships` is the role source of truth
- only `admin` and `editor` roles may access the editor shell

The editor runtime is more client-heavy than the public shell. It mounts:

- Query client
- Auth session provider
- Convex client provider
- lightweight data provider
- full library provider
- dev-mode context

This allows richer editor workflows at the cost of higher client complexity.

## Data Architecture

### Convex data model

Primary Convex tables:

- `substanceIndex`
- `articleSources`
- `tripReports`
- `subjectiveEffects`
- `effectIndexArticles`
- `replications`
- `memberships`
- `indexLayouts`
- `categoryLayout`
- `siteConfig`
- `prompts`
- `quotes`
- `changelog`

### Why the Convex schema is permissive

The schema in `convex/schema.ts` validates the essential top-level shape for major tables, but many nested article fields use `v.any()`. This is a deliberate tradeoff:

- article content has many optional/legacy variations
- the article contract evolves faster than the Convex schema
- the strict content definition is maintained in Zod on the application side

This reduces schema churn but makes application-level discipline more important.

### Article schema ownership

Canonical article structure is defined in:

- `src/schema/substance.schema.ts`

Generated schema helpers live in:

- `src/data/schema/`

Key article sections modeled there include:

- identification
- classification
- summary
- dosage
- duration
- subjective effects
- pharmacology
- interactions
- tolerance
- harm potential
- history/culture
- legality
- citations

### Derived public library model

The app does not use raw articles directly for every page. It derives a higher-level library model for search and classification navigation through:

- `src/data/builders/libraryBuilder.ts`
- `src/data/builders/contentBuilder.ts`
- `src/data/builders/search.ts`

`lib/convex/publicLibrary.ts` builds and caches this derived structure from Convex data plus layout configuration.

This derived library powers:

- category detail pages
- mechanism detail pages
- classification pages
- search suggestions and search results
- effect-to-substance associations

## Data Flow

### Public page data flow

Typical public page request flow:

1. Next route receives request
2. route-level server component calls helper in `lib/convex/publicData.ts` or `lib/convex/publicLibrary.ts`
3. helper uses `lib/convex/serverClient.ts`
4. `ConvexHttpClient` queries Convex
5. route renders server-side HTML
6. Next caches/revalidates per route settings

### Public classification/search flow

For search and classification pages, raw articles are converted into a derived library:

1. fetch raw substances and layout docs from Convex
2. normalize manual layout definitions
3. build library/index structures in memory
4. resolve page-specific detail object or search results
5. render response

### Editor read flow

Editor pages use client-side Convex queries:

1. user signs in through Auth.js
2. `/dev` page loads `NextDevRouteClient`
3. client mounts a Convex React client using `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL`
4. editor reads category layout, slug map, and full article library from Convex
5. editor state is managed through `DevModeContext` and feature-local form/tool state

### Editor save-to-Convex flow

The preferred live-content save path is:

1. client collects article/about/changelog payload
2. client calls `POST /api/save-to-convex`
3. route enforces rate limit
4. route requires an Auth.js editor session
5. route checks for `CONVEX_ADMIN_KEY`
6. route writes through generated Convex mutations
7. route optionally writes changelog entry
8. route revalidates affected public paths
9. client receives verification/revalidation metadata

This is the cleanest write path in the current system because it preserves Convex as the live store.

### GitHub-backed file save flow

Selected workflows still persist to GitHub-managed files:

- `POST /api/save-substance-index`
- `POST /api/save-user-profile`

These routes:

- require an editor session
- require `GITHUB_TOKEN`
- validate request payloads
- call helpers in `lib/server/github/`
- write repository files through GitHub APIs

These flows exist because not all operational/editor data has been fully consolidated behind Convex-only editing.

## Auth and Authorization

### Auth.js

Auth.js configuration lives in `auth.ts`.

Supported sign-in modes:

- GitHub OAuth when configured
- development-only legacy credentials fallback when GitHub OAuth is absent

Session model:

- JWT session strategy
- session user object enriched with role
- role synchronized from Convex `memberships`

### Membership synchronization

On sign-in, the app syncs user identity into Convex:

- `lib/auth/convexMemberships.ts`
- `convex/memberships.ts`

Role resolution:

- `AUTH_ADMIN_EMAILS` can bootstrap first admin users
- existing membership role is preserved otherwise
- allowed roles are `admin`, `editor`, `viewer`

### Route protection

Public route protection layers:

- `middleware.ts` protects `/dev`
- `src/lib/auth/requireEditorSession.ts` protects sensitive route handlers

This creates a consistent server-side authorization boundary for protected write actions.

## External Integrations

### Convex

Used for:

- public content reads
- editor data reads
- live content writes
- role/membership data
- prompts, quotes, and site config

### GitHub

Used for:

- selected file-backed persistence flows
- `SubstanceIndex.json`-style history paths
- user profile file updates

### Upstash Redis

Used when configured for:

- API rate limiting in Next route handlers

Fallback behavior:

- if Upstash is not configured or unavailable, rate limiting falls back to in-memory counters

### ProtestKit

Used through:

- `src/app/api/reagent-proxy/route.ts`

This route applies:

- rate limiting
- CORS origin allowlist
- upstream fetch normalization
- cache headers

## Build and Rendering Strategy

### Rendering modes

The app uses a mix of:

- static routes
- SSG routes with generated params
- dynamic routes for sign-in/editor/API handlers

As of the latest verified build:

- 1,898 static pages are generated
- `/dev` remains dynamic
- API handlers remain dynamic
- `/reports/[slug]` is on-demand

### Revalidation

Most public content routes use:

- `revalidate = 3600`

The save-to-Convex route explicitly revalidates affected article/about paths after successful writes.

## Script Architecture

The repository contains a large operational script surface under `scripts/`.

Major categories:

- `batch/`: AI generation and quote extraction
- `migrate/`: one-time or staged data migrations
- `convex/`: import/export/sync utilities
- `prepopulate/`: derive article content from parsed sources
- `analyze/`: audits and coverage inspection
- `replications/`: effect gallery asset ingestion and maintenance
- `data/`: normalization and maintenance transforms
- `parsers/`: raw source extraction

Important architectural reality:

- many scripts still operate on `src/data/SubstanceIndex.json`
- this is acceptable for migration/tooling use
- this is not acceptable as the public runtime rendering source

This split is one of the main sources of complexity in the repo.

## Testing and Quality Gates

Current built-in quality gates:

- Vitest unit/component tests
- ESLint
- TypeScript typecheck
- production Next build

CI also includes:

- Vercel policy/security checks
- build verification
- type checking

## Known Design Debt

### 1. Runtime/doc drift

The repo has historically carried a mix of legacy and current guidance. Root docs must be kept synchronized with the actual Next/Convex runtime.

### 2. Legacy file-backed workflows

The architecture says Convex is the live source of truth, but many scripts and some editor save paths still use local file artifacts. This creates operational ambiguity.

### 3. Oversized editor modules

The editor surface is concentrated in a few very large files, especially:

- `src/features/dev/pages/DevModePage.tsx`
- `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`
- `src/features/dev/tools/substance-editor/SectionGenerator.tsx`
- `src/data/builders/libraryBuilder.ts`

This increases change risk and makes ownership boundaries weaker than they should be.

### 4. Mixed persistence models

The existence of both:

- Convex-backed live writes
- GitHub-backed file writes

means contributors must know which workflow they are using and why.

### 5. Public contributor model still reflects legacy auth naming

Contributor profile keys and some public routes still expose internal credential-era naming conventions. That should be treated as legacy debt.

## Security and Operational Risks

The main architecture-level risks identified during the repo audit are:

- secrets and operational notes mixed into tracked documentation
- incomplete drift between “Convex-first” policy and file-backed tooling reality
- stale documentation/copy describing obsolete runtime behavior
- public exposure of internal credential-style contributor keys

These are not core framework flaws; they are process and repository hygiene risks.

## Recommended Direction

### Short-term

- keep Convex as the only public runtime source
- favor `save-to-convex` over file-backed editorial flows
- keep docs synchronized with actual runtime behavior
- continue using server-side Convex reads for public routes

### Medium-term

- reduce or isolate remaining GitHub-backed content-editing paths
- split the large editor modules into better-bounded feature components
- further separate operational artifacts from application code
- normalize contributor/public identity away from credential-derived keys

### Long-term

- make the persistence model unambiguous
- reduce the number of workflows that require reasoning about both local JSON and Convex
- retire or archive dead code and unused feature surfaces that are no longer part of the route tree

## File Map for Contributors

Start here for common work:

- Runtime shell: `src/app/`
- Public server reads: `lib/convex/publicData.ts`
- Derived library/search: `lib/convex/publicLibrary.ts`
- Static params and metadata: `lib/next/`
- Auth config: `auth.ts`
- Route protection: `middleware.ts`
- Editor auth guard: `src/lib/auth/requireEditorSession.ts`
- Article schema: `src/schema/substance.schema.ts`
- Convex schema: `convex/schema.ts`
- Convex mutations/queries: `convex/*.ts`
- Editor surface: `src/features/dev/`
- Scripts: `scripts/`

## Maintenance Rules

When architecture changes:

1. update this document
2. update `README.md`
3. update `AGENTS.md`
4. update `CLAUDE.md` if operational guidance changed
5. update any affected script or contributor docs

