# dose.wiki Architecture

Last verified: 2026-08-16

## Purpose

This document is the root architecture entrypoint for contributors working on the active Next.js + Convex application in this repository.

It should stay focused on current-state architecture and decision support. Fast-changing deep dives live in companion appendices:

- [Runtime and Data Architecture](docs/architecture/runtime-and-data.md)
- [Operations and Direction](docs/architecture/operations-and-direction.md)
- [Project Layout](docs/architecture/project-layout.md)

When the system architecture, runtime ownership model, or deployment model changes, update this file together with `AGENTS.md`, `README.md`, and any affected appendix.

## Executive Summary

This repository produces the dose.wiki and Effect Index Next.js App Router builds. Both read the same production Convex deployment, `prod:glad-minnow-656`; the build-time site flavor changes presentation and organization, not content ownership. Public routes use static generation and ISR where their modules declare it. Their CSP permits the inline framework scripts required by cached App Router documents without introducing request-bound state in the root layout. Protected `/dev` routes are request-rendered with a strict per-request nonce policy. The editor combines Auth.js identity, Convex-backed roles, live Convex reads and writes, and selected GitHub-backed persistence.

The current architecture is a partial modernization rather than a fully greenfield system:

- The active runtime is Next.js + Convex, compiled into dose.wiki and Effect Index site flavors.
- Production Convex (`prod:glad-minnow-656`) is the shared runtime source of truth for both builds and every environment.
- A large amount of file-based tooling still exists for migration, batch generation, exports, and legacy workflows.
- The public App Router shell is in good working order.
- The editor and script layers still contain meaningful legacy complexity.
- Generated section review is separated from publication: proposal adapters receive query-only Convex capabilities and emit immutable digest-bound artifacts, while the single-artifact publisher requires an explicit reviewer approval, registered editor identity, scoped token, and deployment-bound section-scoped Convex compare-and-swap mutation with a transactional audit row.

## System Goals

Primary goals:

- Serve harm-reduction content through crawlable, production-grade public builds for dose.wiki and Effect Index.
- Store and fetch live content from Convex.
- Support editorial maintenance, generation workflows, and metadata curation through a protected admin/editor UI.
- Preserve the ability to run migrations, imports, exports, and batch AI-assisted content workflows from local scripts.

Non-goals of the active runtime:

- Running the old Vite shell as a first-class application path.
- Treating `src/data/SubstanceIndex.json` as the canonical public rendering source.
- Anonymous editing or password-only browser-side write flows.

## Current System State

Use source files instead of cached counts or command results:

- `src/app/` is the route map.
- `src/schema/substance.schema.ts` defines the canonical article shape.
- `convex/schema.ts` and the modules under `convex/` define persisted tables and backend functions.
- `src/config/siteFlavor.ts` defines the two build-time publication identities.
- `package.json` and `bun.lock` define dependencies, versions, scripts, and the locked install.
- `middleware.ts` and `src/lib/auth/roles.ts` define host gates and protected-route access.

Public pages may use static generation or ISR; protected `/dev` HTML retains a unique CSP nonce per document response.

## Technology Stack

The core application uses Next.js App Router, React, TypeScript, Tailwind CSS, Auth.js, Convex, TanStack Query, Radix UI, Zod, and Vitest. `package.json` and `bun.lock` are the authoritative dependency and version inventory.

Representative supporting integrations include Vercel deployment, optional Upstash Redis rate limiting, GitHub-backed persistence for selected editor flows, imported ProtestKit reagent snapshots, OpenRouter-backed local generation, and the repository-owned OpenChemLib fork.

## High-Level System Context

There are four distinct operating modes in this repository:

1. Public web runtime
2. Protected editor runtime
3. Convex backend and data model
4. Offline and local scripts for migration, generation, analysis, and asset ingestion

The critical design distinction is that the public and editor runtimes are live application paths, while many scripts and local files are operational support artifacts.

## Architectural Principles

### 1. Convex is the runtime source of truth

Live public pages should read from Convex, not from local JSON.

### 2. Public routes prefer server-side data loading

Public App Router routes should fetch through server helpers in `lib/convex/` and `lib/next/`, not through client-side bootstrapping of the entire dataset.

### 3. Client-side Convex is reserved for interactive and editor surfaces

The editor shell and certain interaction-heavy features can still use live client-side Convex hooks.

### 4. Zod defines the canonical article contract

The Convex schema is intentionally permissive. The stricter content shape lives in `src/schema/substance.schema.ts`.

### 5. Legacy file-backed workflows are tolerated, not canonical

`SubstanceIndex.json`, prompt markdown files, and other local artifacts remain important for scripts and some GitHub-backed editor flows, but they are not the authoritative public runtime state.

## Repository Topology

Representative top-level areas; [Project Layout](docs/architecture/project-layout.md) is the detailed ownership map:

- `src/app/`: active Next.js route tree, layouts, metadata routes, route handlers
- `src/features/`: feature-level UI and editor code
- `src/components/`: shared presentation and UI primitives
- `src/data/`: local artifacts, builders, static config, generated schema helpers
- `src/hooks/`: client-side hooks
- `src/schema/`: canonical Zod schemas
- `lib/`: shared server helpers and runtime utilities
- `convex/`: Convex schema and backend functions
- `scripts/`: import, export, migration, and batch-generation tooling
- `vendor/openchemlib/`: self-contained OpenChemLib source and committed browser distributables owned by DoseWiki

Generated build output, coverage, archives, and planning notes are operational artifacts rather than active runtime architecture. `.gitignore` and the Project Layout appendix are the current source pointers.

## Runtime Architecture

### Public runtime

Both public site flavors are built from the Next.js App Router tree under `src/app/`.

The complete dose.wiki build is available at `https://dosewiki-admin.vercel.app/`. `dose.wiki` and `www.dose.wiki` remain construction-gated through 2026-08-31 and require explicit user authorization to launch.

Representative public route families:

- substance index and articles: `/substances`, `/[slug]`
- effects: `/effects`, `/effects/[effectSlug]`, `/effects/category/[categorySlug]`
- editorial content: `/articles/[slug]`, `/blog/[slug]`, `/reports/[slug]`
- replications: `/replications` and its artist/effect focus routes
- taxonomy: `/category/[categoryKey]`, `/chemical-classes/[classKey]`, `/psychoactive/[...summaryPath]`, `/mechanism/[mechanismSlug]`
- contributors: `/contributors/[profileKey]`

The route tree in `src/app/` and the route planners under `lib/next/` are authoritative; this list is not exhaustive.

Legacy compatibility-only routes redirect to canonical destinations:

- `/effect/[effectSlug]` → `/effects/[effectSlug]`
- `/data` → `/about`
- `/interactions` → `/substances`

Public route behavior:

- Server components fetch Convex data through `lib/convex/publicData.ts` and `lib/convex/publicLibrary.ts`.
- Route-level `revalidate` and `generateStaticParams` declarations are effective because the shared root layout does not consume request-bound APIs.
- The read-only `/api/v1` surface exposes versioned, public-safe substance projections with cursor pagination, wildcard read CORS, CDN caching, and a dedicated rate-limit policy. These routes are narrowly allowed through the public construction-host gate.
- Metadata is built through `lib/next/metadata.ts`.
- Static route generation is planned through `lib/next/staticParams.ts`.
- Sitemap planning is handled in `lib/next/sitemap.ts` and surfaced at `src/app/sitemap.ts`.
- Robots rules live at `src/app/robots.ts`.

### Shared chrome

Representative root-layout responsibilities in `src/app/layout.tsx` include:

- global metadata
- theme bootstrap
- skip link
- route chrome
- footer

`RouteChrome` is a client-side shell component that translates the current pathname into the app’s internal view model and drives the shared header and navigation behavior.

### Editor runtime

Protected routes are mounted under `/dev`. Their access and composition are defined by `middleware.ts`, `src/lib/auth/roles.ts`, `src/app/dev/`, and `src/features/dev/`.

Protection model:

- middleware redirects unauthenticated users away from every `/dev` route, including `/dev/profile`
- any authenticated session may use the profile-only `/dev/profile` route
- Auth.js session state provides browser identity
- Convex `memberships` is the role source of truth
- only `admin` and `editor` roles may enter the full editor shell

The full editor runtime is more client-heavy than the public shell. Representative providers include:

- Query client
- Auth session provider
- Convex client provider
- lightweight data provider
- full library provider
- dev-mode context

This allows richer editor workflows at the cost of higher client complexity.

## Companion References

Use the appendices for the parts of the architecture that change more often than the root system map:

- [Runtime and Data Architecture](docs/architecture/runtime-and-data.md)
  Update when data-flow shape, auth enforcement, or integration boundaries change.
- [Operations and Direction](docs/architecture/operations-and-direction.md)
  Update when build strategy, script ownership, quality gates, or roadmap priorities change.
- [Project Layout](docs/architecture/project-layout.md)
  Update when folder ownership, generated artifact policy, or repository hygiene rules change.
- [DoseWiki-owned OpenChemLib fork](docs/architecture/openchemlib-fork.md)
  Use for fork provenance, rebuilds, artifact verification, and fine-rotation behavior.

## Maintenance Rules

When architecture changes:

1. update this document
2. update the affected appendix
3. update `README.md` if user-facing guidance changed
4. update `AGENTS.md`
5. update `CLAUDE.md` if operational guidance changed
6. update any affected script or contributor docs
