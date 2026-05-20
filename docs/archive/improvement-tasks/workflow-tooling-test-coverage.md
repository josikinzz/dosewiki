# Workflow Tooling Test Coverage

## Files

- `vitest.config.ts`
- `eslint.config.js`
- `package.json`
- `scripts/**`
- `scripts/lib/openrouter-sdk.mjs`
- `scripts/batch/lib/**`
- `scripts/parsers/**`
- `scripts/util/clean-local-artifacts.mjs`

## Problem

Vitest includes `src` and `lib` tests while explicitly excluding `scripts`, and ESLint ignores `scripts/**`. That makes workflow tooling a large untested Implementation surface even though scripts own schema generation, source parsing, batch generation, prompt migration, Convex sync, hygiene, and generated-data updates.

Some script subtrees already have deeper modules, such as batch section adapters and parser contracts, but the repo tooling does not treat their Interfaces as test surfaces. Bugs in CLI parsing, env validation, path resolution, dry-run behavior, and artifact writes are likely to be found by running live workflows.

## Proposed deepening opportunity

Create a workflow tooling test Module with a deliberate Interface for script-level tests. Keep fast application tests separate from workflow tests, but add coverage for pure script modules, CLI option parsing, env validation, dry-run behavior, and filesystem adapters using fixtures.

ESLint should similarly get a scripts-aware adapter instead of ignoring all scripts. The goal is not to enforce app rules on every one-off utility; it is to define which workflow modules are active and should meet the repo's quality bar.

## Benefits

- Module: gives workflow tooling its own test and lint Module instead of hiding under app tests.
- Interface: makes script contracts testable through CLI parsers, policy modules, and dry-run adapters.
- Implementation: live Convex/OpenRouter/file writes stay behind adapters that can be fixture-tested.
- Depth: small script interfaces cover high-risk operational behavior without requiring full live runs.
- Seam: separates pure workflow logic from external adapters for Convex, OpenRouter, and filesystem writes.
- Adapter: live clients and filesystem operations become replaceable adapters in tests.
- Leverage: package scripts, docs, and generated-data workflows gain regression coverage.
- Locality: workflow bugs move from operator runtime failures into focused tests.

## Test plan

- Add `npm run test:workflow` for script modules and fixtures, separate from the default app test command if runtime cost is a concern.
- Add tests for CLI parsers in `scripts/batch/*/cli.mjs` and shared parsing in `scripts/batch/lib/cli-options.mjs`.
- Add tests for env validation around OpenRouter and Convex admin operations without making network calls.
- Add fixture tests for parser aggregation and hygiene cleanup policy.
- Add an ESLint target for active script directories while leaving `scripts/deprecated/**` out of the active lint surface.

## Risk/rollout notes

- Start with pure modules and no-network tests to avoid flaky workflow coverage.
- Keep deprecated scripts outside the first lint/test rollout unless they are reactivated.
- Avoid making the default `npm run test` slow; use a separate command until workflow tests are stable and cheap.
