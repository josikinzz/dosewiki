# Pi-native citation workflow

## Purpose

The repository-owned Pi citation contract replaces the previous Codex Browser → Claude Code transport. It supports one explicit substance slug or one immutable local section proposal through `--proposal`. Both modes create a marker-only citation draft in the existing external workbench and stop at `needs_review`.

It does not apply a draft to Convex, deploy, select a queue item, or continue to another drug.

## Entry point

```bash
/opt/homebrew/bin/pi -p "Run the Pi citation workflow for 2c-b. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md."
/opt/homebrew/bin/pi -p "Run the Pi citation workflow for --proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<artifact>/proposal.json. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md."
```

Exactly one slug or proposal path is mandatory and is the sole target for that invocation. The workflow never infers a target from queue order, prior messages, or a run directory.

The run-manifest, campaign, proposal-preparation, and handoff-schema implementation lives at:

```text
tools/pi-citation-workflow/
```

The current external workbench remains:

```text
/Users/josie/.codex/dosewiki-citation-workbench
```

Set `DOSEWIKI_CITATION_WORKBENCH` only when intentionally using a different workbench checkout.

## Local proposal bridge

The exact preparation command, run from the DoseWiki repository root, is:

```bash
node tools/pi-citation-workflow/prepare-local-proposal-run.mjs \
  --proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<artifact>/proposal.json
```

Preparation validates and recomputes the proposal, manifest, raw-response, section, article, and owned-field bindings; rejects pre-existing citation markers and path/symlink escapes; and atomically reserves a fresh attempt directory. It copies the proposal inputs byte-for-byte into read-only `proposal-input/` files and builds `runs/<slug>--proposal-<section>--<artifact-digest-prefix>--<bridge-digest-prefix>--attempt-<uuid>/citation-task.json` without calling `fresh-run`, Convex, OpenRouter, or tracker scripts. Concurrent invocations and retries get distinct attempt directories while retaining the same immutable proposal binding.

Only `proposal.after.value` becomes citable prose. All other citable sections are `null`; title, source/discovery packets, instructions, and research permission come from `inputs/<slug>-full.json`, but its article prose and targets do not. The run and assembled draft are permanently non-promotable (`applyBound: false`, `promotion.allowed: false`, `articlePatches: []`). The main-repo adapter rejects them before resolving a Convex target or constructing a client.

## Contract retained from the previous workflow

The migration changes the orchestrator, not the citation-data contract:

- Existing `citation-task.json`, section artifacts, article-wide artifacts, and `citation-draft.json` stay compatible.
- The citable surface remains `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`.
- All edits are marker-only: stripping `[cite:reference-id]` restores original text exactly.
- Wikipedia/PsychonautWiki caches are discovery-only, never public claim evidence.
- Every public marker needs inspected, path-matched supported evidence.
- Existing deterministic workbench checks remain authoritative.
- A human may separately promote an apply-bound live-task draft through the normal main-repo dry-run/write procedure; local-proposal drafts are never eligible.

## Pi-specific audit trail

The Pi coordinator creates `runs/<run-id>/pi-run-manifest.json`. It records:

- separate run ID and article slug, task digest, and task provenance;
- local proposal binding and proposal-input hashes at every gate when applicable;
- expected nonempty citable sections;
- all six terminal section statuses;
- worker/model/artifact metadata;
- deterministic gate outcomes; and
- the final local `needs_review` outcome.

The manifest does not contain article content and does not replace workbench artifacts. It replaces the old requirement to inspect Claude Code UI worker labels with a reviewable file-level audit trail. Its `check-section` and `run-gate` commands execute the existing workbench checks, store their run-local transcripts, and invalidate downstream gates when their scoped artifacts change; they do not accept a model's claimed pass result.

`allowLiveWebResearch` comes from the task packet and is recorded in the manifest. When false, Pi workers must not browse for sources and must preserve unsupported claims as internal gaps. Article-wide sanitization strips structured discovery-only/wiki metadata (including prior-work records). The helper then fails closed if any final local review surface — `article-wide.json`, assembled `citation-draft.json`, or human-facing `citation-report.md` — contains Wikipedia, PsychonautWiki, TripSit, or other forbidden discovery/wiki residue in metadata, audit/research notes, or report prose. Corrective diagnostics remain in run-local `pi-gates` logs rather than final artifacts. Once finalized, the helper's mutation commands reject the run.

Run its helper directly only when coordinating a citation run:

```bash
REPO_ROOT="$PWD" # Invoke from the DoseWiki repository root.
MANIFEST="$REPO_ROOT/tools/pi-citation-workflow/pi-run-manifest.mjs"
node "$MANIFEST" init --run "$WORKBENCH/runs/2c-b" --slug 2c-b
node "$MANIFEST" show --run "$WORKBENCH/runs/2c-b"
```

For proposal mode, use the `runPath` printed by `prepare-local-proposal-run.mjs`. Finalization still returns `needs_review` and records `promotionAllowed: false`.

A finalized run is immutable. To correct one, create a new linked attempt instead of changing it:

```bash
node "$MANIFEST" rerun --run "$RUN" --workbench "$WORKBENCH" \
  --reason "Describe the corrective rerun"
```

The new atomically reserved `--correction-<uuid>` run records the superseded run, immutable parent task/manifest digests, finalization time, and reason in its own manifest; the original run is preserved unchanged.

See [the Pi citation run contract](pi-citation-run-contract.md) for the required execution order and all gates.

## Read-only campaign manifest

For a human-approved set of slug/section targets, use the project-local campaign CLI to lock scope and the requested model/tier, then derive a deterministic report from existing immutable Pi run manifests:

```bash
npm run citations:campaign -- init \
  --campaign notes-and-plans/citation-campaigns/pilot.json \
  --target 2c-b:summary,pharmacology \
  --target lsd:legality \
  --model openai-codex/gpt-5.6-terra \
  --tier terra-medium
npm run citations:campaign -- status \
  --campaign notes-and-plans/citation-campaigns/pilot.json
npm run citations:campaign -- status \
  --campaign notes-and-plans/citation-campaigns/pilot.json --format json
```

The campaign file is create-once: its approved slug/section scope, workbench path, model, and tier cannot be overwritten by the CLI. `status` is read-only and reports `pending`, `running`, `needs_review`, `blocked`, and `superseded` attempts; marker/gap coverage; immutable attempt IDs; and safe resume/retry guidance. It counts coverage only when `citation-draft.json` matches the finalized manifest's final-review hash; missing or mismatched drafts are blocked and contribute zero. It never runs Pi workers, uses OpenRouter, invokes `fresh-run`, writes Convex, applies a draft, or publishes content. Existing run manifests record resolved worker models but not the requested tier, so the report checks the model pin and labels tier fidelity as an operator-attested limitation.
