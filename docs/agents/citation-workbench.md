# Citation Workbench Agent Notes

## Scope

- The active citation path is the repo-local Pi contract in `docs/agents/pi-citation-run-contract.md`, implemented under `tools/pi-citation-workflow/`.
- `/Users/josie/.codex/dosewiki-citation-workbench` stores run inputs, artifacts, and validation output. This repository owns export, adaptation, review, apply, and public rendering.
- Use the external Claude workbench transport only when the user explicitly asks for that transport or for its queue orchestration.

## Start here

- Read [the Pi citation run contract](pi-citation-run-contract.md) and [workflow guide](pi-citation-workflow.md).
- Read [docs/citation-workbench-tracker.md](../citation-workbench-tracker.md) for project state and integration notes.
- Use [scripts/README.md](../../scripts/README.md), especially "Formal citations," for script details.
- The completed citation-author repair and provenance records are historical evidence. They live in [Historical citation-author repair evidence](#historical-citation-author-repair-evidence), outside the run sequence.

## Current project paths

- Pi workflow implementation and agents: `tools/pi-citation-workflow/` and `.pi/agents/`
- Workbench apply script and adapter: `scripts/citations/apply-workbench-draft.mjs` and `scripts/citations/workbench-draft-adapter.mjs`
- Citation workflow scripts and tests: `scripts/citations/`
- Citation reference identity helpers: `lib/citations/referenceIdentity.mjs`
- Public citation token rendering: `src/features/article/components/CitedText.tsx`
- Article schema source of truth: `src/schema/substance.schema.ts`

## Friction notes

- Record a friction point only when a short instruction change could prevent it.
- For the optional external Claude branch, record per-substance friction in [docs/citation-claude-friction-log.md](../citation-claude-friction-log.md). Keep this Codex-only file in this repository.
- The Computer Use → ttyd transport and `terminal:claude` script are retired. Pi runs launch headlessly from this repository. External queue orchestration stays in the workbench `.codex/skills/cite` skill.

## Transport branches

- **Active Pi path:** Use this for an explicit substance slug or immutable local proposal unless the user explicitly chooses the external Claude branch. Invoke Pi with an explicit prompt to follow `docs/agents/pi-citation-run-contract.md` and `docs/agents/pi-citation-workflow.md`. It writes and validates artifacts in the external workbench without changing repository content or Convex.
- **Optional external Claude branch:** Use this only when the user explicitly asks for the external Claude `/cite` transport or its queue orchestration. Read `/Users/josie/.codex/dosewiki-citation-workbench/CLAUDE.md` and the workbench `.codex/skills/cite` skill. Keep Claude inside the workbench; scaffold any outside data before launch. Keep repository orchestration, apply, deploy, and handoff details out of Claude-visible instructions.
- **Apply branch:** Enter this only after a reviewed, apply-bound live-task draft exists and the user explicitly asks to write it. Local-proposal drafts can never enter this branch.

## Hard invariants

- Convex `glad-minnow-656` is authoritative for every live-task export, dry-run, and write. Fix live citation content through the reviewed draft path, not local JSON.
- Workbench output stays a draft until this repository adapts, validates, reviews, and explicitly writes it.
- Citation drafts are marker-only. Stripping `[cite:reference-id]` markers must restore the original text exactly.
- The citable surface is exactly `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`. Keep dosage, duration, subjective effects, comparisons, reagent testing, interactions, identification, and classification unchanged.
- A missing citable section output is a warning only when the original section is preserved exactly and no unsupported public marker is added. Invalid output is a failure.
- Wikipedia and PsychonautWiki articles and local caches are discovery-only. Public markers require inspected, non-wiki evidence at the exact field path.
- Use page-specific reference IDs. Repeated same-site sources need a stable page identifier such as a DailyMed setid or Health Canada DIN/product ID.
- Keep `article-wide-input.json` free of raw packet residue, including `rawCitation`, `sectionRaw`, `[[`, `<ref`, `{{`, `wikipedia.org/wiki`, and `psychonautwiki.org/wiki`.
- A 156-byte article-wide stub, empty `markedSections`/`references`/`evidence`, markers with zero references or evidence, evidence without `status`, marker/evidence mismatches, or fewer returned markers than accepted input is a failure.
- An accessible abstract may support a public citation to a paywalled paper. Record `access: "abstract_only"`.
- `citations:apply-workbench` accepts reviewed `citation-draft.json` output only. It does not generate citations or bypass validation.
- Keep unsupported and review-only evidence out of public markers. Keep `editorial_review` editor-only.
- Writes use the shared data-ops confirmation flow and require `--write --confirm-citation-write`.
- Leave generated files in `convex/_generated/` and `src/data/schema/*.generated.ts` to their generators.

## Pi workflow contract

- `docs/agents/pi-citation-run-contract.md`, `tools/pi-citation-workflow/`, and the named agents in `.pi/agents/` own the active workflow. Follow the contract instead of copying its internal gates into this file.
- Pi workers signal completion with a schema-validated handoff. `check-section`, `article_wide_check`, and `scripts/artifact-contract.mjs` decide whether an artifact is accepted.
- `pi-run-manifest.mjs run-sequence` owns reconciliation. A corrective finalized attempt uses `rerun --reuse-sections`; only accepted artifacts with matching recorded hashes carry forward.
- Discovery history may appear only at top-level `metadata.discoveryProvenance` in JSON and in one exact `## Discovery provenance` report section. Public marked prose, references, evidence, and patches remain fail-closed.

## Focused validation commands

```bash
npx vitest run --config scripts/test/vitest.workflow.config.ts scripts/citations/workbench-draft-adapter.test.mjs
npm run test -- src/features/article/components/sections/PilotSectionCitations.test.tsx
npm run lint:scripts
npm run typecheck
```

## Ordered run and handoff sequence

Run every repository command from the DoseWiki repository root. Use one slug per run.

1. Prepare a fresh live-task input from production. Dry-run the export, write the export, prepare a fresh workbench run, and pass preflight:

   ```bash
   SOURCE_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:export-workbench-task -- --slug=<drug-slug> --dry-run
   SOURCE_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:export-workbench-task -- --slug=<drug-slug> --overwrite
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug> --dry-run
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- --slug <drug-slug>
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run preflight -- --slug <drug-slug>
   ```

   If preflight reports an empty citable surface, repeat the production export and `fresh-run`. Refresh the local discovery caches before `fresh-run` only when the run needs newer discovery material:

   ```bash
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run cache:wikipedia
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run cache:psychonautwiki:local
   ```

   For an immutable local proposal, skip export and `fresh-run`; prepare it with `tools/pi-citation-workflow/prepare-local-proposal-run.mjs`, then invoke Pi with an explicit prompt naming the returned run and the Pi citation run contract. That draft remains permanently local and review-only.

   For an approved second pass, use the immutable plan:

   ```bash
   npm run citations:plan-second-pass -- --audit=tmp/subsection-citation-audit.json
   SOURCE_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:export-workbench-task -- --slug=<drug-slug> --overwrite \
     --second-pass-plan=outputs/citation-second-pass-research-plan.json \
     --second-pass-max-wave=1
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run fresh-run -- \
     --slug <drug-slug> --run-id <drug-slug>-second-pass-1
   ```

   The task's `researchBrief` controls source order and negative-search completion. Tolerance and Deschloroketamine remain excluded; a second pass does not permit analogue inference or automatic production apply.

2. Choose one transport:
   - Active Pi path:

     ```bash
     command /opt/homebrew/bin/pi -p "Run the Pi citation workflow for <drug-slug>. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md." </dev/null
     ```

   - Optional external Claude branch: enter only for an explicit request for the external Claude `/cite` transport or its queue orchestration. Run it inside `/Users/josie/.codex/dosewiki-citation-workbench` under its `CLAUDE.md` and `.codex/skills/cite` instructions. Do not run Pi and Claude against the same attempt.

3. Verify the selected transport completed the same artifact contract. `runs/<drug-slug>/citation-draft.json` and `citation-report.md` must exist; both workbench validators must pass; a Pi run must also have a finalized `pi-run-manifest.json` with outcome `needs_review`:

   ```bash
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate -- --run runs/<drug-slug>
   npm --prefix /Users/josie/.codex/dosewiki-citation-workbench run validate:patches -- --run runs/<drug-slug>
   ```

   Repair quote fidelity, ellipses in `supportingQuote`, discovery-only support, unsupported public markers, marker-path mismatches, missing evidence `status`, and marker/evidence mismatches before handoff. For a workbench queue run, update its queue and progress trackers after validation.

4. Return to the repository root and dry-run the reviewed draft against production:

   ```bash
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run \
     --expected-deployment=glad-minnow-656
   ```

   If the dry-run reports `text_changed`, rebase and dry-run the rebased draft:

   ```bash
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:rebase-workbench -- --slug=<drug-slug>
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:apply-workbench -- --slug=<drug-slug> \
     --draft=<workbench>/runs/<drug-slug>/citation-draft.rebased.json --dry-run \
     --expected-deployment=glad-minnow-656
   ```

5. Stop after the clean dry-run unless the user explicitly asks for a production write or a queue continuation. For an approved write, apply one slug with the production target and full confirmation:

   ```bash
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
     npm run citations:apply-workbench -- --slug=<drug-slug> \
     --write --confirm-citation-write \
     --confirm-write=apply-citation-workbench-draft \
     --expected-deployment=glad-minnow-656
   ```

Completion criterion: the selected run is validated, its review artifacts are present, the production apply dry-run is clean, and no write or next-slug run occurs without the matching explicit user request.

## Environment variables

- `SOURCE_CONVEX_URL`: set to `https://glad-minnow-656.convex.cloud` for live-task exports and archive reads.
- `TARGET_CONVEX_URL`: set to `https://glad-minnow-656.convex.cloud` for every citation dry-run and write.
- `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE`: production admin-intent token required by `citations:apply-workbench --write`.
- `OPENROUTER_API_KEY`: required for OpenRouter-backed generation, not for applying reviewed drafts.

## Validation

- For adapter changes, run the focused `workbench-draft-adapter` test first with the workflow Vitest config.
- For public marker rendering changes, run the focused article citation rendering tests first.
- For script workflow changes, run `npm run lint:scripts`; broaden to `npm run test:workflow` when the shared data-ops path changes.
- For schema changes, inspect `src/schema/substance.schema.ts`, run `npm run generate:schema`, and include generated helper updates.

## Historical citation-author repair evidence

This appendix preserves completed repair, provenance, and tracker evidence. It is not part of the citation run sequence. Enter these repair or reapplication lanes only when the user explicitly asks to verify or revisit that historical work.

Historical repair commands:

```bash
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
  --confirm-write=apply-citation-author-repairs \
  --expected-deployment=glad-minnow-656
```

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

The 74 deterministic and 685 independently reviewed author repairs predated that
canonical field, and all 759 repaired canonical references have now received a
provenance-only backfill without changing their authors. Their compact, tracked
batch/per-reference provider lineage and the completed backfill binding are
preserved in `scripts/data/tracked/citation-author-repair-lineage.json`. The
binding records the immutable proposal digest, self-digested approval, completed
audit file SHA-256, and post-apply verification of 759 already applied / 0 pending.
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

The provenance-only lane remains available for repeatable verification and safe
reapplication: an unchanged production corpus plans the same canonical lineage
and the apply preflight classifies it as already applied without changing
authors. The planner is read-only, requires an explicit Convex source and new
exclusive output path, and consumes only the tracked evidence bundle after
validating the manifest. Convex may serialize object keys in a different order;
planner comparison sorts object keys semantically while preserving array order,
matching the apply and server CAS paths. It fails closed unless every slug/reference is unique and its live
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
