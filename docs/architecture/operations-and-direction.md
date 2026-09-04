# Operations and Direction

Last verified: 2026-08-16

This appendix holds the operational guidance, quality gates, known debt, and recommended direction that support the root [ARCHITECTURE.md](../../ARCHITECTURE.md).

Update this file when build strategy, script ownership, quality gates, roadmap priorities, or contributor maintenance rules change.

## Build and Rendering Strategy

### Rendering modes

The app uses a mix of:

- static routes
- SSG routes with generated params
- dynamic routes for sign-in/editor/API handlers

Use the current `next build` route summary when a point-in-time page count is needed. In the route configuration:

- `/dev` and API handlers remain dynamic
- `/reports/[slug]` pre-renders known slugs through `generateStaticParams`; default dynamic-params behavior permits other slugs on demand

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

Current script boundary:

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
- redacted secret scanning across every Git-tracked file type
- non-blocking production and full dependency-audit artifacts

The rollout and promotion criteria for these controls live in
[Security CI](../agents/security-ci.md).

### Test ownership policy

Every test needs a stable placement and an explicit reason to exist. Reviewers should be able to name the owning layer for any new test file.

- One observable contract is tested once, at the lowest stable layer that fully expresses it (pure model or helper before hook, hook before component, component before page or route).
- Higher layers test integration only: wiring, state transitions, and user-visible outcomes. They never recompute a calculation a lower layer already proves.
- Source-text scans are reserved for named architecture policies (forbidden production write APIs, archive and deprecated boundaries, route reachability, generated-data lineage, command-surface classification). They live behind `src/test/sourceScan.ts`, name the prohibited outcome in the test title, and report the offending file. Imports, helper names, class strings, directives, and formatting are not policies.
- Static catalogs and generated data are checked with structural invariants (uniqueness, referential integrity, required fields), not verbatim snapshots of editorial content.
- Tests that need external artifacts ship a small committed or temp-generated synthetic fixture that preserves the real digest and precondition logic. A test may not silently skip because a workstation path, campaign directory, or private artifact is absent.
- Completed one-time workflows are archived under `scripts/deprecated/` as fail-closed wrappers together with their tests, not kept live.
- UI tests query by role, accessible name, state, focus, visibility, and rendered output. A class assertion is allowed only when that class is a documented public style contract in `docs/ui-kit.md`.
- Runners stay as they are: root Vitest for `src/**` and `lib/**`, `npm run test:workflow` for `scripts/**` and `tools/**`, `npm run openchemlib:test` for the vendored fork. No new runner or convention is introduced for a single test.

`npm run test:evidence` writes `.test-evidence/report.md` (and `report.json`) with per-file runtime for every lane, the skipped suites and cases, `setup:rdkit-or-wasm` tags for files that load RDKit, OpenChemLib, or wasm, and, with `--runs N`, a flake classification that separates files whose outcome differed across runs from files that failed every run. It exits 2 when a safety-listed fixture-backed test skips. Slow files are ranked so their setup cost can be shared or reduced; no test is deleted only because it is slow.

The rationale and the file-level audit behind this policy are in [docs/audits/test-suite-rationalization-plan.html](../audits/test-suite-rationalization-plan.html).

## Known Design Debt

### 1. Runtime/doc drift

The repo has historically carried a mix of legacy and current guidance. Root docs must be kept synchronized with the actual Next/Convex runtime.

### 2. Legacy file-backed workflows

The architecture says Convex is the live source of truth, but many scripts and some editor save paths still use local file artifacts. This creates operational ambiguity.

### 3. Mixed persistence models

The existence of both:

- Convex-backed live writes
- GitHub-backed file writes

means contributors must know which workflow they are using and why.

### 4. Public contributor model still reflects legacy auth naming

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

1. update the authoritative code or configuration owner
2. update `ARCHITECTURE.md` or this appendix when its scoped summary changes
3. update contributor docs only when their pointer, scope summary, or distinct audience contract changes
