# Citation Production Rollout

Last updated: 2026-07-19

This runbook promotes reviewed citation workbench drafts to the public site without using broad dataset syncs for the initial rollout.

## Method

Use three gates:

1. Archive the current production/public Convex dataset.
2. Promote one reviewed workbench draft to production by slug.
3. Verify the public article, then repeat in small batches for common drugs.

Do not use `convex:sync-production` for the first cited-article rollout. It is table-scoped, not slug-scoped, and is too broad for the first production test.

## Preconditions

- The workbench run is complete and validated in `/Users/josie/.codex/dosewiki-citation-workbench`.
- The workbench run passed validation after article-wide assembly. Section worker launches were verified against the citable section set, the six-section status table is resolved, and missing citable section outputs are acceptable as warnings when the original section is preserved exactly and no unsupported public markers are added.
- The draft has been reviewed: `runs/<slug>/citation-draft.json` and `runs/<slug>/citation-report.md`.
- The remap/proactive scan gate passed before article-wide packet build.
- If accepted section work exists, `article-wide.json` was inspected after size/mtime stabilized and passed `npm run check:worker-output -- --run runs/<slug> --article-wide`; 156-byte stubs, empty `markedSections`/`references`/`evidence`, markers with zero references/evidence, evidence rows missing `status`, marker/evidence mismatches, or returned sections with fewer markers than the accepted article-wide input require repair or rerun before promotion.
- The production Convex deployment has the structured `references` article field and `citationEvidence.applyDraft` function.
- The target environment is explicit. Set `TARGET_CONVEX_URL` for dry-runs and writes, and pass a matching `--expected-deployment`; browser/default Convex URL fallbacks are rejected.
- The citation write token is available as `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE`.
- Stable command policy for archive/apply/formal citation operations is declared in `scripts/lib/citation-command-surface.mjs`.

## Archive Production First

Before the first production citation write, archive the current public dataset:

```bash
export SOURCE_CONVEX_URL="$TARGET_CONVEX_URL"
npm run citations:archive-production-dataset -- --label=pre-2c-b-citation-rollout
```

This writes a dated folder under `archive/citation-rollout/` containing:

- `SubstanceIndex.json`: full production/public article snapshot
- `manifest.json`: source URL, article counts, cited/uncited counts, timestamp
- `slugs.txt`: archived article slug list

Keep this archive until the citation rollout is stable and a later production snapshot supersedes it.

## Promote The Test Drug

Use `2c-b` as the first production canary for a new target environment. If
`2c-b` has already been promoted and smoke-checked for the current target, use
the same gates below for the next explicitly selected slug.

Dry-run against production:

```bash
export TARGET_CONVEX_URL="https://glad-minnow-656.convex.cloud"
npm run citations:apply-workbench -- --slug=2c-b --dry-run \
  --expected-deployment=glad-minnow-656
```

Review the adapted draft summary, marker-only article changes, references, evidence rows, failed section artifacts, and validation status. Public markers should appear only where supported evidence exists.

Also check for the known workbench failure modes before writing: quote fidelity errors, ellipses in `supportingQuote`, discovery-only wiki/community support, public markers without supported evidence, marker path mismatches, evidence rows missing `status`, marker/evidence mismatches, duplicate generic source IDs such as unsuffixed DailyMed labels or generic Health Canada DPD placeholder URLs, section shape changes, empty section outputs marked complete, and partial/empty/marker-losing article-wide outputs over accepted section work. Missing `legality` or another citable section is a warning, not a blocker, when the original section is preserved and no cited output exists.

Write only after the dry-run is clean:

```bash
npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write \
  --confirm-write=apply-citation-workbench-draft \
  --expected-deployment=glad-minnow-656
```

`citations:apply-workbench` is always a shared data-ops operation: dry-run is the review gate, both modes require the same deployment-pinned target, and writes additionally require `--write`, `--confirm-citation-write`, and the shared confirmation phrase. Never apply multiple slugs in one mutation or infer a target from `VITE_CONVEX_URL`.

## Verify Production

After the write:

- Open the production `/substances/2c-b` page.
- Confirm citation markers render only where supported evidence exists.
- Confirm the source/reference section lists the new structured references.
- Confirm the `needs_review` evidence row is visible only in review tooling, not as public article content.
- Check the citation review view for blocking diagnostics before moving to the next drug.

If production output is wrong, stop the rollout. Use the archived `SubstanceIndex.json` as the recovery source of truth for the previous public dataset; do not patch local JSON directly as a live fix.

## Roll Out Common Drugs

After 2C-B is verified, run the homepage `common` drugs locally first. Promote the common-drug set for review, then stop before scaling to other homepage-visible drugs.

1. Run or confirm fresh workbench output for the next common-drug slug.
2. Validate workbench output. Confirm the section status table covers all six
   citable sections; run worker-output checks for existing section files:

```bash
cd /Users/josie/.codex/dosewiki-citation-workbench
npm run check:worker-output -- --run runs/<drug-slug> --section summary
npm run check:worker-output -- --run runs/<drug-slug> --section pharmacology
npm run check:worker-output -- --run runs/<drug-slug> --section tolerance
npm run check:worker-output -- --run runs/<drug-slug> --section harm_potential
npm run check:worker-output -- --run runs/<drug-slug> --section history_culture
npm run check:worker-output -- --run runs/<drug-slug> --section legality
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<drug-slug>
# If remaps are reported, run:
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/remap-section-reference-ids.mjs --run runs/<drug-slug> --write
# Then always run:
node /Users/josie/.codex/dosewiki-citation-workbench/scripts/proactive-scan.mjs --run runs/<drug-slug>
npm run validate -- --run runs/<drug-slug>
npm run validate:patches -- --run runs/<drug-slug>
```

Skip `check:worker-output` commands for missing section files and confirm the
missing section appears as a validation/report warning with the original section
preserved.

3. Dry-run production apply:

```bash
cd "/Users/josie/Documents/Utilities/dose.wiki copy"
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run \
  --expected-deployment=glad-minnow-656
```

4. Review the dry-run diff and report.
5. Write one slug:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> --write --confirm-citation-write \
  --confirm-write=apply-citation-workbench-draft \
  --expected-deployment=glad-minnow-656
```

6. Verify the public page before the next slug.

Batch policy:

- Perfect the 2C-B canary first, even if that means rerunning it multiple times.
- Run common homepage drugs locally and archive outputs.
- Promote common drugs in small reviewed batches, one write operation at a time.
- Stop after the common-drug review stage before continuing to other homepage-visible drugs.

## Boundaries

- Convex remains authoritative for live article data.
- Workbench drafts are not production content until applied through `citations:apply-workbench`.
- Unsupported, weak, or review-only evidence must not create public citation markers.
- The old non-cited dataset is retained as an archive snapshot, not as a runtime fallback.
