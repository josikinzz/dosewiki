#!/usr/bin/env node

console.error(
  [
    "migrate-harm-potential-schema.mjs is archived and intentionally not executable.",
    "The canonical article contract now owns the current harm-potential shape.",
    "Recover the historical migration from git history only in a scratch environment",
    "and revalidate it against the current schema before any replacement is activated.",
  ].join(" "),
);

process.exit(1);
