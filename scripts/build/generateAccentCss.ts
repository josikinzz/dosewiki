#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { ACCENT_STYLESHEET_PATH, buildAccentStylesheetCss } from "../../src/theme/accentStylesheet";

const target = resolve(cwd(), ACCENT_STYLESHEET_PATH);
const next = buildAccentStylesheetCss();
const checkOnly = argv.includes("--check");

let current: string | null = null;
try {
  current = readFileSync(target, "utf8");
} catch {
  current = null;
}

if (current === next) {
  stdout.write(`${ACCENT_STYLESHEET_PATH} is up to date.\n`);
  exit(0);
}

if (checkOnly) {
  stderr.write(`${ACCENT_STYLESHEET_PATH} is stale. Run: npm run generate:accent-css\n`);
  exit(1);
}

writeFileSync(target, next, "utf8");
stdout.write(`Wrote ${ACCENT_STYLESHEET_PATH}.\n`);
