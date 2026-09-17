#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const roots = ["src", "lib", "server", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".mts", ".md"]);
const excludedPrefixes = [
  "scripts/deprecated/",
];
const legacyIdentifierAllowedFiles = new Set([
  "lib/article/normalization.mjs",
  "lib/article/normalization.test.ts",
  "lib/dataSubstanceIngestion.test.ts",
  "lib/public-api/v1.ts",
  "lib/public-api/v1.test.ts",
  "scripts/analyze/check-binding-site-rename.mjs",
  "scripts/batch/pharmacology/lib.mjs",
  "scripts/migrate/migrate-binding-sites.mjs",
  "scripts/migrate/migrate-pharmacology-schema.mjs",
  "src/schema/substanceContract.test.ts",
]);
const legacyUiLabelAllowedFiles = new Set([
  "scripts/analyze/check-binding-site-rename.mjs",
  "src/components/common/ArticleExpandable.test.tsx",
  "src/components/common/ExpandButton.test.tsx",
]);

function extension(path) {
  const match = path.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const repoPath = relative(repoRoot, path);
    if (excludedPrefixes.some((prefix) => repoPath === prefix || repoPath.startsWith(prefix))) {
      continue;
    }
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, files);
    } else if (sourceExtensions.has(extension(path))) {
      files.push(repoPath);
    }
  }
  return files;
}

const failures = [];
for (const root of roots) {
  for (const path of walk(resolve(repoRoot, root))) {
    const content = readFileSync(resolve(repoRoot, path), "utf8");
    if (content.includes("receptor_profile") && !legacyIdentifierAllowedFiles.has(path)) {
      failures.push(`${path}: unintended legacy receptor_profile identifier`);
    }
    if (content.includes("Receptor Affinities") && !legacyUiLabelAllowedFiles.has(path)) {
      failures.push(`${path}: unintended controlled UI label "Receptor Affinities"`);
    }
    if (/binding_sites(?:\[[^\]]+\]|\.\d+)\.receptor\b/.test(content)) {
      failures.push(`${path}: binding_sites rows must use target, not receptor`);
    }
  }
}

const requiredCanonicalSources = [
  ["src/schema/substance/pharmacology.ts", "binding_sites"],
  ["src/schema/substance/pharmacology.ts", "target: z.string()"],
  ["src/data/schema/fieldOverrides/pharmacology.ts", "Binding Sites"],
  ["src/features/article/components/sections/PharmacologySection.tsx", "ariaLabelBase=\"binding sites\""],
];
for (const [path, requiredText] of requiredCanonicalSources) {
  const content = readFileSync(resolve(repoRoot, path), "utf8");
  if (!content.includes(requiredText)) {
    failures.push(`${path}: missing canonical rename marker ${JSON.stringify(requiredText)}`);
  }
}

if (failures.length > 0) {
  console.error("Binding-site rename validation failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Binding-site rename validation passed.");
