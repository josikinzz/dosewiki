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

### Test policy

Testing is deliberately minimal. A test earns its place only when a silent regression would cause real harm:

- production write guards: `DATA_WRITES_FROZEN`, explicit targets, confirmation phrases, dry run versus apply;
- Auth.js identity, database-backed roles, and revision or conflict checks;
- secrets, and keeping editor-only data or credentials out of public output;
- parsers and transforms that feed published dosage, duration, interaction, or legality data;
- genuinely tricky pure logic such as merges and state machines.

Do not add tests for UI rendering, styling, copy, static catalogs, configuration, one-off scripts, or anything a person sees break immediately. Do not use tests to enforce code style or architecture conventions. Most changes ship with no new test.

For a change, run the test files that cover what you touched (`npm run test -- <path>`); CI runs the rest. Runners: root Vitest for `src/**`, `lib/**`, and `server/**`, `npm run test:workflow` for `scripts/**`, and `npm run openchemlib:test` for the vendored fork. `npm run test:evidence` reports per-file runtime; a slow test that guards nothing on the list above should be deleted.

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
- Same-site origin rule (editor write, editor read, public write postures): `src/lib/http/requestOrigin.ts`
- Scheduled route gate (optional limit, `CRON_SECRET`, freeze reporting): `cronRoute` in `lib/http/cronAuthorization.ts`; the middleware's cron allowlist is `lib/http/serviceCronPaths.ts`
- Article schema: `src/schema/substance.schema.ts`
- Authored Postgres handlers: `server/`
- Operational tools: `scripts/`

## Maintenance Rules

When architecture changes:

1. update the authoritative code or configuration owner
2. update `ARCHITECTURE.md` or this appendix when its scoped summary changes
3. update contributor docs only when their pointer, scope summary, or distinct audience contract changes
