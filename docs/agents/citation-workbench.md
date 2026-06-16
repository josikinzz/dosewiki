# Citation Workbench Agent Notes

## Scope

- This file preserves the citation-workbench guidance that previously lived in root `AGENTS.md`.
- It is intentionally focused on the current citation-workbench project.
- The external citation worker lives at `/Users/josie/.codex/dosewiki-citation-workbench`.
- This repo owns the dose.wiki integration path: adapting reviewed workbench drafts into article data, citation evidence, and public citation rendering.

## Start Here

- Read [docs/citation-workbench-tracker.md](../citation-workbench-tracker.md) for the project state and integration notes.
- Claude-visible workbench instructions live at `/Users/josie/.codex/dosewiki-citation-workbench/CLAUDE.md`; keep Codex orchestration details out of that file.
- Use the visual explainer for the end-to-end pipeline: `/Users/josie/.agent/diagrams/dosewiki-citation-pipeline.html`.
- For script details, use [scripts/README.md](../../scripts/README.md), especially the "Formal citations" section.

## Current Project Paths

- Workbench apply script: `scripts/citations/apply-workbench-draft.mjs`
- Workbench draft adapter: `scripts/citations/workbench-draft-adapter.mjs`
- Citation workflow scripts and tests: `scripts/citations/`
- Citation reference identity helpers: `lib/citations/referenceIdentity.js`
- Public citation token rendering: `src/features/article/components/CitedText.tsx`
- Article sections currently touched by citation rendering: `src/features/article/components/sections/`
- Article schema source of truth: `src/schema/substance.schema.ts`

## Friction Notes

- When operating the workbench, record friction points that could be prevented by a short instruction tweak. Keep these notes practical and lightweight; prefer simple wording changes over new scripts or process.
- Record per-substance Claude citation-run friction in [docs/citation-claude-friction-log.md](../citation-claude-friction-log.md). This is a Codex-only, repo-local notes file; do not mirror it into the external workbench where Claude can see it.
- Example: if large worker outputs fail because a subagent tries to write too much JSON at once, note that the worker should write large artifacts in chunks after a modest size threshold instead of one giant response.
- To make Claude runs visible in the Codex in-app Browser, start the external workbench terminal with `PORT=7682 npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run terminal:claude`, then use the Browser plugin's in-app browser target (`iab`) to open `http://127.0.0.1:7682/` and set browser visibility to true. For xterm input, click the textbox named `Terminal input`, use keystroke typing (`type('/cite <slug>')`) and then press `Enter`; Playwright `fill()` can put text on screen without submitting it. If a localhost tab is stuck on an error/data page, open a fresh Browser tab instead of repeatedly navigating the bad tab. Before sending nudges or repair prompts, wait until the bottom prompt is clearly idle for a few seconds unless intentionally queueing input.

## Claude Boundary

- Codex-only workflow notes belong in this file, not in the citation workbench repo.
- The workbench repo should expose only `CLAUDE.md` to Claude. Do not recreate a workbench `AGENTS.md` unless the user explicitly asks for a new Codex-visible instruction surface there.
- Claude should not need to know that Codex exports tasks, supervises the browser terminal, applies drafts, deploys, or receives handoffs.
- Claude must stay inside the workbench repo during citation runs. If outside data is needed, Codex should scaffold it into the run before Claude starts.

## Hard Invariants

- Convex is authoritative for live article data. Do not fix live citation content by hand-editing local JSON.
- Workbench outputs are drafts until this repo adapts, dry-runs, reviews, and explicitly writes them.
- The normal workbench queue command is `/cite <drug-slug>` inside `/Users/josie/.codex/dosewiki-citation-workbench`; do not run citation queue work from this app repo.
- Before `/cite`, run `npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run preflight -- --slug <drug-slug>`; if it reports an empty citable surface, re-export the live Convex task and rerun workbench `fresh-run` before starting Claude.
- The active workbench draft mode is marker-only: public article text receives `[cite:reference-id]` markers, and stripping those markers must restore original text exactly.
- The citable surface is exactly `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`; dosage, duration, subjective effects, comparisons, reagent testing, interactions, identification, and classification stay out of this pass.
- Claude should launch section workers in batches of at most 3, then verify visible/active `citation-section-worker` labels and output paths against every non-empty citable section before waiting. Do not rely on plan text or worker count alone.
- Before article-wide assembly, full workbench runs should record a six-row section status table for `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`. Missing citable section outputs, including `legality`, are warnings rather than blockers only when the original section is preserved exactly and no unsupported public markers are added; invalid section outputs remain failures.
- Before `article-wide:packet`, run `node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<slug>`; if remaps are reported, rerun with `--write`, then run `node /Users/josie/.codex/dosewiki-citation-workbench/scripts/proactive-scan.mjs --run runs/<slug>` and repair until clean.
- Workbench references should be Wikipedia-style structured source records. Wikipedia, local Wikipedia reference caches, and local PsychonautWiki reference caches are discovery-only, not public claim citations.
- Reference/source IDs must be page-specific enough to survive merge/dedupe. For repeated same-site sources such as DailyMed labels, include setid, label name, or another page-specific suffix rather than a generic site ID. For Health Canada DPD, use DIN/product-specific URLs or IDs instead of generic placeholder query URLs.
- Workbench `fresh-run` attaches local cache packets from `/Users/josie/.codex/dosewiki-citation-workbench/source-cache/wikipedia/` and `/Users/josie/.codex/dosewiki-citation-workbench/source-cache/psychonautwiki/` when present. Wikipedia cache excerpts are for section-worker discovery only; `article-wide-input.json` should contain dose.wiki citable sections plus prior references/evidence, not full Wikipedia articles or Wikipedia article excerpts.
- Citation placement should follow Wikipedia-style density: compact clusters for shared sentence support, no repeated markers for obvious definitions, and no comma-adjacent markers unless only that clause is supported.
- After `article-wide:packet`, run `npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run article-wide:sanitize -- --run runs/<slug>`, then confirm `article-wide-input.json` is free of wiki/raw packet residue: `rawCitation`, `sectionRaw`, `[[`, `<ref`, `{{`, `wikipedia.org/wiki`, and `psychonautwiki.org/wiki`.
- If accepted section outputs exist, article-wide failure cases include a 156-byte stub, empty `markedSections`/`references`/`evidence`, markers with zero references/evidence, evidence rows missing `status`, marker/evidence mismatches, or returned sections with fewer markers than the accepted article-wide input.
- Expected finish sequence: launch/verify section workers -> post-section scan/fix -> remap/proactive scan -> `article-wide:packet` -> packet sanitation -> article-wide -> stable non-empty/evidence check -> assemble -> validate -> validate:patches. If any step is repaired, rerun the later steps.
- Paywalled papers are acceptable public citations when an accessible abstract directly supports the claim; record them as `access: "abstract_only"` rather than dropping them solely for paywall status.
- `citations:apply-workbench` is for reviewed `citation-draft.json` output only. It must not generate new citations or bypass workbench validation.
- Writes must use the shared data-ops confirmation flow and require `--write --confirm-citation-write`.
- Keep unsupported or review-only evidence out of public citation markers unless the adapter explicitly models that behavior.
- Do not hand-edit generated files in `convex/_generated/` or `src/data/schema/*.generated.ts`.
- Keep `editorial_review` as editor-only metadata. Do not render it as public article content.

## Common Commands

```bash
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
npm run citations:export-workbench-task -- --slug=2c-b --dry-run
npm run citations:export-workbench-task -- --slug=2c-b --overwrite
npm run citations:apply-workbench -- --slug=2c-b --dry-run
npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write
npx vitest run --config scripts/test/vitest.workflow.config.ts scripts/citations/workbench-draft-adapter.test.mjs
npm run test -- src/features/article/components/sections/PilotSectionCitations.test.tsx
npm run lint:scripts
npm run typecheck
```

## Rerunning Citation Test Cases

When asked to rerun a citation test for a substance, treat it as a workbench
fresh-run request, not a main-repo generation task.

1. If the result may be applied back to Convex, export the task from the same Convex article target first:

```bash
npm run citations:export-workbench-task -- --slug=<drug-slug> --dry-run
npm run citations:export-workbench-task -- --slug=<drug-slug> --overwrite
```

2. Work in the external workbench:

```bash
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug> --dry-run
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug>
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run preflight -- --slug <drug-slug>
```

If local discovery caches need refreshing before `fresh-run`, run:

```bash
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run cache:wikipedia
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run cache:psychonautwiki:local
```

3. Start or reuse the workbench browser terminal and type exactly:

```text
/cite <drug-slug>
```

4. Before article-wide assembly, confirm Claude recorded a section status table
   for `summary`, `pharmacology`, `tolerance`, `harm_potential`,
   `history_culture`, and `legality`. Existing output files should pass
   `npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run check:worker-output -- --run runs/<drug-slug> --section <section>`.
   Missing sections are warnings only when the original section is preserved
   exactly and no public markers are added there; invalid outputs are failures.
   Also confirm Claude launched section workers in batches of at most 3 and
   verified visible/active worker labels against the citable section set.

5. Before article-wide assembly, confirm remap/proactive scan gates passed:

```bash
cd /Users/josie/.codex/dosewiki-citation-workbench
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<drug-slug>
# If remaps are reported, run:
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<drug-slug> --write
# Then always run:
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/proactive-scan.mjs --run runs/<drug-slug>
```

After `article-wide:packet`, confirm Claude ran:

```bash
npm run article-wide:sanitize -- --run runs/<drug-slug>
```

6. After Claude finishes, validate in the workbench:

```bash
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate -- --run runs/<drug-slug>
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate:patches -- --run runs/<drug-slug>
```

Repair and reassemble before handoff if validation reports quote fidelity
failures, ellipses in `supportingQuote`, discovery-only support, public markers
without supported evidence, marker path mismatches, evidence rows missing
`status`, or marker/evidence mismatch.

7. Update `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-queue.json`
and `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-progress.md`.

8. Return to this repo and run the apply dry-run only:

```bash
npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run
```

Stop there unless the user explicitly asks to write to Convex or continue the
queue. Do not automatically advance to the next `ready_for_claude` drug after a
single-substance rerun.

Always run the dry-run first and inspect the planned archive moves. `fresh-run`
archives stale run folders outside the workbench so Claude cannot see prior
section evidence, draft output, or report text.

## Environment Variables

- `TARGET_CONVEX_URL`: explicit production Convex target for citation writes.
- `SOURCE_CONVEX_URL` or `CONVEX_PUBLIC_READ_URL`: explicit source Convex deployment for archive/export reads.
- `VITE_CONVEX_URL`: local/default Convex URL used by existing data-ops scripts when a more specific source/target is not set.
- `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE`: admin intent token required by `citations:apply-workbench --write`.
- `CONVEX_ADMIN_KEY`: legacy/shared admin key still required by broader Convex sync and some non-citation workflows.
- `OPENROUTER_API_KEY`: required for OpenRouter-backed batch generation, not for applying reviewed workbench drafts.

## Validation

- For adapter changes, run the focused `workbench-draft-adapter` test first with the workflow Vitest config.
- For public marker rendering changes, run the focused article citation rendering tests first.
- For script workflow changes, run `npm run lint:scripts`; broaden to `npm run test:workflow` when the shared data-ops path changes.
- For schema changes, inspect `src/schema/substance.schema.ts`, run `npm run generate:schema`, and include generated helper updates.
