# Archived Scripts

This directory is an archive for retired one-off maintenance scripts and superseded migration helpers.

These files are kept for historical reference only. They are not part of the current supported toolchain described in the repo `README.md`, `AGENTS.md`, or [`scripts/README.md`](../README.md).

## Status

- Archived scripts should not be treated as active maintenance targets.
- Archived scripts are fail-closed wrappers only. They must not contain direct writes, Convex clients, network writes, or local artifact mutation code.
- Cleanup metrics may still count them as deprecated files, but active hotspot work should focus on non-archived directories.
- If a script here is ever needed again, recover the historical body from git history, move it back into an active scripts directory, re-verify it against the current schema and Convex workflows, and document that change.

## Inventory

- `apply-manual-harm-proposals.mjs`
  Archived wrapper only; superseded by reviewed article migrations.
- `apply-manual-legality-proposals.mjs`
  Archived wrapper only; superseded by `legality:apply`.
- `batch-extract-harm-quotes.mjs`
  Archived wrapper only; superseded by `batch:extract`.
- `clean-legality-references.mjs`
  Archived wrapper only; superseded by the reviewed legality apply workflow.
- `connect-remaining-effects.mjs`
  Archived wrapper only; superseded by `create-gallery-order.mjs`.
- `connect-replications-to-gallery.mjs`
  Archived wrapper only; superseded by `create-gallery-order.mjs`.
- `convex-import-substance-index.mjs`
  Archived wrapper only; superseded by maintained import workflows.
- `convex-import.mjs`
  Archived wrapper only; the unfinished importer is retired.
- `fix-harm-source-mentions.mjs`
  Archived wrapper only; the historical fixed-record patch is not reusable.
- `fix-replication-urls.mjs`
  Archived wrapper only; the hard-coded repair is retired.
- `import-replications.mjs`
  Archived wrapper only; superseded by replication workspace tooling.
- `merge-history-culture-headings.mjs`
  Archived wrapper only; the historical heading migration has already run.
- `migrate-add-slugs.mjs`
  Archived wrapper only; the historical slug migration is complete.
- `migrate-effectindex-articles.mjs`
  Archived wrapper only; recover and revalidate from history if needed.
- `migrate-harm-potential-schema.mjs`
  Archived wrapper only; superseded by the canonical article contract.
- `migrate-quotes-to-convex.mjs`
  Archived wrapper only; superseded by the maintained quote workflow.
- `migrate-replication-media.mjs`
  Archived wrapper only; superseded by replication workspace tooling.
- `migrate-sources-to-convex.mjs`
  Archived wrapper only; superseded by maintained source import workflows.
- `merge-content-into-notes.mjs`
  Archived wrapper only.
- `normalizePsychoactiveManual.mjs`
  Archived wrapper only.
- `normalizeTagDelimiters.mjs`
  Archived wrapper only.
- `preview-stimulant-card.cjs`
  Archived wrapper only.
- `splitDurationByRoute.mjs`
  Archived wrapper only; historical implementation should be recovered from git history if ever needed again.
- `set-gallery-order.mjs`
  Archived wrapper only; superseded by `create-gallery-order.mjs`.
- `sync-lsd-to-convex.mjs`
  Archived wrapper only; superseded by the reviewed article write workflow.
- `update-gallery-orders.mjs`
  Archived wrapper only; superseded by `create-gallery-order.mjs`.
- `update-2cx.mjs`
  Archived wrapper only.
- `update-amt-mechanism.mjs`
  Archived wrapper only.
- `update-content-appendix.mjs`
  Archived wrapper only.
- `update-dissociatives.mjs`
  Archived wrapper only.
- `update-mescaline.mjs`
  Archived wrapper only.
- `update-psychedelic-amphetamines.mjs`
  Archived wrapper only.
- `update-psychedelics.mjs`
  Archived wrapper only.
- `updateIndexCategory.mjs`
  Archived wrapper only.
