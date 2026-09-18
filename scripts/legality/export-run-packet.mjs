#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createDataOpsRunContext,
  getFlagValue,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) {
    throw new Error("--slug=<slug> is required.");
  }
  return slug;
}

function readCoreCountries(repoRoot) {
  const path = resolve(repoRoot, "data/legality/core-countries.md");
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

const argv = process.argv.slice(2);
const slug = requireSlug(argv);
const overwrite = argv.includes("--overwrite");
const runContext = createDataOpsRunContext({
  operation: "export legality research run packet",
  intent: "legality-research",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL"],
  selectedTables: ["substanceIndex"],
  localArtifacts: [resolve("runs", "legality", slug, "packet.json")],
  destructive: false,
});

const sourceUrl = requireSourceUrl(runContext, "Postgres legality article source URL");
const client = createDataClient({ target: sourceUrl }).client;
const article = await client.query(api.substanceIndex.getBySlug, { slug });
if (!article) {
  throw new Error(`No article found for slug: ${slug}`);
}

const countries = article.legality?.countries && typeof article.legality.countries === "object"
  ? article.legality.countries
  : {};
const existingCountries = Object.keys(countries).sort((left, right) => left.localeCompare(right));
const coreCountries = readCoreCountries(runContext.repoRoot);
const existingSet = new Set(existingCountries);
const coreCountriesRemaining = coreCountries.filter((country) => !existingSet.has(country));
const packet = {
  slug,
  exportedAt: new Date().toISOString(),
  names: {
    title: article.title,
    synonyms: Array.isArray(article.identification?.alternative_names)
      ? article.identification.alternative_names
      : [],
  },
  legality: article.legality ?? { international: [], countries: {} },
  existingCountries,
  coreCountriesRemaining,
};
const runDir = resolve(runContext.repoRoot, "runs", "legality", slug);
const outputPath = resolve(runDir, "packet.json");

if (existsSync(outputPath) && !overwrite) {
  throw new Error(`${outputPath} already exists. Pass --overwrite to replace it.`);
}

mkdirSync(runDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Exported ${slug}: ${existingCountries.length} existing country entries, ${coreCountriesRemaining.length} core countries remaining.`);
