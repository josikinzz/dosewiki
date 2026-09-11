# OMP-coordinated citation run contract

This contract replaces the Codex Browser → `ttyd` → Claude Code transport and the obsolete standalone Pi executable. It does **not** replace the DoseWiki marker-only citation contract, workbench artifact format, deterministic validators, or human promotion boundary.

## Invocation and scope

- Invoke authenticated `omp` noninteractively with the explicit model and runtime flags shown in `pi-citation-workflow.md`, and an explicit prompt to follow this contract for either one `<slug>` or one `--proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<artifact>/proposal.json` target.
- OMP itself is the coordinator. It must use the named project agents `citation-section-worker` and `citation-article-wide-worker` directly through its agent runtime; it must not invoke `/opt/homebrew/bin/pi`, another standalone Pi executable, or an ad-hoc replacement agent.
- Require exactly one explicit slug or proposal path. Never infer either from a queue, prior conversation, run directory, or sample.
- Proposal mode first runs `prepare-local-proposal-run.mjs --proposal <path>` and uses its returned attempt-unique, proposal-bound run. It never runs `fresh-run`.
- Work only in `/Users/josie/.codex/dosewiki-citation-workbench` unless `DOSEWIKI_CITATION_WORKBENCH` explicitly points to another workbench.
- The workflow produces only a finalized workbench candidate with outcome `needs_review`. It does not edit the DoseWiki app, update Convex, deploy, promote the candidate, or select the next queue item.
- A missing/stale task packet is a stop condition. The approved main-repo export/fresh-run path owns packet freshness.

## Inputs and artifacts

For a live task the directory is `runs/<slug>/`. For a local proposal, every invocation gets an atomically reserved attempt directory: `runs/<slug>--proposal-<section>--<artifactDigest-prefix>--<bridgeDigest-prefix>--attempt-<uuid>/`. The attempt changes on retries/concurrent invocations; the task and its copied binding retain the same immutable proposal identity:

```text
runs/<run-id>/
├── citation-task.json          # live-exported task or proposal-bound local task
├── proposal-input/             # proposal mode only: read-only binding and byte copies
├── sections/<section>.json     # exactly one file per section worker
├── pi-run-manifest.json        # compatibility-named OMP orchestration evidence; never public content
├── article-wide-input.json     # deterministic packet builder output
├── article-wide.json           # one OMP-launched article-wide worker owns this file
├── citation-draft.json         # deterministic assembly output
└── citation-report.md          # human-facing workbench report; required final review surface
```

The manifest supplements, and must not replace, existing workbench outputs. It records separate `runId` and article `slug`, task digest/provenance, proposal binding when present, expected section set, worker/model/artifact evidence, section-status table, deterministic gates, and final `needs_review` outcome. Every gate snapshot includes all `proposal-input/` hashes. Workbench `scripts/artifact-contract.mjs` is the single executable artifact/evidence contract consumed by section checks, merged proactive scans, and final draft validation.

OMP discovers the workflow's named project agents from `.pi/agents/citation-section-worker.md` and `.pi/agents/citation-article-wide-worker.md` and launches them directly. Every worker launch must set:

```json
{
  "turnBudget": { "maxTurns": 28, "graceTurns": 2 },
  "outputSchema": "tools/pi-citation-workflow/section-worker-handoff.schema.json"
}
```

The agents carry a default `toolBudget` of `{"soft":40,"hard":52,"block":"*"}` and do not inherit skills. `turnBudget` and `outputSchema` are OMP agent-runtime per-call options, so they belong on every launch rather than in agent frontmatter. The shared schema is valid for a section or article-wide handoff.

## Permanently local proposal mode

Preparation validates the proposal, manifest, raw-response, article/section/owned hashes, one-section guard, repository-contained paths, and absence of pre-existing `[cite:…]` markers. It copies those three source artifacts byte-for-byte into `proposal-input/`, adds a read-only binding, and constructs a task from only `proposal.after.value` plus the existing input packet's title, source/discovery packets, instructions, and research permission. The five unbound citable sections are `null`; live article prose and targets are never copied.

The task, assembled draft, and manifest must retain identical bindings with `provenance.applyBound: false` and `promotion.allowed: false`. `articlePatches` stays empty. Finalization remains `needs_review` and records `promotionAllowed: false`; the app-repo adapter rejects this draft unconditionally.

## Citable surface

Only these six top-level sections belong in a citation run:

1. `summary`
2. `pharmacology`
3. `tolerance`
4. `harm_potential`
5. `history_culture`
6. `legality`

Never include dosage, duration, subjective effects, interactions, comparisons, reagent testing, identification, or classification. Those need their own content/editorial workflows.

## Coordinator sequence

### 1. Initialize and run preflight

```bash
node "$MANIFEST" init --run "$RUN" --slug "$SLUG"
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate preflight
```

The helper runs the existing workbench preflight with `--run <relative-run>`, records its transcript in `pi-gates/preflight.log`, and records the task plus proposal-input digests. The coordinator reads `citation-task.json` only after that gate passes. It determines which of the six citable sections have substantive content, but still records a terminal status for all six. Proposal mode must have exactly its bound section nonempty.

A task exported with `--sections`/`--tracker-scope` carries `selectedSections` plus frozen per-section `sectionScope` metadata (content hash, marker count, coverage form, skip reason). Preflight validates the scope: entries must be unique citable keys, every selected section must be nonempty, and every frozen hash must still match the task content. `init` mirrors `selectedSections` into the manifest and pre-seeds terminal skip statuses for every non-selected section (`skipped_already_cited`, `skipped_empty`, or `not_selected`, from the task's skip reasons). Every later identity check compares the task's `selectedSections` against the manifest, so scope drift after init fails the run.

The manifest also records `allowLiveWebResearch`. When it is `false`, section and article-wide workers must use only the task packet and approved local discovery material. They must not browse for new sources; unsupported claims become internal gaps.

A task exported with `--second-pass-plan` additionally carries `researchPass: "second"` and an immutable `researchBrief` for the selected rows. The brief, not an ad-hoc coordinator prompt, owns the ordered research lanes, feasibility signals, hard rules, and completion criteria. Second-pass workers must record each lane's queries and outcomes; a negative result is terminal only after all prescribed lanes have auditable outcomes. Analogue, parent, metabolite, or plant-constituent sources may support only public claims that explicitly concern that entity.

### 2. Section workers

- Launch at most **three** OMP-coordinated workers at one time.
- In a scoped run (`selectedSections` present), launch workers only for selected sections. Non-selected sections already hold terminal skip statuses from `init`; never assign a worker to one, and never record `checked` for one, `check-section` rejects it. A selected section whose research finds no defensible evidence is recorded `missing_preserve_original` (and becomes `needs_source` in the subsection rollout tracker), never force-cited.
- Launch the named project agent `citation-section-worker`; do not create an ad-hoc role prompt.
- Give each worker the selected slug, original `article.citableSections.<section>`, source packet, discovery restrictions, the live-web permission value, and one output path: `runs/<run-id>/sections/<section>.json`.
- No worker may modify another section, `article-wide.json`, queue/tracker state, the app repo, or Convex.
- The worker must write its assigned artifact, compute the final SHA-256, and finish by returning only the schema-validated structured handoff. The coordinator verifies `section`, `outputPath`, and `artifactSha256` against the assignment and file. A valid handoff establishes that the worker finished; it does not establish that the citation artifact is acceptable.
- For every successful nonempty section output, run the helper command below. It runs the current workbench `check:worker-output` command and records the checker log plus an artifact digest:

```bash
node "$MANIFEST" check-section --run "$RUN" --workbench "$WORKBENCH" \
  --section <section> --worker-id <pi-run-id> --model <model>
```

- For an empty original section, record preservation without an artifact:

```bash
node "$MANIFEST" section --run "$RUN" --section <section> \
  --status missing_preserve_original
```

- For a failed/invalid candidate, archive it out of `sections/` before reconciliation:

```bash
node "$MANIFEST" section --run "$RUN" --section <section> \
  --status failed_preserve_original --artifact "sections/<section>.json"
```

The helper moves that artifact into `failed-sections/`, so the existing article-wide packet builder cannot ingest its references, evidence, sources, or gaps. Untracked JSON remaining in `sections/` blocks reconciliation.

Map handoff statuses deterministically: `completed` requires artifact/hash verification and `check-section`; `missing_preserve_original` records preservation only when no candidate artifact should be accepted; `failed` archives any candidate and records `failed_preserve_original`. Handoff gaps/notes are orchestration context only and never override checker results.

### 3. Reconcile before article-wide work

Run the reconciliation driver:

```bash
node "$MANIFEST" run-sequence --run "$RUN" --workbench "$WORKBENCH"
```

The driver owns this canonical order: `remap`, `section_rechecks`, `proactive_scan`, `article_wide_packet`, `article_wide_sanitize`, `article_wide_residue_scan`. It stops at the first failure and reports the minimum safe sequence to rerun. A gate whose recorded scoped hash snapshot still matches is reported as `fresh, skipped`, making the command idempotent and the normal in-progress resume path. After a repair, use `--from <gate>`; use `--only <gate>` only as an explicit escape hatch when a single deterministic gate must be exercised.

`remap` runs the existing reference-ID repair with `--write`; `section_rechecks` reruns the deterministic checker for every accepted artifact after that mutation. `article_wide_residue_scan` is an explicit failure gate for `rawCitation`, `sectionRaw`, `[[`, `<ref`, `{{`, `wikipedia.org/wiki`, `psychonautwiki.org/wiki`, and discovery-only/wiki metadata records after sanitization. Sanitization strips those records from the article-wide packet (including `priorWork.references`, sources, evidence, and gaps); article-wide output and the assembled draft are rejected if any remain outside the final review provenance exemption described below.

Each gate stores its exact command/transcript and scoped artifact digest. A later repair invalidates downstream gates, forcing the affected sequence to rerun.

### 4. One article-wide worker

Only after the preceding gates pass, launch the named project agent `citation-article-wide-worker` to write `runs/<run-id>/article-wide.json`.

- It sees the sanitized article-wide packet and accepted section output, not failed candidates or raw wiki material. In a scoped run the packet's `scopedSections` names the marker-writable sections; every other section is preserve-only context.
- It preserves accepted markers and may add only valid marker-only work, and in a scoped run may add new markers only inside the marker-writable sections.
- It observes the same `allowLiveWebResearch` permission as section workers.
- It writes the artifact first and then returns only the same schema-validated handoff, using `section: "article_wide"`. Verify the handoff path and SHA-256, then run:

```bash
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate article_wide_check
```

Reject a stub, all-empty output after accepted work, marker/evidence mismatch, missing evidence status, zero references/evidence for markers, or fewer markers than accepted section input.

### 5. Assemble and validate

```bash
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate assemble_draft
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate validate
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate validate_patches
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate final_review_surface_scan
node "$MANIFEST" finalize --run "$RUN"
```

`finalize` requires all six terminal section statuses (including pre-seeded skip statuses in scoped runs), all required gates to have executed successfully, a nonempty `citation-draft.json`, and an unchanged final-review-surface snapshot. For scoped runs it also requires the draft's `selectedSections` to match the manifest exactly; assembly copies them from the task and hard-fails validation when `markedSections` or evidence field paths fall outside the selected scope. `final_review_surface_scan` fails closed when `article-wide.json`, `citation-draft.json`, or the human-facing `citation-report.md` contains Wikipedia, PsychonautWiki, TripSit, or other discovery/wiki residue, except for these exact audit surfaces:

- top-level `metadata.discoveryProvenance` in `article-wide.json`;
- top-level `metadata.discoveryProvenance` in `citation-draft.json`;
- the body of one exact `## Discovery provenance` section in `citation-report.md`, ending at the next level-one or level-two heading.

The exemption never follows the field name into another location. Public-facing `markedSections`, `references`, `evidence`, and patches always remain fail-closed, including a nested field named `discoveryProvenance`. All other metadata, audit/research notes, reference metadata, and report prose remain scanned.

It sets the local manifest outcome to `needs_review`; after that, `check-section`, `section`, `run-gate`, and `run-sequence` reject all mutations. A correction must use a fresh linked attempt rather than modifying a finalized run:

```bash
node "$MANIFEST" rerun --run "$RUN" --workbench "$WORKBENCH" \
  --reason "Remove forbidden discovery residue from final review output"
```

`rerun` atomically reserves a new `--correction-<uuid>` run, copies only immutable task/proposal inputs, and records the original run ID, final manifest/task digests, finalization time, and reason in the successor's manifest. The finalized parent is never changed. It does not change any external queue state or production data.

For a report-only or article-wide correction, add `--reuse-sections`. The successor copies each predecessor section artifact only when its manifest status is `checked`, the file still exists as a regular file, and its current SHA-256 equals the recorded accepted hash. It pre-records the accepted status, artifact hash, worker/model provenance, and a successor-local checker/reuse record. A missing or mismatched artifact is reported as not reused and leaves that successor section pending; it never blocks creation of the corrective run.

## Evidence requirements

- A marker must use `[cite:reference-id]` syntax and only alter the original text by adding markers.
- Stripping markers must exactly restore the original nested section value, including shape and whitespace.
- Every public marker requires `supported` evidence at the same field path, a stable unique `claimKey`, matching canonical reference id, an inspected source body that binds that same reference id, a contiguous verbatim supporting quote, and rationale.
- `needs_source` or `needs_review` is internal metadata, not public support.
- Wikipedia, PsychonautWiki, and their local caches are discovery-only. They cannot be public claim-level support.
- Reference/source identities must be stable and page-specific. Deduplicate/remap before article-wide packet construction.

## Human boundary

A model may research, draft marker-only output, record a gap, and run deterministic checks. A human/editor decides source adequacy for consequential claims, warning acceptability, retry/queue priority, and every production promotion.

After an apply-bound live-task workflow, an editor may separately use the app-repo apply dry-run. Local-proposal drafts have no dry-run, apply, or promotion capability. No OMP-coordinated citation worker receives Convex production authority.

## Failure handling

- Stop on a missing packet, empty citable surface, failed deterministic gate, malformed artifact, or a draft that fails either final validator.
- Preserve failed artifacts for review, mark the related section `failed_preserve_original`, and do not feed it forward.
- A targeted repair worker may replace only its assigned artifact, after which all downstream gates must be rerun.
- `article_wide_check` first preserves discovery-source narrative under top-level `metadata.discoveryProvenance` and neutralizes only internal gaps/research logs/notes. It never rewrites `markedSections`, references, evidence, or patches; forbidden residue there still fails closed.
- Local campaign automation must inspect the manifest after every OMP process exit, preserve accepted hash-matching artifacts, and resume only the first incomplete stage. Exit code alone is never completion.
- If research tools cannot inspect an adequate non-wiki source, retain the claim without a marker and record an internal gap. Never fabricate support.
