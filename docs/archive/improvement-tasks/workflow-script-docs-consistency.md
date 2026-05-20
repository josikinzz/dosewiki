# Workflow Script Docs Consistency

## Files

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `scripts/README.md`
- `package.json`
- `scripts/**`

## Problem

Workflow documentation repeats command sequences in several places. README, CLAUDE, AGENTS, and scripts README each describe batch generation, prompt migration, Convex sync, source parsing, hygiene, and validation from different angles. Some docs are current operational notes, while others are stable contributor references. The same concepts use different command spellings and levels of warning.

This makes docs a shallow Interface over the workflow Implementation. Maintainers must reconcile multiple documents before running a process, and agents can pick a stale command even when a newer one exists nearby.

## Proposed deepening opportunity

Create a script docs consistency Module that treats workflow docs as generated or validated views of a smaller command/workflow registry. The registry should define workflow name, command sequence, required env vars, write target, source-of-truth warning, and owning docs section.

The docs do not all need to be generated, but a validation adapter should detect missing scripts, duplicated stale commands, and inconsistent environment variable names. README can remain the high-level Interface, CLAUDE can remain operator notes, AGENTS can remain agent rules, and scripts README can remain the script inventory, all backed by one workflow registry seam.

## Benefits

- Module: turns repeated workflow prose into validated views of one workflow registry.
- Interface: gives each doc a clear role instead of making every doc carry every detail.
- Implementation: command sequences and env invariants live in one place and feed docs checks.
- Depth: a small registry gives leverage across four docs and the package script surface.
- Seam: docs can change presentation without changing the workflow contract.
- Adapter: README, CLAUDE, AGENTS, and scripts README become human-facing adapters over the same workflow facts.
- Leverage: future workflow changes update one registry and fail checks if docs drift.
- Locality: stale commands and wrong paths are caught where workflow facts are maintained.

## Test plan

- Add a docs consistency check that extracts backticked commands and verifies referenced scripts exist.
- Add a registry validation test that confirms every stable workflow has a package script or an explicitly documented direct script adapter.
- Add checks for required env var names such as `CONVEX_ADMIN_KEY`, `OPENROUTER_API_KEY`, `VITE_CONVEX_URL`, `CONVEX_PUBLIC_READ_URL`, and `TARGET_CONVEX_URL`.
- Run the check in CI or include it in `npm run hygiene:check` once false positives are resolved.

## Risk/rollout notes

- Start with warnings so existing docs can be cleaned incrementally.
- Do not over-generate long prose; validate high-risk command blocks first.
- Keep CLAUDE operator notes allowed to move faster than README, but require them to reference valid command adapters.
