# Archived Scripts

This directory is an archive for retired one-off maintenance scripts and superseded migration helpers.

These files are kept for historical reference only. They are not part of the current supported toolchain described in the repo `README.md`, `AGENTS.md`, or [`scripts/README.md`](../README.md).

## Status

- Archived scripts should not be treated as active maintenance targets.
- Archived scripts are fail-closed wrappers only. They must not contain direct writes, Convex clients, network writes, or local artifact mutation code.
- Cleanup metrics may still count them as deprecated files, but active hotspot work should focus on non-archived directories.
- If a script here is ever needed again, recover the historical body from git history, move it back into an active scripts directory, re-verify it against the current schema and Convex workflows, and document that change.

## Inventory

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
