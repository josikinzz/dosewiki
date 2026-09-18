#!/usr/bin/env bun
/**
 * Publish the two attribute-gated appearance sheets as static assets: the Pro
 * presentation (`pro-theme.css`, inert without html[data-visual-style="pro"])
 * and the light colour scheme (`theme-light-mode.css`, inert without
 * html[data-theme="light"]). Neither is in the bundled @import chain any more:
 * a dose.wiki reader on the fun+dark defaults downloads neither, and a reader
 * whose saved appearance needs one gets a render-blocking <link> pre-paint —
 * server-rendered when the flavor default already requires the sheet,
 * injected by the theme bootstrap otherwise (`src/theme/index.ts`).
 *
 * The copies are byte-for-byte: the authored files in src/styles/ stay the
 * source of truth (the Theme Lab and the Pro tests read them), and the copies
 * in public/ are what the browser fetches. Each version is a content hash the
 * runtime embeds as `?v=` on the stylesheet URL, so readers cache the files
 * immutably (next.config.ts serves both routes with immutable Cache-Control)
 * and an edit to either sheet busts its cache by changing the URL.
 *
 *   npm run generate:appearance-sheets            write all three artifacts
 *   npm run generate:appearance-sheets -- --check  fail if any is stale
 *
 * `appearanceSheets.test.ts` runs the same comparison in the suite.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";

const APPEARANCE_SHEET_SOURCES = {
  proTheme: "src/styles/pro-theme.css",
  lightMode: "src/styles/theme-light-mode.css",
} as const;

const APPEARANCE_SHEET_COPIES = {
  proTheme: "public/pro-theme.css",
  lightMode: "public/theme-light-mode.css",
} as const;

const APPEARANCE_SHEETS_MANIFEST_PATH = "src/theme/appearanceSheets.generated.json";

function buildAppearanceSheetArtifacts(): { path: string; content: string }[] {
  const versions: Record<string, string> = {};
  const artifacts: { path: string; content: string }[] = [];

  for (const key of Object.keys(APPEARANCE_SHEET_SOURCES) as (keyof typeof APPEARANCE_SHEET_SOURCES)[]) {
    const css = readFileSync(resolve(cwd(), APPEARANCE_SHEET_SOURCES[key]), "utf8");
    versions[key] = createHash("sha256").update(css).digest("hex").slice(0, 8);
    artifacts.push({ path: APPEARANCE_SHEET_COPIES[key], content: css });
  }

  artifacts.push({
    path: APPEARANCE_SHEETS_MANIFEST_PATH,
    content: `${JSON.stringify({ versions }, null, 2)}\n`,
  });

  return artifacts;
}

const checkOnly = argv.includes("--check");
let stale = false;

for (const { path, content } of buildAppearanceSheetArtifacts()) {
  let current: string | null = null;
  try {
    current = readFileSync(resolve(cwd(), path), "utf8");
  } catch {
    current = null;
  }
  if (current === content) {
    stdout.write(`${path} is up to date.\n`);
    continue;
  }
  stale = true;
  if (checkOnly) {
    stderr.write(`${path} is stale. Run: npm run generate:appearance-sheets\n`);
  } else {
    writeFileSync(resolve(cwd(), path), content, "utf8");
    stdout.write(`Wrote ${path}.\n`);
  }
}

exit(checkOnly && stale ? 1 : 0);
