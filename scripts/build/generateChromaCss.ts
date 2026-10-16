#!/usr/bin/env bun
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
