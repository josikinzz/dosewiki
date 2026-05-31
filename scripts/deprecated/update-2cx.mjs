#!/usr/bin/env node
/**
 * Archived script notice.
 *
 * `update-2cx.mjs` is a frozen historical helper and is not part of the
 * supported DoseWiki toolchain anymore.
 */

console.error(
  [
    "update-2cx.mjs is archived and intentionally not executable.",
    "Use the maintained Convex-backed workflows in scripts/README.md instead.",
    "Recover the historical implementation from git history only in a scratch",
    "environment, then re-verify it against the current schema before use.",
  ].join(" "),
);

process.exit(1);
