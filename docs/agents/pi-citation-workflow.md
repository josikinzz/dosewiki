# OMP-coordinated citation workflow

## Purpose

The repository-owned citation contract replaces the previous Codex Browser → Claude Code transport. Authenticated Oh My Pi (`omp`) coordinates one explicit substance slug or one immutable local section proposal through `--proposal`. Both modes create a marker-only citation draft in the existing external workbench and stop at `needs_review`.

It does not apply a draft to the active data backend, deploy, select a queue item, or continue to another drug.

## Entry point

```bash
omp --model openai-codex/gpt-5.6-terra --thinking high --approval-mode yolo --max-time 1h -p "Act as the authenticated Oh My Pi coordinator for exactly one citation target: 2c-b. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md. Use the named project agents citation-section-worker and citation-article-wide-worker directly; do not invoke /opt/homebrew/bin/pi or any standalone Pi subprocess. Produce only a finalized needs_review workbench candidate; never apply, deploy, or write the database."
omp --model openai-codex/gpt-5.6-terra --thinking high --approval-mode yolo --max-time 1h -p "Act as the authenticated Oh My Pi coordinator for exactly one citation target: --proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<artifact>/proposal.json. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md. Use the named project agents citation-section-worker and citation-article-wide-worker directly; do not invoke /opt/homebrew/bin/pi or any standalone Pi subprocess. Produce only a finalized needs_review workbench candidate; never apply, deploy, or write the database."
```

Exactly one slug or proposal path is mandatory and is the sole target for that invocation. The workflow never infers a target from queue order, prior messages, or a run directory.

Run `omp` from the DoseWiki repository root so it discovers the project-owned agent definitions. The authenticated OMP process is the sole coordinator: it launches `citation-section-worker` and `citation-article-wide-worker` through OMP's agent runtime and must not shell out to the obsolete standalone Pi executable. The model, thinking, approval, and time-limit flags above are the compatibility settings proven by the finalized mephedrone run.

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

Preparation creates an immutable, attempt-unique local proposal binding without
database or model calls. Follow [Permanently local proposal mode](pi-citation-run-contract.md#permanently-local-proposal-mode)
for exact source/hash bindings and unconditional non-promotion.

## Contract retained from the previous workflow

The orchestrator changes, not the marker-only data contract. Follow the canonical
[citable surface](pi-citation-run-contract.md#citable-surface),
[evidence requirements](pi-citation-run-contract.md#evidence-requirements), and
[human boundary](pi-citation-run-contract.md#human-boundary).

## OMP coordination audit trail

The compatibility-named `pi-run-manifest.json` records the coordinator's actual
checks, not model claims. For execution, use the [coordinator sequence](pi-citation-run-contract.md#coordinator-sequence)
and its gate transcripts, hash snapshots, research permissions and artifact isolation.
The [assemble and validate gate](pi-citation-run-contract.md#5-assemble-and-validate)
owns final-surface scanning, including the exact designated discovery-provenance
exemption. It is not an exemption for public evidence or nested metadata.

For an interrupted attempt, use the contract's manifest-led resume sequence.
For a finalized attempt, create a linked rerun; never mutate its artifacts.
Proposal mode uses the `runPath` returned by preparation and remains non-promotable.

## Read-only campaign manifest

For a human-approved set of slug/section targets, use the project-local campaign CLI to lock scope and the requested model/tier, then derive a deterministic report from existing immutable, compatibility-named OMP run manifests:

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

The campaign file is create-once: its approved slug/section scope, workbench path, model, and tier cannot be overwritten by the CLI. `status` is read-only and reports `pending`, `running`, `needs_review`, `blocked`, and `superseded` attempts; marker/gap coverage; immutable attempt IDs; and safe resume/retry guidance. It counts coverage only when `citation-draft.json` matches the finalized manifest's final-review hash; missing or mismatched drafts are blocked and contribute zero. It never launches OMP-coordinated workers, uses OpenRouter, invokes `fresh-run`, writes the database, applies a draft, or publishes content. Existing run manifests record resolved worker models but not the requested tier, so the report checks the model pin and labels tier fidelity as an operator-attested limitation.
