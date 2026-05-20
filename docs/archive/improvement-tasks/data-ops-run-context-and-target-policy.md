# Data Ops Run Context And Target Policy

## Files

- `scripts/convex/sync-convex-to-production.mjs`
- `scripts/convex/export-convex-to-json.mjs`
- `scripts/convex/import-to-convex.mjs`
- `scripts/convex/migrate-user-profiles-to-convex.mjs`
- `scripts/migrate/migrate-substance-index-to-convex.mjs`
- `scripts/migrate/migrate-trip-reports-between-deployments.mjs`
- `scripts/migrate/migrate-prompts-to-convex.mjs`
- `scripts/migrate/compare-prompts.mjs`
- `scripts/prepopulate/*.mjs`
- `AGENTS.md`

## Problem

Data operations resolve execution context in many incompatible ways. Some scripts load `.env.local`, some only read current process variables, some default to localhost, and one migration has a hard-coded hosted Convex URL fallback. Target naming also varies between `CONVEX_URL`, `VITE_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_URL`, `SOURCE_CONVEX_URL`, and `TARGET_CONVEX_URL`. Destructive or live-write controls are similarly uneven: `--dry-run`, `--execute`, and `--replace` exist in different forms, while some local `src/data/SubstanceIndex.json` migrations write immediately.

That makes the operational Interface shallow. An operator must inspect each Implementation to know which deployment is read, which deployment is written, whether local JSON is treated as a source or derived export, and whether a destructive action has enough confirmation. This weakens the AGENTS source-of-truth rule that Convex is authoritative for live runtime data.

## Proposed deepening opportunity

Create a shared data ops run-context Module for scripts under `scripts/convex`, `scripts/migrate`, and `scripts/prepopulate`. Its Interface should resolve repo root, environment files, Convex source/target deployments, write intent, dry-run mode, local artifact mode, and destructive confirmation policy. Scripts should receive an explicit run context instead of reading deployment variables or parsing safety flags inline.

Add a small target policy layer behind the same seam: local backup/export, dev Convex, production Convex, and cross-deployment sync should be distinct write intents. Destructive modes such as replace-all or production sync should require operator-visible confirmation that includes source URL, target URL, selected tables, and whether `src/data` will be modified.

## Benefits

- **Module**: run context becomes one Module instead of repeated ad hoc environment and CLI parsing in each script.
- **Interface**: scripts ask for a named data operation context and receive explicit source, target, mode, and write policy.
- **Implementation**: `.env.local` parsing, URL precedence, repo-root resolution, destructive confirmation, and dry-run enforcement live together.
- **Depth**: a small context Interface hides high-risk deployment and filesystem policy.
- **Seam**: the script entrypoint becomes a seam where production, dev, local JSON, and dry-run adapters can vary without rewriting migration logic.
- **Adapter**: Convex clients, local JSON writers, and prompt/source file readers become adapters selected by the run context.
- **Leverage**: every import/export/sync/migration command gets consistent target logging, safer defaults, and clearer failure messages.
- **Locality**: changing deployment variable names or source-of-truth rules affects one Implementation plus docs, not every operational script.

## Test plan

- Add unit tests for environment precedence, `.env.local` parsing, repo-root path resolution, dry-run write blocking, and destructive confirmation requirements.
- Add table-driven tests for common intents: local export only, local prepopulate only, dev Convex import, production sync, and cross-deployment copy.
- Add script smoke tests using fake adapters to assert commands print source/target/mode before writes.
- Add regression tests that production-target writes fail without an explicit production confirmation flag.

## Risk/rollout notes

Start with a non-invasive wrapper that only standardizes logging and context resolution for low-risk read-only scripts. Then migrate write scripts one by one, preserving existing flags as deprecated aliases. Production sync and replace-all migrations should move last, after parity tests prove the new run context preserves current behavior except for intentional safety prompts.
