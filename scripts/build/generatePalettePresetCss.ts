#!/usr/bin/env bun
/**
 * Emit the shipped Palette Lab presets into the global stylesheet.
 *
 * The preset definitions stay the single source of truth; this only serializes
 * them, so the browser can paint a saved palette from CSS it already has rather
 * than waiting for the lab to hydrate and inject it.
 *
 *   npm run generate:palette-css            write the stylesheet
 *   npm run generate:palette-css -- --check  fail if it is stale
 *
 * `presetStylesheet.test.ts` runs the same comparison, so a preset edit without
 * a regenerate fails the test suite rather than shipping a stale palette.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import {
  PRESET_STYLESHEET_PATH,
  buildPresetStylesheetCss,
} from "../../src/features/palette-lab/presetStylesheet";

const target = resolve(cwd(), PRESET_STYLESHEET_PATH);
const next = buildPresetStylesheetCss();
const checkOnly = argv.includes("--check");

let current: string | null = null;
try {
  current = readFileSync(target, "utf8");
} catch {
  current = null;
}

if (current === next) {
  stdout.write(`${PRESET_STYLESHEET_PATH} is up to date.\n`);
  exit(0);
}

if (checkOnly) {
  stderr.write(
    `${PRESET_STYLESHEET_PATH} is stale. Run: npm run generate:palette-css\n`,
  );
  exit(1);
}

writeFileSync(target, next, "utf8");
stdout.write(`Wrote ${PRESET_STYLESHEET_PATH}.\n`);
