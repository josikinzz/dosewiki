#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

function parseOptions(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    label: getFlagValue(argv, "--label") ?? "pre-citation-rollout",
    outDir: getFlagValue(argv, "--out-dir") ?? "archive/citation-rollout",
  };
}

function printHelp() {
  console.log(`
Archive the current production/public Postgres substance dataset before citation rollout writes.

Usage:
  npm run citations:archive-production-dataset -- --label=pre-2c-b-prod

Environment:
  DATA_BACKEND=postgres is required. Select --source-url / SOURCE_POSTGRES_URL,
  --target / TARGET_POSTGRES_URL, or POSTGRES_POOLED_URL / POSTGRES_DIRECT_URL.

Options:
  --label=<label>      Human-readable archive label (default: pre-citation-rollout)
  --out-dir=<path>     Archive root directory (default: archive/citation-rollout)
  --help, -h           Show this help message
`);
}

function slugifyLabel(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dataset";
}

function stripStorageFields(article) {
  const { _id, _creationTime, ...rest } = article;
  return rest;
}

function sortArticles(articles) {
  return [...articles].sort((left, right) => (
    String(left.slug ?? "").localeCompare(String(right.slug ?? "")) ||
    Number(left.id ?? Number.MAX_SAFE_INTEGER) - Number(right.id ?? Number.MAX_SAFE_INTEGER)
  ));
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

const runContext = createDataOpsRunContext({
  operation: "archive production citation rollout dataset",
  intent: "citation-rollout-archive",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "TARGET_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL"],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  localArtifacts: [options.outDir],
});

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const sourceUrl = requireSourceUrl(runContext, "Postgres dataset archive source URL");
  printDataOpsRunContext(runContext);
  console.log(`Archive label: ${options.label}`);

  const client = createDataClient({ target: sourceUrl }).client;
  const articles = sortArticles((await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage)).map(stripStorageFields));
  if (articles.length === 0) {
    throw new Error("No articles found in the source Postgres database.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = resolve(runContext.repoRoot, options.outDir, `${timestamp}-${slugifyLabel(options.label)}`);
  mkdirSync(archiveDir, { recursive: true });

  const datasetPath = resolve(archiveDir, "SubstanceIndex.json");
  const manifestPath = resolve(archiveDir, "manifest.json");
  const slugsPath = resolve(archiveDir, "slugs.txt");

  const slugs = articles.map((article) => article.slug).filter(Boolean);
  const citedArticleCount = articles.filter((article) => Array.isArray(article.references) && article.references.length > 0).length;

  writeFileSync(datasetPath, `${JSON.stringify(articles, null, 2)}\n`);
  writeFileSync(slugsPath, `${slugs.join("\n")}\n`);
  writeFileSync(manifestPath, `${JSON.stringify({
    archivedAt: new Date().toISOString(),
    label: options.label,
    sourceDeployment: postgresFingerprintFromUrl(sourceUrl),
    articleCount: articles.length,
    citedArticleCount,
    uncitedArticleCount: articles.length - citedArticleCount,
    files: {
      dataset: "SubstanceIndex.json",
      slugs: "slugs.txt",
    },
  }, null, 2)}\n`);

  console.log("");
  console.log(`Archived ${articles.length} articles to ${archiveDir}`);
  console.log(`Articles with structured references: ${citedArticleCount}`);
  console.log(`Articles without structured references: ${articles.length - citedArticleCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
