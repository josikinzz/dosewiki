# Citation Workbench Tracker

Last updated: 2026-06-03

## Purpose

Track the current project for using an isolated citation workbench plus interactive Claude Code as a bounded citation worker for dose.wiki.

The steady-state workflow is:

1. The workbench scaffolds one run per substance from the local SubstanceIndex export.
2. Codex selects the first `ready_for_claude` queue item from the workbench tracker.
3. Codex operates Claude Code through the browser terminal and types `/cite <drug-slug>`.
4. Claude writes run-local outputs only: checked section JSON files or missing-section warnings, optional repaired `article-wide.json`, `citation-draft.json`, and `citation-report.md`.
5. Codex validates the run independently and updates the workbench trackers.
6. Reviewed workbench drafts can be dry-run or written back through this repo's `citations:apply-workbench` path.

This tracker describes the project boundary and integration contract. The live queue state belongs in the workbench tracker files, not in this repo.

## Source Of Truth

- External workbench: `/Users/josie/.codex/dosewiki-citation-workbench`
- Workbench queue: `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-queue.json`
- Workbench progress notes: `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-progress.md`
- Workbench Claude-visible rules: `/Users/josie/.codex/dosewiki-citation-workbench/CLAUDE.md`
- Visual pipeline explainer: `/Users/josie/.agent/diagrams/dosewiki-citation-pipeline.html`
- Main-repo apply script: `scripts/citations/apply-workbench-draft.mjs`
- Main-repo adapter: `scripts/citations/workbench-draft-adapter.mjs`
- Stable citation command policy: `scripts/lib/citation-command-surface.mjs`
- Production rollout runbook: `docs/citation-production-rollout.md`

## Current State

- The canonical command is `/cite <drug-slug>`. `/citate` exists only as a legacy alias.
- The workbench queue is scaffolded for 577 substances.
- Queue priority is homepage `common` substances first, other homepage-visible substances second, and remaining SubstanceIndex entries third.
- `2c-b` completed the target-matched marker-only canary path, including main-repo apply dry-run/write and production smoke check. Future canaries and batches should use the same marker-only workbench gates before promotion.
- The next active run should always be read from `trackers/citation-queue.json` rather than copied into this file.
- Claude may use live web research when the task allows it, but supported evidence must cite inspected non-Wikipedia sources with contiguous source-specific quotes.
- Local discovery caches now live under the workbench's `source-cache/wikipedia/` and `source-cache/psychonautwiki/`. They are candidate-reference discovery only. Wikipedia cache excerpts can help section workers locate claim areas, but article-wide input must not include full Wikipedia articles or Wikipedia article excerpts.
- The Claude-visible workflow now has explicit post-section checks: verified section-worker launch batches, a six-row section status table, available citable section files passing `check:worker-output`, missing citable section outputs as warnings with the original section preserved, remap/proactive scan before packet build, packet sanitation, and partial/empty article-wide output over accepted section work failed rather than treated as done.

## Operating Path

Start Claude Code through the workbench browser terminal:

```bash
cd /Users/josie/.codex/dosewiki-citation-workbench
PORT=7682 npm run terminal:claude
```

Then open:

```text
http://127.0.0.1:7682/
```

Normal operation:

```text
/cite <drug-slug>
```

Do not paste long ad hoc prompts for normal runs. The Claude command, skill, section-worker agents, and output contract define the workflow.

## Workbench Contract

- `runs/<drug-slug>/citation-task.json` is the source of truth for a run once scaffolded.
- `fresh-run` is required before rerunning a substance so stale slug-matching run folders are archived out of Claude's visible workspace.
- `fresh-run` attaches local Wikipedia and PsychonautWiki cache packets for the slug when `source-cache/<source>/<slug>.references.json` exists.
- Section workers write only `runs/<drug-slug>/sections/<section-key>.json`.
- Claude should launch section workers in batches of at most 3, then verify visible/active worker labels and output paths against every non-empty citable section before waiting.
- Full citation runs should record a six-row section status table before article-wide assembly for `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`. Existing outputs should pass worker-output checks; missing citable section outputs are warnings, not blockers, when the original section is preserved exactly and no public markers are added there.
- Before `article-wide:packet`, run `node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<slug>`; if remaps are reported, rerun with `--write`, then run `node /Users/josie/.codex/dosewiki-citation-workbench/scripts/proactive-scan.mjs --run runs/<slug>` and repair until clean.
- The article-wide worker writes only `runs/<drug-slug>/article-wide.json` after accepted section outputs are available.
- After `article-wide:packet`, `article-wide-input.json` should be free of wiki/raw packet residue: `rawCitation`, `sectionRaw`, `[[`, `<ref`, `{{`, `wikipedia.org/wiki`, and `psychonautwiki.org/wiki`.
- If `article-wide-input.json` has accepted section work, article-wide failure cases include a 156-byte stub, empty `markedSections`/`references`/`evidence`, markers with zero references/evidence, evidence rows missing `status`, or marker/evidence mismatches.
- Expected finish sequence: launch/verify section workers -> post-section scan/fix -> remap/proactive scan -> `article-wide:packet` -> packet sanitation -> article-wide -> stable non-empty/evidence check -> assemble -> validate -> validate:patches. If any step is repaired, rerun the later steps.
- `article-wide-input.json` contains the dose.wiki citable surface plus accepted markers and prior references/evidence; it intentionally excludes full Wikipedia articles and Wikipedia article excerpts.
- The main Claude session assembles `citation-draft.json` and `citation-report.md` from saved section and article-wide outputs.
- Marker-only drafts may only add `[cite:reference-id]` markers; stripping markers must preserve existing article text exactly.
- The citable surface is `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`. Dosage, duration, subjective effects, comparisons, reagent testing, interactions, identification, and classification are excluded from this pass.
- References and sources need page-specific stable IDs. Same-site sources such as multiple DailyMed labels should include setid, label name, or another page-specific suffix so reference merges do not collapse distinct pages.
- Unsupported, weak, or partially supported claims stay `needs_source` or `needs_review`.
- If Claude Code is still making progress but taking a while, wait on a 5-15 minute timer and check again instead of interrupting early.

## Main Repo Integration

Reviewed workbench output is applied through the main repo, not by editing local JSON and not by writing directly from the workbench. For apply-bound reruns, export the task from the target Convex article first.

```bash
npm run citations:export-workbench-task -- --slug=2c-b --dry-run
npm run citations:export-workbench-task -- --slug=2c-b --overwrite
npm run citations:apply-workbench -- --slug=2c-b --dry-run
npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write
```

`citations:apply-workbench` adapts a completed workbench `citation-draft.json` to the current article schema, then writes through the existing Convex citation evidence mutation. It is intentionally narrow: use it for reviewed workbench output, not for generating citations.

Do not directly edit local article JSON to apply citation results. Convex is authoritative for live article data.

The stable command metadata owns citation operation policy for `citations:formal`, `citations:apply-workbench`, and `citations:archive-production-dataset`. Update `scripts/lib/citation-command-surface.mjs` before changing operator docs for environment variables, Convex source/target access, dry-run behavior, or write confirmation gates.

Production rollout has a separate runbook at `docs/citation-production-rollout.md`. The first production promotion should archive the current public dataset, apply only the reviewed `2c-b` draft to production, verify the public article, then proceed through small common-drug batches.

## Validation

Workbench validation:

```bash
cd /Users/josie/.codex/dosewiki-citation-workbench
npm run validate -- --run runs/<drug-slug>
npm run validate:patches -- --run runs/<drug-slug>
npm run test:fresh-run
npm run test:patch-validator
npm run test:queue-setup
```

Before considering a workbench run complete, repair and reassemble if validation
reports quote fidelity failures, ellipses in `supportingQuote`,
discovery-only wiki/community support, public markers without supported
evidence, or marker path mismatches.

Main repo validation for integration changes:

```bash
npm run test -- scripts/citations/workbench-draft-adapter.test.mjs
npm run test -- src/features/article/components/sections/PilotSectionCitations.test.tsx
npm run lint:scripts
npm run typecheck
```

For article schema changes, inspect `src/schema/substance.schema.ts`, run `npm run generate:schema`, and include generated helper updates.

## Open Work

- Continue one substance per fresh Claude Code session from the workbench queue.
- Keep the workbench queue priority in sync with the homepage layout when homepage visibility changes.
- Review `citations:apply-workbench` dry-run output before any write to Convex.
- Harden the adapter as new workbench claim keys are accepted.
- If Claude keeps missing substantive citable sections despite prompt updates, use the deterministic missing-section warnings in the workbench report to decide whether to rerun the section or preserve the original.
