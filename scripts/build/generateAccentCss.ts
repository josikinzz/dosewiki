#!/usr/bin/env bun
/**
 * Emit the accent axis into the global stylesheet.
 *
 * The accent definitions stay the single source of truth; this only serializes them, so the
 * browser can paint a saved accent from CSS it already has rather than waiting for a runtime
 * to hydrate and inject it.
 *
 *   npm run generate:accent-css            write the stylesheet
 *   npm run generate:accent-css -- --check  fail if it is stale
 *
 * `accents.axis.test.ts` runs the same comparison, so an accent edit without a regenerate fails
 * the test suite rather than shipping a stale palette.
 */
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
