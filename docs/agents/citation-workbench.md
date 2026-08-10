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
- Citation-author repair planner: `scripts/citations/plan-reference-author-repairs.mjs`
- Citation-author residual queue builder: `scripts/citations/build-reference-author-review-queue.mjs`
- Independently reviewed residual proposal builder: `scripts/citations/build-reviewed-reference-author-repair-proposal.mjs`
- Citation-author guarded apply command: `scripts/citations/apply-reference-author-repairs.mjs`
- Historical provenance backfill planner: `scripts/citations/plan-reference-metadata-provenance-backfill.mjs`
- Historical provenance guarded apply command: `scripts/citations/apply-reference-metadata-provenance-backfill.mjs`
- Citation reference identity helpers: `lib/citations/referenceIdentity.js`
- Public citation token rendering: `src/features/article/components/CitedText.tsx`
- Article sections currently touched by citation rendering: `src/features/article/components/sections/`
- Article schema source of truth: `src/schema/substance.schema.ts`

## Friction Notes

- When operating the workbench, record friction points that could be prevented by a short instruction tweak. Keep these notes practical and lightweight; prefer simple wording changes over new scripts or process.
- Record per-substance Claude citation-run friction in [docs/citation-claude-friction-log.md](../citation-claude-friction-log.md). This is a Codex-only, repo-local notes file; do not mirror it into the external workbench where Claude can see it.
- Example: if large worker outputs fail because a subagent tries to write too much JSON at once, note that the worker should write large artifacts in chunks after a modest size threshold instead of one giant response.
- The Computer Use → ttyd browser-terminal transport is retired (the `terminal:claude` npm script no longer exists). Citation runs launch headlessly via `pi -p "/skill:pi-citation-workflow <slug>"` from this repo; queue orchestration lives in the workbench `.codex/skills/cite` skill.

## Claude Boundary

- Codex-only workflow notes belong in this file, not in the citation workbench repo.
- The workbench repo should expose only `CLAUDE.md` to Claude. Do not recreate a workbench `AGENTS.md` unless the user explicitly asks for a new Codex-visible instruction surface there.
- Claude should not need to know that Codex exports tasks, orchestrates the queue, applies drafts, deploys, or receives handoffs.
- Claude must stay inside the workbench repo during citation runs. If outside data is needed, Codex should scaffold it into the run before Claude starts.

## Hard Invariants

- Convex is authoritative for live article data. Do not fix live citation content by hand-editing local JSON.
- Workbench outputs are drafts until this repo adapts, dry-runs, reviews, and explicitly writes them.
- The normal citation run launch is `pi -p "/skill:pi-citation-workflow <drug-slug>"` from this repo (the app repo hosts the workflow's skill/agent definitions); all run artifacts, trackers, and validation stay in `/Users/josie/.codex/dosewiki-citation-workbench`, and the run never edits this repo's content.
- Before `/cite`, run `npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run preflight -- --slug <drug-slug>`; if it reports an empty citable surface, re-export the live Convex task and rerun workbench `fresh-run` before starting a run.
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
- Expected finish sequence: launch/verify section workers -> post-section scan/fix -> remap/proactive scan -> `article-wide:packet` -> packet sanitation -> article-wide -> deterministic non-empty/evidence check -> assemble -> validate -> validate:patches. If any step is repaired, rerun the later steps.
- Paywalled papers are acceptable public citations when an accessible abstract directly supports the claim; record them as `access: "abstract_only"` rather than dropping them solely for paywall status.
- `citations:apply-workbench` is for reviewed `citation-draft.json` output only. It must not generate new citations or bypass workbench validation.
- Writes must use the shared data-ops confirmation flow and require `--write --confirm-citation-write`.
- Citation-author proposal generation is not approval. Never apply an unreviewed proposal: the apply command requires a separate human approval artifact bound to the proposal's immutable digest and permits only its high-confidence rows.
- Citation-author residual rows are review-only. Group them with `citations:build-author-review-queue` for human or selective subagent research; never promote a residual row through the automated apply path.
- Keep unsupported or review-only evidence out of public citation markers unless the adapter explicitly models that behavior.
- Do not hand-edit generated files in `convex/_generated/` or `src/data/schema/*.generated.ts`.
- Keep `editorial_review` as editor-only metadata. Do not render it as public article content.

## Pi-native workflow boundary

- The repo-local Pi workflow is owned by `.pi/skills/pi-citation-workflow/` and uses the named project agents in `.pi/agents/`; it does not replace the external Claude `/cite` transport described elsewhere in this file.
- Pi workers return the shared schema-validated handoff after writing their assigned artifact. The handoff plus `check-section` or `article_wide_check` replaces file size/mtime waiting.
- Workbench `scripts/artifact-contract.mjs` is the single executable worker/draft evidence contract. Section checks, merged proactive scans, and final validation all consume it, including unique claim keys and complete reference → inspected source → quote closure.
- `article_wide_check` normalizes discovery-source wording only in internal gaps/research logs/notes, preserving the original wording under top-level `metadata.discoveryProvenance`; public marked prose, references, evidence, and patches remain fail-closed and are never rewritten.
- Use `pi-run-manifest.mjs run-sequence` for the six reconciliation gates. Corrective finalized attempts may use `rerun --reuse-sections`; only accepted artifacts with matching recorded hashes carry forward.
- Final review artifacts may retain discovery history only at top-level `metadata.discoveryProvenance` in JSON and one exact `## Discovery provenance` report section. Public marker, reference, evidence, and patch surfaces remain fail-closed.

## Common Commands

```bash
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
npm run citations:plan-author-repairs -- --limit=20 --output=tmp/citation-author-repair-proposals/canary.json
npm run citations:build-author-review-queue -- --proposal=tmp/citation-author-repair-proposals/canary.json --output=tmp/citation-author-repair-review-queues/canary.json
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  node scripts/citations/apply-reference-author-repairs.mjs \
  --proposal=tmp/citation-author-repair-proposals/canary.json \
  --approval=tmp/citation-author-repair-approvals/canary.json \
  --expected-deployment=glad-minnow-656
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  node scripts/citations/apply-reference-author-repairs.mjs \
  --proposal=tmp/citation-author-repair-proposals/canary.json \
  --approval=tmp/citation-author-repair-approvals/canary.json \
  --write --confirm-citation-author-write \
  --confirm-write=apply-citation-author-repairs --expected-deployment=glad-minnow-656
npm run citations:plan-second-pass -- --audit=tmp/subsection-citation-audit.json
npm run citations:export-workbench-task -- --slug=2c-b --dry-run
npm run citations:export-workbench-task -- --slug=2c-b --overwrite
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=2c-b --dry-run \
  --expected-deployment=glad-minnow-656
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write \
  --confirm-write=apply-citation-workbench-draft --expected-deployment=glad-minnow-656
npx vitest run --config scripts/test/vitest.workflow.config.ts scripts/citations/workbench-draft-adapter.test.mjs
npm run test -- src/features/article/components/sections/PilotSectionCitations.test.tsx
npm run lint:scripts
npm run typecheck
```

## Citation-author repair boundary

The author-repair planner is a read-only metadata completion workflow, not a
citation-authoring workflow. For each marker-linked authorless reference it uses
PubMed for PMID records or Crossref for DOI records, with OpenAlex fallback, and
records provider provenance. It classifies only matching stable identifiers,
matching normalized titles, agreeing providers, and non-empty individual authors
as high confidence. All provider failures, conflicts, missing metadata, and
organizational or ambiguous authorship remain residual.

Proposal JSON is immutable and digest-bound. A human reviews it and creates the
separate `citation_author_repair_approval` artifact described in
`scripts/README.md`; generating either the proposal or residual queue grants no
approval. The apply command defaults to dry-run. Its confirmed write mode also
requires `--write --confirm-citation-author-write`, the shared confirmation
phrase, and the exact expected deployment. It updates authors through the narrow
CAS mutation only: changed reference identity or authors produce a stale conflict
and no whole-article fallback. Successful writes create article backups and an
audit log and re-read every changed reference for post-write verification.

Residual queues contain deterministic 10–20 item batches intended for human
review or selective subagent investigation. They are never promoted through the
automated provider-match lane. A separate independently reviewed lane can create
a new proposal only after validating the original proposal and queue digests,
complete batch and row coverage, authoritative review evidence, and a separate
per-row refutation by a different reviewer bound to the result hash. Only rows
that survive refutation are eligible; duplicates, unresolved, refuted, and
uncertain rows stay residual. This lane preserves the original expected-reference
snapshot for the existing authors-only CAS mutation and retains both reviewers'
evidence in the audit. Its output still requires a separate human approval
artifact and all normal production-write confirmations.

Canonical references now accept bounded `metadataProvenance` entries. Successful
formal-metadata enrichment is adapted to `kind: fetched` entries before article
persistence, including the actual provider and only the fields reported by that
provider; no retrieval timestamp or artifact digest is added unless the workflow
actually has one. Reference merges preserve this lineage and prefer inspected
or fetched values over weaker cached/imported values without allowing an empty
field to erase populated metadata. Provenance is descriptive rather than
self-authenticating: shared merges keep populated scalar conflicts by default,
and only trusted workbench, formal-citation, and legality workflows opt into
provenance-ranked scalar replacement after establishing the lineage themselves.
DOI, PMID, ISBN, and canonical URL are identity constraints and are never
overwritten; overlapping references with any conflicting populated stable
identifier remain separate for exception review. Portal intake replaces
client-supplied lineage with server-owned imported provenance.

The 74 deterministic and 685 independently reviewed author repairs predate that
canonical field. Their compact, tracked batch/per-reference provider lineage is
preserved in `scripts/data/tracked/citation-author-repair-lineage.json`, bound to
the proposal digests plus the exact approval and successful-audit file hashes.
The sanitized per-row evidence needed by a fresh checkout is tracked separately
in `scripts/data/tracked/citation-author-repair-evidence.json`. It contains exact
article/reference keys, repaired authors, stored and evidence identity, fetched
provider lanes or independently inspected authoritative domains, and source
artifact digests. It intentionally omits raw research quotations, secrets, and
absolute paths. The 74 deterministic rows are `fetched`; all 685 reviewed rows
remain `inspected` and can never be relabeled as API-only metadata.
Three reviewed rows were resolved by independent inspection of first-party FDA,
MedlinePlus, or NCBI evidence after automated providers returned no usable
result; those rows have empty `referenceProviders` arrays and explicit
`manualEvidence` entries containing the evidence domains, identifiers, and
review/refutation hashes. Empty provider arrays therefore never imply missing
lineage or invented API use.

The manifest's `mutationSetSha256` is SHA-256 over UTF-8 `JSON.stringify` of its
reference keys sorted lexicographically. The tracked evidence bundle is itself
canonically digested and file-hash bound from the manifest. Validation requires
exact 74 + 685 key coverage, identity/author consistency, and source-hash
declarations without depending on ignored artifacts; when a local source
artifact exists, its bytes must still hash-match. Rebuilding the evidence bundle
requires the original local successful audits and reviewed proposal, while a
fresh checkout only needs the tracked bundle to validate:

```bash
npm run citations:validate-author-repair-lineage
```

A separate provenance-only backfill lane can now move that historical lineage
onto the 759 canonical references without reapplying or changing authors. The
planner is read-only, requires an explicit Convex source and new exclusive
output path, and consumes only the tracked evidence bundle after validating the
manifest. It fails closed unless every slug/reference is unique and its live
stored title, DOI/PMID, and authors match the tracked identity. Evidence titles
must match the stored title except for reviewed legacy rows whose stored title
was already known to be malformed; those rows require exact DOI/PMID identity
plus both primary and independent inspected bindings. Deterministic rows become
`kind: fetched` entries with the actual provider and DOI/PMID lane; independently
reviewed rows become `kind: inspected` entries bound to the primary result and
independent-refutation artifact digests. The three manual rows retain their
first-party evidence domains.

```bash
npm run citations:plan-provenance-backfill -- \
  --source-url=https://glad-minnow-656.convex.cloud \
  --output=tmp/citation-reference-provenance-backfill/proposal.json
```

Review the immutable proposal and create a separate
`citation_reference_provenance_backfill_approval` artifact with
`decision: approved`, `scope: all_rows`, its exact proposal digest, a canonical
millisecond ISO timestamp, and a nonempty reviewer identity. Add
`approvalArtifactSha256`, computed as canonical JSON SHA-256 over every approval
field except that digest. The apply path rejects a missing/stale self-digest and
retains it plus the evidence-bundle binding in the audit. The apply command
defaults to dry-run. Production mode additionally requires the exact target and
deployment, `--write`, `--confirm-citation-provenance-write`, and
`--confirm-write=apply-citation-reference-provenance-backfill`:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-provenance-backfill -- \
  --proposal=tmp/citation-reference-provenance-backfill/proposal.json \
  --approval=tmp/citation-reference-provenance-backfill/approval.json \
  --expected-deployment=glad-minnow-656

TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-provenance-backfill -- \
  --proposal=tmp/citation-reference-provenance-backfill/proposal.json \
  --approval=tmp/citation-reference-provenance-backfill/approval.json \
  --write --confirm-citation-provenance-write \
  --confirm-write=apply-citation-reference-provenance-backfill \
  --expected-deployment=glad-minnow-656
```

Before every write, the command re-reads a bounded unique article/reference
snapshot and checks exact title, normalized DOI/PMID, exact authors, and the
exact current provenance snapshot. The Convex helper patches only
`metadataProvenance`, is idempotent when already applied, and rejects stale,
conflicting, malformed, destructive, duplicate, or unbounded requests. Confirmed
writes create per-article backups, an audit log, and post-write verification.

The residual HTML tracker is reproducible from
`scripts/data/tracked/citation-metadata-repair-tracker-residuals.json`. Validate
that its 187 rows/97 articles, title-first previews, embedded payload, and stable
`dosewiki-citation-repair-decisions-v1` localStorage key still match with:

```bash
npm run citations:validate-metadata-repair-tracker
```

Pass `--write` only to deterministically replace the embedded row payload from
that tracked JSON; this command never queries or writes Convex.

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

3. Launch one headless citation run from this repo (one slug per invocation):

```bash
command /opt/homebrew/bin/pi -p "/skill:pi-citation-workflow <drug-slug>" </dev/null
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
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run \
  --expected-deployment=glad-minnow-656
```

For a planned second-pass attempt, use the immutable plan rather than an ad-hoc
research prompt:

```bash
npm run citations:plan-second-pass -- --audit=tmp/subsection-citation-audit.json
SOURCE_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:export-workbench-task -- --slug=<drug-slug> --overwrite \
  --second-pass-plan=outputs/citation-second-pass-research-plan.json \
  --second-pass-max-wave=1
npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- \
  --slug <drug-slug> --run-id <drug-slug>-second-pass-1
```

The task's `researchBrief` owns ordered source lanes and negative-search
completion criteria. Tolerance and Deschloroketamine remain excluded, and a
second pass never permits analogue inference or automatic production apply.

If the dry-run fails with `text_changed` (the live article drifted since the
draft was made), rebase the draft instead of rerunning research: field-level
marker transplant keeps every marker whose prose is unchanged and drops only
the stale fields (recorded in the draft's `rebase` report; dropped fields are
targeted re-cite candidates). It also sanitizes reference `template` values and
numeric `volume`/`issue`/`pages` that the Convex article contract rejects:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud npm run citations:rebase-workbench -- --slug=<drug-slug>
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> \
  --draft=<workbench>/runs/<drug-slug>/citation-draft.rebased.json --dry-run \
  --expected-deployment=glad-minnow-656
```

Stop there unless the user explicitly asks to write to Convex or continue the
queue. Do not automatically advance to the next `ready` drug after a
single-substance rerun. For an approved local-only multi-substance campaign, use
`citations:run-local-campaign`; it resumes from manifest state and has no
production apply capability. Rebuild the nontechnical review artifact with
`citations:review-dossier` before seeking batch promotion approval.

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
