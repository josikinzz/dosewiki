# Workflow Hygiene Policy Module

## Files

- `scripts/util/clean-local-artifacts.mjs`
- `package.json`
- `README.md`
- `docs/architecture/project-layout.md`
- `.gitignore`
- `.husky/**`

## Problem

Local artifact hygiene is implemented as a single script with hardcoded path lists and reasons. It is useful, but the policy is embedded in the Implementation. Docs describe categories such as `.next/`, `dist/`, `coverage/`, `archive/`, and `notes-and-plans/`, while the cleanup script knows a narrower approved target list and some retired directory behavior.

The current Module is shallow because changing hygiene policy means editing script internals and then remembering to update docs. The Interface does not expose which paths are generated, disposable, protected, retired, or merely ignored.

## Proposed deepening opportunity

Extract hygiene policy into a small data Module consumed by `scripts/util/clean-local-artifacts.mjs`, docs, and future checks. The Interface should describe artifact path, classification, cleanup behavior, protection rule, and rationale. The cleanup script becomes an Adapter that applies the policy to the filesystem.

This creates a real seam between "what the repo considers approved local noise" and "how a command scans and deletes it."

## Benefits

- Module: separates hygiene policy from cleanup mechanics.
- Interface: makes cleanup eligibility, protection, and rationale explicit.
- Implementation: keeps filesystem walking and deletion localized in the script adapter.
- Depth: one policy table can drive docs, checks, and cleanup behavior.
- Seam: future artifact classes can be added without rewriting scan logic.
- Adapter: `hygiene:check` and `hygiene:clean` become adapters over the same policy Module.
- Leverage: docs and automation stop drifting on which artifacts are approved.
- Locality: accidental cleanup scope bugs are reviewed in one policy file.

## Test plan

- Add unit tests for policy classification, protected directories, `.DS_Store` traversal, and retired empty directory handling.
- Add a fixture-based test for check mode and clean mode using a temporary directory.
- Add a docs generation or docs validation test to ensure README artifact categories match the policy Module.
- Run `npm run hygiene:check` before and after the extraction to verify output parity.

## Risk/rollout notes

- Preserve the current cleanup target set in the first rollout.
- Keep deletion behavior conservative; new cleanup targets should start in check-only mode if there is any uncertainty.
- Avoid adding broad ignored directories to delete policy without a separate review because hygiene commands are intentionally destructive in clean mode.
