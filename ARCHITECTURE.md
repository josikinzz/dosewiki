# dose.wiki Architecture

Last verified: 2026-04-23

## Purpose

This document is the root architecture entrypoint for contributors working on the active Next.js + Convex application in this repository.

It should stay focused on current-state architecture and decision support. Fast-changing deep dives live in companion appendices:

- [Runtime and Data Architecture](docs/architecture/runtime-and-data.md)
- [Operations and Direction](docs/architecture/operations-and-direction.md)
- [Project Layout](docs/architecture/project-layout.md)

When the system architecture, runtime ownership model, or deployment model changes, update this file together with `AGENTS.md`, `README.md`, and any affected appendix.

## Executive Summary

`dose.wiki` is a Next.js App Router application backed by Convex. The public site serves static and server-rendered pages for substance articles, subjective effects, trip reports, contributor pages, and classification indexes. The protected `/dev` surface is an editorial environment that combines Auth.js session handling, Convex-backed role checks, live Convex reads and writes, and selected GitHub-backed file persistence flows.

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

Supporting infrastructure and integrations:

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

Top-level areas of responsibility:

- `src/app/`: active Next.js route tree, layouts, metadata routes, route handlers
- `src/features/`: feature-level UI and editor code
- `src/components/`: shared presentation and UI primitives
- `src/data/`: local artifacts, builders, static config, generated schema helpers
- `src/hooks/`: client-side hooks
- `src/schema/`: canonical Zod schemas
- `lib/`: shared server helpers and runtime utilities
- `convex/`: Convex schema and backend functions
- `scripts/`: import, export, migration, and batch-generation tooling

Important non-runtime directories that may be present locally:

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

`RouteChrome` is a client-side shell component that translates the current pathname into the app’s internal view model and drives the shared header and navigation behavior.

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

## Companion References

Use the appendices for the parts of the architecture that change more often than the root system map:

- [Runtime and Data Architecture](docs/architecture/runtime-and-data.md)
  Update when data-flow shape, auth enforcement, or integration boundaries change.
- [Operations and Direction](docs/architecture/operations-and-direction.md)
  Update when build strategy, script ownership, quality gates, or roadmap priorities change.
- [Project Layout](docs/architecture/project-layout.md)
  Update when folder ownership, generated artifact policy, or repository hygiene rules change.

## Maintenance Rules

When architecture changes:

1. update this document
2. update the affected appendix
3. update `README.md` if user-facing guidance changed
4. update `AGENTS.md`
5. update `CLAUDE.md` if operational guidance changed
6. update any affected script or contributor docs
