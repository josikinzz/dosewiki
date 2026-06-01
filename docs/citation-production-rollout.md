# Citation Production Rollout

Last updated: 2026-05-31

This runbook promotes reviewed citation workbench drafts to the public site without using broad dataset syncs for the initial rollout.

## Method

Use three gates:

1. Archive the current production/public Convex dataset.
2. Promote one reviewed workbench draft to production by slug.
3. Verify the public article, then repeat in small batches for common drugs.

Do not use `convex:sync-production` for the first cited-article rollout. It is table-scoped, not slug-scoped, and is too broad for the first production test.

## Preconditions

- The workbench run is complete and validated in `/Users/josie/.codex/dosewiki-citation-workbench`.
- The draft has been reviewed: `runs/<slug>/citation-draft.json` and `runs/<slug>/citation-report.md`.
- The production Convex deployment has the structured `references` article field and `citationEvidence.applyDraft` function.
- The target environment is explicit. Set `TARGET_CONVEX_URL` to production for writes.
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

Use `2c-b` as the first production canary because it already has a completed validated run.

Dry-run against production:

```bash
export TARGET_CONVEX_URL="https://<production-convex-deployment>"
npm run citations:apply-workbench -- --slug=2c-b --dry-run
```

Review the adapted draft summary, article changes, references, and evidence rows. The expected current 2C-B shape is 11 supported evidence rows, 1 `needs_review` row, 12 references, and only supported claims rendered publicly.

Write only after the dry-run is clean:

```bash
npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write
```

`citations:apply-workbench` is always a shared data-ops operation: dry-run is the review gate, and writes require both `--write` and `--confirm-citation-write`.

## Verify Production

After the write:

- Open the production `/substances/2c-b` page.
- Confirm citation markers render only where supported evidence exists.
- Confirm the source/reference section lists the new structured references.
- Confirm the `needs_review` evidence row is visible only in review tooling, not as public article content.
- Check the citation review view for blocking diagnostics before moving to the next drug.

If production output is wrong, stop the rollout. Use the archived `SubstanceIndex.json` as the recovery source of truth for the previous public dataset; do not patch local JSON directly as a live fix.

## Roll Out Common Drugs

After 2C-B is verified, promote common drugs in small batches:

1. Run or confirm fresh workbench output for the next common-drug slug.
2. Validate workbench output:

```bash
cd /Users/josie/.codex/dosewiki-citation-workbench
npm run validate -- --run runs/<drug-slug>
npm run validate:patches -- --run runs/<drug-slug>
```

3. Dry-run production apply:

```bash
cd "/Users/josie/Documents/Utilities/dose.wiki copy"
npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run
```

4. Review the dry-run diff and report.
5. Write one slug:

```bash
npm run citations:apply-workbench -- --slug=<drug-slug> --write --confirm-citation-write
```

6. Verify the public page before the next slug.

Batch size policy:

- First batch after 2C-B: 1-3 common drugs, one write at a time.
- Next batch: 5 common drugs only if the first batch has no public rendering or evidence-review regressions.
- Larger batches wait until the adapter has handled multiple claim shapes without manual intervention.

## Boundaries

- Convex remains authoritative for live article data.
- Workbench drafts are not production content until applied through `citations:apply-workbench`.
- Unsupported, weak, or review-only evidence must not create public citation markers.
- The old non-cited dataset is retained as an archive snapshot, not as a runtime fallback.
