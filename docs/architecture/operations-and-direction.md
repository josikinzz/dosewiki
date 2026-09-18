# Operations and Direction

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

Route cache behavior is owned by the route modules and the Postgres publication
outbox. Inspect the current route's `revalidate` export and its matching
`lib/postgres/` publication transaction before changing freshness behavior.
`/api/save-article` writes through the native Postgres handlers and revalidates
the affected public paths.

Persistent public cache keys use an opaque digest for Postgres target identity,
never a connection URL: Next includes those keys in revalidation errors.
Gallery taxonomy joins drain batches and collect matching artists together,
including during background refreshes, rather than issuing an indexed network
read for every artist. The Postgres adapter pages collections and currently
evaluates their filters in-process; do not describe this as one SQL statement.
Pool and transaction bounds belong to `lib/postgres/transactionTimeouts.ts`.
Do not hide checkout exhaustion or convert failed reads into empty content.

Sequential cached page, media-detail, and taxonomy drains opt into `publicDataCache`'s
`awaitRefresh` barrier. A stale Next cache hit otherwise starts a background read
and immediately advances the cursor, flooding the four-connection pool.
The barrier waits for the refresh already started by that invocation, preserving
the 15-minute freshness policy, bounded cache entries, and Next's stale-on-error
behavior. Other public leaves retain ordinary stale-while-revalidate behavior.

## Script Architecture

Operational tools live under `scripts/`, grouped by their actual directory:

- `postgres/`: schema generation, guarded migration, import, rehearsal, rollback export, and environment isolation
- `batch/`: AI generation and quote extraction
- `migrate/`: bounded content transforms
- `data-ops/`: guarded native data maintenance utilities
- `prepopulate/`: fill article identification and source citations from local inputs
- `analyze/`: audits and reachability checks
- `replications/`: effect gallery asset ingestion and maintenance
- `data/`: normalization and maintenance transforms
- `parsers/`: raw source extraction

PlanetScale Postgres is the production runtime authority. Local JSON and
generated artifacts remain inputs, exports, fixtures, or recovery material only
where their owning script says so. Native operators select Postgres explicitly.

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
[Security CI](../operations/security-ci.md).

### Test ownership policy

Every test needs a stable placement and an explicit reason to exist. Reviewers should be able to name the owning layer for any new test file.

- One observable contract is tested once, at the lowest stable layer that fully expresses it (pure model or helper before hook, hook before component, component before page or route).
- Higher layers test integration only: wiring, state transitions, and user-visible outcomes. They never recompute a calculation a lower layer already proves.
- Source-text scans are reserved for named architecture policies (forbidden production write APIs, archive and deprecated boundaries, route reachability, generated-data lineage, command-surface classification). They live behind `src/test/sourceScan.ts`, name the prohibited outcome in the test title, and report the offending file. Imports, helper names, class strings, directives, and formatting are not policies.
- Static catalogs and generated data are checked with structural invariants (uniqueness, referential integrity, required fields), not verbatim snapshots of editorial content.
- Tests that need external artifacts ship a small committed or temp-generated synthetic fixture that preserves the real digest and precondition logic. A test may not silently skip because a workstation path, campaign directory, or private artifact is absent.
- Retire completed one-time workflows and their tests only after checking active consumers and verifying private recovery copies. Keep a fail-closed command boundary only while a concrete consumer still requires it.
- UI tests query by role, accessible name, state, focus, visibility, and rendered output. A class assertion is allowed only when that class is a documented public style contract in [the UI kit](../design/ui-kit.md).
- Runners stay as they are: root Vitest for `src/**` and `lib/**`, `npm run test:workflow` for `scripts/**`, `npm run openchemlib:test` for the vendored fork. No new runner or convention is introduced for a single test.

`npm run test:evidence` writes `.test-evidence/report.md` (and `report.json`) with per-file runtime for every lane, the skipped suites and cases, `setup:rdkit-or-wasm` tags for files that load RDKit, OpenChemLib, or wasm, and, with `--runs N`, a flake classification that separates files whose outcome differed across runs from files that failed every run. It exits 2 when a safety-listed fixture-backed test skips. Slow files are ranked so their setup cost can be shared or reduced; no test is deleted only because it is slow.

## Current Direction

PlanetScale Postgres is the public and editor runtime source of truth.
`DATA_WRITES_FROZEN=1` is a hard no-write gate, not a deployment mode to work
around. Production scripts must use the shared data-operations command surface:
an explicit `TARGET_POSTGRES_URL`, `DATA_BACKEND=postgres`, `--allow-remote`,
`POSTGRES_IMPORT_CONFIRM`, a dry-run plan, and the operation-specific write
confirmation. Never forward arbitrary migration arguments or infer a production
writer from application fallback variables.

There is no alternate database backend. Application rollback restores a previous
compatible Postgres artifact and configuration; any exceptional database recovery
requires separate owner approval.

Current maintenance priorities are:

- keep runtime and operator documentation aligned with the Postgres adapters
- keep generated inputs, source provenance, rights evidence, and rollback
  material under their owning retention contracts
- keep operational outputs private or ignored unless a current runtime consumer
  requires a committed input
- retire dead compatibility surfaces only after their observation or recovery
  window closes and an owner approves the removal

## File Map for Contributors

Start from the current tree rather than audit-era file counts:

- Runtime routes and APIs: `src/app/`
- Feature UI and editor workflows: `src/features/`
- Postgres runtime, transactions, and schema: `lib/postgres/`
- Public server data adapters: `lib/data/`
- Static params and metadata: `lib/next/`
- Auth config and policy: `auth.ts`, `lib/auth/`
- Route protection: `src/middleware.ts`
- Protected route wrapper: `src/lib/http/protectedRouteOperation.ts`
- Article schema: `src/schema/substance.schema.ts`
- Authored Postgres handlers: `server/`
- Operational tools: `scripts/`

## Maintenance Rules

When architecture changes:

1. update the authoritative code or configuration owner
2. update `ARCHITECTURE.md` or this appendix when its scoped summary changes
3. update contributor docs only when their pointer, scope summary, or distinct audience contract changes
