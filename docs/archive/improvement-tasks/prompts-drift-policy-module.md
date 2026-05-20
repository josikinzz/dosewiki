# Prompts Drift Policy Module

## Files

- `scripts/migrate/compare-prompts.mjs`
- `scripts/migrate/migrate-prompts-to-convex.mjs`
- `src/data/config/generatorPrompt.md`
- `src/data/config/sectionPrompts/*.md`
- `convex/prompts.ts`
- `src/hooks/usePrompts.ts`
- `docs/architecture/runtime-and-data.md`
- `AGENTS.md`

## Problem

Prompt drift detection is implemented as one compare script with duplicated local prompt collection logic and an embedded content-specific rule for one meta-commentary line. The migration script reads generator and section prompts, but the compare script only reads section prompts. Convex stores prompt content and basic update metadata, but there is no prompt drift Module that defines what counts as identical, safe-to-sync, review-required, local-only, Convex-only, or intentionally runtime-only.

That makes the compare Interface shallow. Operators must inspect the script Implementation to learn which prompts are included, which text changes get special handling, and whether local markdown is a seed, backup, or target for sync. The policy is also brittle because a future prompt-wide rule would require editing procedural comparison output rather than adding a reusable policy case.

## Proposed deepening opportunity

Extract prompt collection and drift classification into a prompt drift Module. Its Interface should compare two prompt sets and return normalized results: identical, missing in source, missing in target, content-different, safe policy difference, and review-required. Policy rules should be data-driven or at least named functions behind the drift seam, not inline checks in the CLI.

The CLI scripts should become thin Adapters: one Adapter reads local seed markdown, another reads Convex prompt documents, and the command prints or applies the normalized drift result. Include generator prompts and section prompts through the same registry-backed inventory so compare and migrate operate on the same prompt set.

## Benefits

- **Module**: prompt drift classification becomes a reusable Module instead of command-local branching.
- **Interface**: scripts receive a normalized drift report instead of recomputing inclusion and safety rules.
- **Implementation**: local collection, Convex collection, content comparison, and named policy exceptions live together.
- **Depth**: the drift Interface hides source collection and review classification behind a small compare operation.
- **Seam**: local markdown and Convex prompt documents are Adapters at a clear comparison seam.
- **Adapter**: migration, compare, dry-run reporting, and future CI checks can share the same drift report.
- **Leverage**: new prompt-wide policy changes can be represented once and reused by scripts and tests.
- **Locality**: drift bugs and unsafe sync recommendations concentrate in one tested classifier.

## Test plan

- Add drift classifier tests for identical, local-only, Convex-only, generator-only, section-only, changed content, safe policy difference, and review-required difference.
- Add fixture tests that compare local prompt sets and Convex prompt sets through fake Adapters.
- Add CLI smoke tests for `compare-prompts` dry output using deterministic fake prompt records.
- Add a regression test proving generator prompt drift is included in compare results.
- Keep data-ops run-context tests separate; this Module should not own environment-variable precedence or deployment confirmation.

## Risk/rollout notes

Begin by extracting comparison behavior without changing CLI output. Add generator prompt comparison in a clearly called-out release note because existing operators may be used to section-only results. Treat "safe to sync" as advisory until policy cases are named, reviewed, and covered by tests.
