# Operations and Direction

Last verified: 2026-03-30

This appendix holds the operational guidance, quality gates, known debt, and recommended direction that support the root [ARCHITECTURE.md](../../ARCHITECTURE.md).

Update this file when build strategy, script ownership, quality gates, roadmap priorities, or contributor maintenance rules change.

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

1. update `ARCHITECTURE.md`
2. update this appendix if the detailed operational guidance changed
3. update `README.md`
4. update `AGENTS.md`
5. update `CLAUDE.md` if operational guidance changed
6. update any affected script or contributor docs
