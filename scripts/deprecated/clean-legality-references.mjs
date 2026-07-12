#!/usr/bin/env node

console.error(
  [
    "clean-legality-references.mjs is archived and intentionally not executable.",
    "The historical one-off patch has already served its purpose and bypassed",
    "the reviewed legality workflow. Recover it from git history only in a",
    "scratch environment; use legality:apply for current reviewed changes.",
  ].join(" "),
);

process.exit(1);
