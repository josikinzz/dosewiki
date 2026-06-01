# AGENTS.md

## Scope

- This file is intentionally focused on the current citation-workbench project.
- It is not a full dose.wiki codebase guide yet; add other app areas later as they become relevant.
- The external citation worker lives at `/Users/josie/.codex/dosewiki-citation-workbench`.
- This repo owns the dose.wiki integration path: adapting reviewed workbench drafts into article data, citation evidence, and public citation rendering.

## Start Here

- Read [docs/citation-workbench-tracker.md](docs/citation-workbench-tracker.md) for the project state and integration notes.
- Read the workbench instructions before operating the queue: `/Users/josie/.codex/dosewiki-citation-workbench/AGENTS.md`.
- Use the visual explainer for the end-to-end pipeline: `/Users/josie/.agent/diagrams/dosewiki-citation-pipeline.html`.
- For script details, use [scripts/README.md](scripts/README.md), especially the "Formal citations" section.

## Current Project Paths

- Workbench apply script: `scripts/citations/apply-workbench-draft.mjs`
- Workbench draft adapter: `scripts/citations/workbench-draft-adapter.mjs`
- Citation workflow scripts and tests: `scripts/citations/`
- Citation reference identity helpers: `lib/citations/referenceIdentity.js`
- Public citation token rendering: `src/features/article/components/CitedText.tsx`
- Article sections currently touched by citation rendering: `src/features/article/components/sections/`
- Article schema source of truth: `src/schema/substance.schema.ts`

## Hard Invariants

- Convex is authoritative for live article data. Do not fix live citation content by hand-editing local JSON.
- Workbench outputs are drafts until this repo adapts, dry-runs, reviews, and explicitly writes them.
- The normal workbench queue command is `/cite <drug-slug>` inside `/Users/josie/.codex/dosewiki-citation-workbench`; do not run citation queue work from this app repo.
- `citations:apply-workbench` is for reviewed `citation-draft.json` output only. It must not generate new citations or bypass workbench validation.
- Writes must use the shared data-ops confirmation flow and require `--write --confirm-citation-write`.
- Keep unsupported or review-only evidence out of public citation markers unless the adapter explicitly models that behavior.
- Do not hand-edit generated files in `convex/_generated/` or `src/data/schema/*.generated.ts`.
- Keep `editorial_review` as editor-only metadata. Do not render it as public article content.

## Common Commands

```bash
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
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

1. Work in the external workbench:

```bash
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug> --dry-run
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug>
```

2. Start or reuse the workbench browser terminal and type exactly:

```text
/cite <drug-slug>
```

3. After Claude finishes, validate in the workbench:

```bash
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate -- --run runs/<drug-slug>
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate:patches -- --run runs/<drug-slug>
```

4. Update `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-queue.json`
and `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-progress.md`.

5. Return to this repo and run the apply dry-run only:

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
