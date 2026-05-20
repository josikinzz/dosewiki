# Runtime Config Env Contract Module

## Files

- `.env.example`
- `next.config.ts`
- `vercel.json`
- `lib/runtime/publicEnv.ts`
- `lib/convex/serverWriteHealth.ts`
- `auth.ts`
- `middleware.ts`
- `src/app/api/editor-config-health/route.ts`
- `src/app/api/test-env/route.ts`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`

## Problem

Runtime configuration is documented in several places, but the executable Interface is split across ad hoc reads of `process.env`, `import.meta.env`, Next's `env` injection, and route-local checks. Missing values are discovered at different times: some public reads throw during server rendering, editor health checks report only Convex write readiness, Auth.js may fail only when a protected route reads session state, and Vercel has no deployment-level preflight beyond `bun run build`.

That makes environment setup a shallow Module. Operators and agents must know which variable is build-time, which is request-time, which is browser-exposed, which has a development fallback, and which is required only for preview/production. The Interface is nearly as complex as the Implementation.

## Proposed deepening opportunity

Create a runtime env contract Module that defines the deployment profiles and validates all high-risk variables through one small Interface. The Module should expose typed accessors for public browser config, server read config, server write config, auth config, and optional diagnostics config. It should also provide a preflight adapter usable by `npm run build`, Vercel build, and the editor health route.

Keep `.env.example`, README, CLAUDE, and AGENTS as documentation adapters over the same contract. The docs should describe the profile names and required variables, while the Implementation owns precedence, production requirements, browser exposure, and error messages.

## Benefits

- Module: turns runtime configuration into one intentional Module instead of scattered environment reads.
- Interface: callers ask for named runtime capabilities instead of knowing every env var and fallback.
- Implementation: precedence, validation, profile-specific requirements, and user-facing diagnostics live together.
- Depth: a compact Interface hides the deployment matrix for local, Vercel preview, and production.
- Seam: build preflight, route health checks, and docs validation can share one seam without editing every caller.
- Adapter: Next config, Vercel build, App Router routes, and docs become adapters over the same contract.
- Leverage: one validation rule improves startup errors, editor diagnostics, and deployment safety.
- Locality: adding or renaming an env var changes one Implementation plus generated or checked docs.

## Test plan

- Add table-driven tests for local, preview, and production profiles with complete and missing env sets.
- Add tests that assert browser-exposed values never include secrets.
- Add a build-preflight smoke test that fails on missing production-required values and only warns for local-only optional values.
- Add a docs consistency check that verifies `.env.example` and README list the contract's public variable names.

## Risk/rollout notes

- Start in report-only mode so Vercel previews expose warnings before builds are made stricter.
- Preserve existing env aliases such as `NEXTAUTH_SECRET`, `GITHUB_ID`, and `GITHUB_SECRET` as deprecated inputs until deployments are migrated.
- Avoid changing runtime behavior in the first rollout; first centralize reads and prove parity through tests.
