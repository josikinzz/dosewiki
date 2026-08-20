#!/usr/bin/env bun
/**
 * Emit the saturation and hue appearance axes: the stylesheet the pre-paint
 * bootstrap injects for every reader (the site defaults are values on the
 * same axes), plus the small generated manifest (`appearanceChroma.generated.json`)
 * carrying the stylesheet's content version and the base colourways' authored levels.
 *
 * The version is a content hash: the bootstrap embeds it as `?v=` on the
 * stylesheet URL, so engaged readers cache the file immutably and a palette
 * edit busts that cache by changing the bootstrap text (which the pinned CSP
 * hashes then force through review — see lib/next/cspObservationPolicy.ts).
 *
 *   npm run generate:chroma-css            write both artifacts
 *   npm run generate:chroma-css -- --check  fail if either is stale
 *
 * `chromaStylesheet.test.ts` runs the same comparison in the suite.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import {
  CHROMA_STYLESHEET_PATH,
  buildChromaLevels,
  buildChromaStylesheetCss,
} from "../../src/theme/chromaStylesheet";

export const CHROMA_MANIFEST_PATH = "src/theme/appearanceChroma.generated.json";

const css = buildChromaStylesheetCss();
const manifest = `${JSON.stringify(
  {
    version: createHash("sha256").update(css).digest("hex").slice(0, 8),
    levels: buildChromaLevels(),
  },
  null,
  2,
)}\n`;

const checkOnly = argv.includes("--check");
let stale = false;

for (const [path, next] of [
  [CHROMA_STYLESHEET_PATH, css],
  [CHROMA_MANIFEST_PATH, manifest],
] as const) {
  let current: string | null = null;
  try {
    current = readFileSync(resolve(cwd(), path), "utf8");
  } catch {
    current = null;
  }
  if (current === next) {
    stdout.write(`${path} is up to date.\n`);
    continue;
  }
  stale = true;
  if (checkOnly) {
    stderr.write(`${path} is stale. Run: npm run generate:chroma-css\n`);
  } else {
    writeFileSync(resolve(cwd(), path), next, "utf8");
    stdout.write(`Wrote ${path}.\n`);
  }
}

exit(checkOnly && stale ? 1 : 0);
