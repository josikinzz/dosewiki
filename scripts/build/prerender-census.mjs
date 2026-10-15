#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_LOCALES } from "../../src/i18n/localeRegistry.mjs";
import localeNames from "../../src/i18n/translationLocaleNames.json" with { type: "json" };
import { resolveBuildDirectory } from "./build-surface.mjs";
import {
  BUILD_TIMING_FILE,
  buildRouteFamilies,
  censusFromManifest,
  formatCensus,
} from "./prerender-census.lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function main() {
  const argument = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const buildDirectory = argument ?? resolveBuildDirectory(process.env);
  const absolute = path.resolve(REPO_ROOT, buildDirectory);
  const manifestPath = path.join(absolute, "prerender-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `[census] No prerender manifest at ${manifestPath}. ` +
        "Point the census at a finished build directory (.next, .next-editor, or DOSEWIKI_BUILD_DIR).",
    );
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const timingPath = path.join(absolute, BUILD_TIMING_FILE);
  const timing = existsSync(timingPath) ? JSON.parse(readFileSync(timingPath, "utf8")) : null;
  const census = censusFromManifest(manifest, buildRouteFamilies(PUBLIC_LOCALES, localeNames));
  console.log(formatCensus({ buildDirectory, census, timing }));
  return 0;
}

process.exit(main());
