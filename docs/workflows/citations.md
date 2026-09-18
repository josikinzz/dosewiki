# Citation workflow

Citation runs add `[cite:reference-id]` markers to real article text without
changing that text. The vocabulary (Citable Article Surface, Citation-Only Edit,
Supported Public Marker, Citation Draft, Production Rollout Batch, and the rest)
lives in the [glossary](../glossary.md#citation-workflow-language); the design
decision is [ADR 0001](../adr/0001-citation-only-marker-workflow.md).

Every run produces a local draft. A draft is reviewed, then promoted to
production in a separate, explicitly authorized step. No research worker or
campaign automation receives production authority.

## Branches

- **Live task:** one explicit substance slug, exported from the production
  dataset. The finished draft is a `needs_review` candidate that an editor may
  later take through the guarded apply path.
- **Local proposal:** one immutable generated-section proposal
  (`prepare-local-proposal-run.mjs --proposal <path>`). The resulting draft is
  permanently non-promotable: `provenance.applyBound: false`,
  `promotion.allowed: false`, `articlePatches` empty, and the app-repo adapter
  rejects it unconditionally.
- **Apply:** only for a reviewed, apply-bound live-task draft after explicit
  approval. See [Applying a draft](#applying-a-draft).

Require exactly one explicit slug or proposal path. Never infer either from a
queue, prior conversation, run directory, or sample.

## Hard invariants

- **Marker-only edits.** A marker uses `[cite:reference-id]` syntax and only
  alters the original text by adding markers. Stripping markers must exactly
  restore the original nested section value, including shape and whitespace.
  `scripts/citations/citation-only-validator.mjs` enforces this.
- **Citable surface.** Only `summary`, `pharmacology`, `tolerance`,
  `harm_potential`, `history_culture`, and `legality` belong in a run. Dosage,
  duration, subjective effects, interactions, comparisons, reagent testing,
  identification, and classification have their own workflows.
- **Evidence.** Every public marker requires `supported` evidence at the same
  field path, a stable unique `claimKey`, a matching canonical reference id, an
  inspected source body bound to that reference id, a contiguous verbatim
  supporting quote, and a rationale. `needs_source` and `needs_review` are
  internal metadata, never public support. A discovery packet or wiki page
  never supplies claim-level support. If no adequate non-wiki source can be
  inspected, keep the claim unmarked and record an internal gap; never
  fabricate support. `scripts/citations/citation-evidence-policy.mjs` owns the
  generic evidence and second-pass research policy and renders it into task
  notes and research briefs.
- **Reference identity.** Reference and source identities are stable and
  page-specific; `lib/citations/referenceIdentity.mjs` owns deterministic IDs
  and provenance merging. Deduplicate and remap before article-wide packet
  construction.
- **Immutable inputs.** A missing or stale task packet is a stop condition.
  Never rewrite a task snapshot to resume a run; correct through a fresh
  linked attempt instead.
- **Credentials.** Before any remote export or the separately approved apply
  dry run or write, follow [data credentials](../operations/data-credentials.md).
  Postgres is authoritative; freeze, intent, exact-target, and confirmation
  gates remain mandatory.

## Workbench and commands

Runs live in an external workbench directory outside this repository. Its
location comes from `DOSEWIKI_CITATION_WORKBENCH` or an explicit path argument;
`scripts/citations/citation-workbench-root.mjs` never defaults it.

`package.json` owns the executable `citations:*` commands. The ones a run uses:

| Command | Purpose |
| --- | --- |
| `npm run citations:export-workbench-task` | Export one substance's task packet (`--sections`/`--tracker-scope` freeze a section scope; `--second-pass-plan` freezes a research brief) |
| `npm run citations:plan-second-pass` | Plan a second research pass for rows that still lack support |
| `npm run citations:campaign` | `init` creates a campaign file once; `status` reads it and counts coverage only when a draft hash matches its finalized manifest |
| `npm run citations:apply-workbench` | Guarded dry run or write of a reviewed apply-bound draft |
| `npm run citations:rebase-workbench` | Rebase a draft onto the current production article before apply |
| `npm run citations:archive-production-dataset` | Snapshot the production dataset before a rollout batch |
| `npm run citations:audit-subsections` | Read-only audit of citation coverage per subsection |

Run orchestration is `node scripts/tools/pi-citation-workflow/pi-run-manifest.mjs`
(`$MANIFEST` below). `scripts/lib/citation-command-surface.mjs` is the
machine-readable policy for every citation command.

## Run directory

```text
runs/<run-id>/
├── citation-task.json          # live-exported task or proposal-bound local task
├── proposal-input/             # proposal mode only: read-only binding and byte copies
├── sections/<section>.json     # exactly one file per section worker
├── failed-sections/            # archived candidates that failed checks
├── pi-run-manifest.json        # orchestration evidence; never public content
├── pi-gates/<gate>.log         # transcript per deterministic gate
├── article-wide-input.json     # deterministic packet builder output
├── article-wide.json           # the single article-wide worker owns this file
├── citation-draft.json         # deterministic assembly output
└── citation-report.md          # human-facing report; required final review surface
```

A live task uses `runs/<slug>/`. A local proposal reserves an attempt-unique
directory per invocation; the task and its copied binding retain the same
immutable proposal identity across retries.

## Coordinator sequence

A coordinator (a person or automation) drives the manifest tool; research
workers write section artifacts and return a handoff validated against
`scripts/tools/pi-citation-workflow/section-worker-handoff.schema.json`.

### 1. Initialize and preflight

```bash
node "$MANIFEST" init --run "$RUN" --slug "$SLUG"
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate preflight
```

Read `citation-task.json` only after preflight passes. Every one of the six
citable sections receives a terminal status even when empty. A scoped task
(`selectedSections` plus frozen per-section `sectionScope` hashes) is validated
by preflight; `init` mirrors the scope into the manifest and pre-seeds
`skipped_already_cited`, `skipped_empty`, or `not_selected` for non-selected
sections. Scope drift after `init` fails the run. The manifest records
`allowLiveWebResearch`; when `false`, workers use only the task packet and
approved local discovery material.

### 2. Section workers

- One worker per selected nonempty section, writing only
  `runs/<run-id>/sections/<section>.json`. Keep concurrency small (three at a
  time has been the working limit).
- A worker never modifies another section, `article-wide.json`, tracker state,
  the app repository, or the data backend.
- The worker writes its artifact, computes its SHA-256, and returns only the
  structured handoff. Verify `section`, `outputPath`, and `artifactSha256`
  against the assignment. A valid handoff proves the worker finished, not that
  the artifact is acceptable.
- Record each outcome deterministically:

```bash
# accepted candidate: runs the workbench checker and records its log and digest
node "$MANIFEST" check-section --run "$RUN" --workbench "$WORKBENCH" \
  --section <section> --worker-id <run-id> --model <model>

# empty original section: preservation without an artifact
node "$MANIFEST" section --run "$RUN" --section <section> --status missing_preserve_original

# failed or invalid candidate: archive it out of sections/ before reconciliation
node "$MANIFEST" section --run "$RUN" --section <section> \
  --status failed_preserve_original --artifact "sections/<section>.json"
```

`check-section` rejects empty sections and non-selected sections. A selected
section with no defensible evidence is recorded `missing_preserve_original`,
never force-cited. Untracked JSON left in `sections/` blocks reconciliation.

### 3. Reconcile

```bash
node "$MANIFEST" run-sequence --run "$RUN" --workbench "$WORKBENCH"
```

The driver owns the canonical order `remap`, `section_rechecks`,
`proactive_scan`, `article_wide_packet`, `article_wide_sanitize`,
`article_wide_residue_scan`. It stops at the first failure and reports the
minimum safe sequence to rerun. A gate whose scoped hash snapshot still matches
is reported `fresh, skipped`, so the command is the normal resume path. After a
repair use `--from <gate>`; `--only <gate>` is an explicit escape hatch.

`remap` runs the reference-ID repair with `--write`; `section_rechecks` reruns
the checker for every accepted artifact afterwards. `article_wide_residue_scan`
fails on `rawCitation`, `sectionRaw`, `[[`, `<ref`, `{{`, `wikipedia.org/wiki`,
`psychonautwiki.org/wiki`, and discovery-only or wiki metadata records that
survive sanitization. A later repair invalidates every downstream gate.

### 4. One article-wide worker

Only after reconciliation passes, one worker writes
`runs/<run-id>/article-wide.json` from the sanitized packet and accepted
section output. It preserves accepted markers, adds only marker-only work, and
in a scoped run adds markers only inside `scopedSections`. Verify the handoff,
then:

```bash
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate article_wide_check
```

Reject a stub, all-empty output after accepted work, marker/evidence mismatch,
missing evidence status, zero references or evidence for markers, or fewer
markers than the accepted section input.

### 5. Assemble, validate, finalize

```bash
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate assemble_draft
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate validate
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate validate_patches
node "$MANIFEST" run-gate --run "$RUN" --workbench "$WORKBENCH" --gate final_review_surface_scan
node "$MANIFEST" finalize --run "$RUN"
```

`finalize` requires all six terminal section statuses, every required gate
passed, a nonempty `citation-draft.json`, an unchanged final-review-surface
snapshot, and (for scoped runs) draft `selectedSections` identical to the
manifest. `final_review_surface_scan` fails closed on Wikipedia, PsychonautWiki,
TripSit, or other discovery residue in `article-wide.json`,
`citation-draft.json`, or `citation-report.md`, with exactly three exempt audit
surfaces: top-level `metadata.discoveryProvenance` in each JSON file and the
body of one `## Discovery provenance` section in the report. The exemption
never follows the field name elsewhere; `markedSections`, `references`,
`evidence`, and patches always stay fail-closed.

After `finalize` sets `needs_review`, every mutating subcommand rejects the run.
Corrections use a fresh linked attempt:

```bash
node "$MANIFEST" rerun --run "$RUN" --workbench "$WORKBENCH" --reason "<why>" [--reuse-sections]
```

`rerun` reserves a new `--correction-<uuid>` run, copies only immutable inputs,
and records the parent's identity and reason. `--reuse-sections` copies a
predecessor section artifact only when its status is `checked` and its current
SHA-256 equals the recorded accepted hash.

## Failure handling

- Stop on a missing packet, empty citable surface, failed deterministic gate,
  malformed artifact, or a draft that fails either final validator.
- Preserve failed artifacts for review as `failed_preserve_original`; never feed
  them forward.
- A targeted repair worker may replace only its assigned artifact, after which
  every downstream gate reruns.
- Campaign automation inspects the manifest after every worker process exit,
  preserves accepted hash-matching artifacts, and resumes only the first
  incomplete stage. Exit code alone is never completion.

## Applying a draft

An editor, separately from any research run, may take a reviewed apply-bound
live-task draft through `npm run citations:apply-workbench`. The command
enforces the full ceremony from [data credentials](../operations/data-credentials.md):
`DATA_BACKEND=postgres`, an explicit `TARGET_POSTGRES_URL`,
`--expected-deployment=<region>.pg.psdb.cloud/postgres`, `--allow-remote` with
`POSTGRES_IMPORT_CONFIRM`, then `--write --confirm-citation-write
--confirm-write=apply-citation-workbench-draft`. Apply one slug per write;
`data:sync-production` is not a substitute. A clean dry run authorizes neither a
write nor another target.

Before a rollout batch, `npm run citations:archive-production-dataset` writes
`archive/citation-rollout/<dated>/{SubstanceIndex.json,manifest.json,slugs.txt}`.
After a write, verify the public article at `https://dose.wiki/<slug>` and the
review diagnostics at `/dev/citation-review/<slug>` on the editor host.

## Reference corrections

For a separately approved reference correction, validate changed sources
without forcing unrelated legacy collisions to change; new collisions remain
invalid. A deliberate source-ID cutover removes the old ID and moves every
article marker to the retained source. Preserve metadata provenance only for one
compatible prior identity, never a different or ambiguous source.

Instrument-only edits validate changed citation fields, not untouched notes.
Status, canonical status, designation, or citation-needed changes recheck all
country citation fields. Never relabel medical or research sources as legal
evidence. Retain revision evidence; re-review only evidence tied to changed
fields or reference IDs. Unused-reference metadata correction must not decertify
unrelated claims. Publication binds exact approved values, the current revision
hash, and a recovery snapshot under the guarded ceremony.
