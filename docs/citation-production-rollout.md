# Citation Production Rollout

Last updated: 2026-08-31

This runbook promotes reviewed citation drafts to production one slug at a time. Verify public output on `https://dose.wiki/` and authenticated citation diagnostics on `https://dev.dose.wiki/`.

## Method

Use three gates:

1. Archive `glad-minnow-656`.
2. Dry-run and write one reviewed draft by slug.
3. Verify the public root-slug route before selecting another slug.

Use the slug-scoped citation apply path. `convex:sync-production` is table-scoped and is not an acceptable substitute.

## Preconditions

- The selected Pi or explicitly requested external Claude run is complete and validated in `/Users/josie/.codex/dosewiki-citation-workbench`.
- `runs/<slug>/citation-draft.json` and `runs/<slug>/citation-report.md` have been reviewed.
- The run's section checks, reconciliation gates, article-wide artifact check, assembly, `validate`, and `validate:patches` passed. Missing citable sections remain warnings only when the original section is preserved exactly and no unsupported public marker is added.
- If accepted section work exists, article-wide output is non-empty and satisfies the artifact contract. A 156-byte stub, empty `markedSections`/`references`/`evidence`, markers with zero references/evidence, evidence without `status`, marker/evidence mismatches, or fewer returned markers than accepted input requires repair before promotion.
- The production Convex deployment has the structured `references` article field and `citationEvidence.applyDraft` function.
- The target environment is explicit. Set `TARGET_CONVEX_URL` for dry-runs and writes, and pass a matching `--expected-deployment`; browser/default Convex URL fallbacks are rejected.
- The citation write token is available as `CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE`.
- Stable command policy for archive/apply/formal citation operations is declared in `scripts/lib/citation-command-surface.mjs`.

- Run all repository commands below from the DoseWiki repository root.

## Archive production first

Before a new promotion campaign, archive `glad-minnow-656` from the repository root:

```bash
SOURCE_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:archive-production-dataset -- --label=pre-citation-rollout
```

This writes a dated folder under `archive/citation-rollout/` containing:

- `SubstanceIndex.json`: full production/public article snapshot
- `manifest.json`: source URL, article counts, cited/uncited counts, timestamp
- `slugs.txt`: archived article slug list

Keep this archive until the citation rollout is stable and a later production snapshot supersedes it.

## Promote one reviewed slug

`2c-b` is the completed historical production canary. Apply the same gates to the next explicitly selected `<drug-slug>`; do not rerun 2C-B merely because it was the original canary.

Dry-run against production from the repository root:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> --dry-run \
  --expected-deployment=glad-minnow-656
```

Review the adapted draft summary, marker-only article changes, references, evidence rows, failed section artifacts, and validation status. Public markers should appear only where supported evidence exists.

Also check for the known workbench failure modes before writing: quote fidelity errors, ellipses in `supportingQuote`, discovery-only wiki/community support, public markers without supported evidence, marker path mismatches, evidence rows missing `status`, marker/evidence mismatches, duplicate generic source IDs such as unsuffixed DailyMed labels or generic Health Canada DPD placeholder URLs, section shape changes, empty section outputs marked complete, and partial/empty/marker-losing article-wide outputs over accepted section work. Missing `legality` or another citable section is a warning, not a blocker, when the original section is preserved and no cited output exists.

Write only after the dry-run is clean:

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run citations:apply-workbench -- --slug=<drug-slug> \
  --write --confirm-citation-write \
  --confirm-write=apply-citation-workbench-draft \
  --expected-deployment=glad-minnow-656
```

`citations:apply-workbench` is always a shared data-ops operation: dry-run is the review gate, both modes require the same deployment-pinned target, and writes additionally require `--write`, `--confirm-citation-write`, and the shared confirmation phrase. Never apply multiple slugs in one mutation or infer a target from `VITE_CONVEX_URL`.

## Verify production

After the write:

- Open `https://dose.wiki/<drug-slug>`. Substance articles use the root-slug route, not `/substances/<drug-slug>`.
- Confirm citation markers render only where supported evidence exists.
- Confirm the source/reference section lists the new structured references.
- Confirm `needs_review` evidence appears only in `https://dev.dose.wiki/dev/citation-review/<drug-slug>`, not in public article content.
- Resolve every blocking citation diagnostic before selecting another slug.

Use `dose.wiki` for public rollout verification. Use `dev.dose.wiki` only for authenticated review diagnostics.

If the output is wrong, stop the rollout. Use the archived `SubstanceIndex.json` as the recovery source of truth for the previous production dataset; do not patch local JSON as a live fix.

Completion criterion: the write and post-write read target `glad-minnow-656`, the public root-slug article renders the reviewed markers and references, review tooling has no blocking diagnostics, and the next slug remains untouched.

## Roll out common drugs

The historical 2C-B canary already meets the completion criterion. Repeat the same gates only for an explicitly selected homepage `common` slug:

1. Complete and review the fresh run under [Citation Workbench Agent Notes](agents/citation-workbench.md).
2. Dry-run the production apply from the repository root with `TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud` and `--expected-deployment=glad-minnow-656`.
3. Review the full diff and report.
4. Write one slug with the same production target and confirmation flags.
5. Verify `https://dose.wiki/<drug-slug>` and its `https://dev.dose.wiki/dev/citation-review/<drug-slug>` diagnostics before selecting another slug.

Run common drugs locally and archive their outputs. Promote them in small reviewed batches, one write operation at a time. Stop after the common-drug review stage until the user explicitly selects another homepage-visible drug.

## Boundaries

- Convex remains authoritative for live article data.
- Workbench drafts are not production content until applied through `citations:apply-workbench`.
- Unsupported, weak, or review-only evidence must not create public citation markers.
- The old non-cited dataset is retained as an archive snapshot, not as a runtime fallback.
