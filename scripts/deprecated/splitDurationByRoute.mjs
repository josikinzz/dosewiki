#!/usr/bin/env node
/**
 * Archived script notice.
 *
 * `splitDurationByRoute.mjs` is a frozen historical migration helper and is not
 * part of the supported DoseWiki toolchain anymore.
 *
 * Current replacement path:
 * - use the maintained prepopulation and parser workflows described in
 *   `scripts/README.md`
 * - if you truly need the legacy implementation, inspect
 *   `scripts/deprecated/archive/splitDurationByRoute.legacy-source.mjs`
 *   after restoring it from git history or revalidating the old migration logic
 *   in a scratch environment
 *
 * This wrapper exits immediately so archived code cannot be mistaken for a live
 * maintenance script.
 */

console.error(
  [
    "splitDurationByRoute.mjs is archived and intentionally not executable.",
    "Use the supported parser/prepopulate workflows in scripts/README.md instead.",
    "If you need the historical implementation, recover it from git history and",
    "re-validate it against the current schema before use.",
  ].join(" "),
);

process.exit(1);
