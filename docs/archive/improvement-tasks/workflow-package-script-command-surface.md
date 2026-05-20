# Workflow Package Script Command Surface

## Files

- `package.json`
- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `scripts/README.md`
- `scripts/batch/**`
- `scripts/prepopulate/**`
- `scripts/convex/**`
- `scripts/migrate/**`

## Problem

The repo has no deep command Module for workflow entrypoints. `package.json` exposes some canonical commands, but many documented workflows still require direct `node scripts/...` invocations. Several package scripts also do not match the current file layout: `prepopulate:high-confidence` points at `scripts/prepopulate-high-confidence.mjs`, while the file lives under `scripts/prepopulate/`; `batch:extract` points at `scripts/batch-extract-quotes.mjs`, while the active file lives under `scripts/batch/`.

That makes the command Interface shallow. Maintainers must know the physical script tree, runtime choice (`bun` versus `node`), required env vars, and whether a command is current before they can run a workflow. The Implementation details are leaking into every doc and operator note.

## Proposed deepening opportunity

Create a workflow command surface Module whose Interface is the stable set of package scripts for tests, tooling, hygiene, generated data, Convex sync, prompt migration, and batch generation. Direct script files remain the Implementation, but docs and agent instructions should point first to the package script Interface.

Add a small command manifest or conventions doc that records each command's purpose, required env vars, read/write target, dry-run support, and production impact. Use direct `node scripts/...` only for low-level one-off adapters or commands intentionally outside the stable surface.

## Benefits

- Module: turns workflow entrypoints into an intentional Module instead of scattered script paths.
- Interface: gives operators and agents a smaller command vocabulary with explicit env and safety invariants.
- Implementation: keeps existing scripts as implementation details that can move without changing docs.
- Depth: package commands earn more leverage by hiding runtime choice, script location, and common flags.
- Seam: creates a clear place to add wrappers, env validation, or dry-run defaults without editing every script.
- Adapter: existing batch, Convex, migrate, and prepopulate scripts become adapters behind the command surface.
- Leverage: README, CLAUDE, AGENTS, and scripts README can share the same command names.
- Locality: broken or renamed scripts are fixed in one command Module rather than across many docs.

## Test plan

- Add a command smoke test that parses `package.json` and verifies each workflow script resolves to an existing file.
- Add a docs check that flags documented `node scripts/...` paths that no longer exist.
- Run the smoke test in `npm run test` or a dedicated `npm run test:workflow` command.
- Verify all stable workflow commands support `--help` or a no-write dry-run where appropriate.

## Risk/rollout notes

- Start by fixing the command surface and documenting aliases; do not change script behavior in the same rollout.
- Keep direct script invocations working during transition because current operator notes and shell history rely on them.
- Prefer adding new stable package scripts over deleting old ones until docs and agents have been updated.
