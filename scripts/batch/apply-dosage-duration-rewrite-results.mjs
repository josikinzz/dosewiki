#!/usr/bin/env node
/**
 * Apply reviewed dosage/duration note rewrites to the local article artifact
 * and sync the changed articles to Postgres.
 *
 * Inputs:
 * - Rewrite results NDJSON from run-dosage-duration-rewrite-openrouter.mjs
 * - src/data/SubstanceIndex.json
 *
 * Outputs:
 * - Updated src/data/SubstanceIndex.json
 * - Review summary JSON + Markdown in notes-and-plans/exports/openrouter/results/
 * - Optional Postgres sync for changed articles only
 *
 * Usage:
 *   export DATA_ADMIN_KEY="..."
 *   export POSTGRES_POOLED_URL="postgresql://localhost/dosewiki"
 *   node scripts/batch/apply-dosage-duration-rewrite-results.mjs
 *   node scripts/batch/apply-dosage-duration-rewrite-results.mjs --dry-run
 *   node scripts/batch/apply-dosage-duration-rewrite-results.mjs --article=2c-b
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "../analyze/public-prose-artifact-language-core.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

const DEFAULT_RESULTS_PATH = join(
  PROJECT_ROOT,
  "notes-and-plans/exports/openrouter/results/dosage-duration-rewrite-results.ndjson"
);
const DEFAULT_ARTICLES_PATH = join(PROJECT_ROOT, "src/data/SubstanceIndex.json");
const DEFAULT_OUT_DIR = join(PROJECT_ROOT, "notes-and-plans/exports/openrouter/results");
const DEFAULT_BATCH_SIZE = 50;

const GREEK_REPLACEMENTS = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  κ: "kappa",
  μ: "mu",
  σ: "sigma",
  Δ: "Delta",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const writeCommand = createProductionWriteCommand({
    operation: "apply-dosage-duration-rewrites",
    argv: args,
  });
  const options = {
    results: DEFAULT_RESULTS_PATH,
    articles: DEFAULT_ARTICLES_PATH,
    outDir: DEFAULT_OUT_DIR,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: writeCommand.dryRun,
    article: null,
    skipPostgres: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--results=")) {
      options.results = arg.split("=")[1];
    } else if (arg.startsWith("--articles=")) {
      options.articles = arg.split("=")[1];
    } else if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.split("=")[1];
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--article=")) {
      options.article = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-postgres") {
      options.skipPostgres = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { ...options, writeCommand };
}

function printHelp() {
  console.log(`
Apply reviewed dosage/duration rewrites to local articles and Postgres.

Usage:
  node scripts/batch/apply-dosage-duration-rewrite-results.mjs --dry-run

Write ceremony:
  node scripts/batch/apply-dosage-duration-rewrite-results.mjs \
    --write --confirm-write=apply-dosage-duration-rewrites \
    --expected-deployment=localhost/dosewiki \
    --target=postgresql://localhost/dosewiki

Options:
  --results=<path>      Results NDJSON path
  --articles=<path>     SubstanceIndex.json path
  --out-dir=<path>      Output directory for review summaries
  --batch-size=<n>      Postgres sync batch size (default: 50)
  --article=<slug>      Apply only one article
  --dry-run             Do not write or sync, just report
  --write               Enable local and Postgres writes
  --confirm-write=<op>  Confirm apply-dosage-duration-rewrites
  --expected-deployment=<name> Confirm the exact Postgres deployment
  --target=<url>    Explicit Postgres write target (or TARGET_POSTGRES_URL)
  --skip-postgres         Update local artifact only
  --help, -h            Show help
`);
}

function sanitizeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  if (typeof obj !== "object") return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    let sanitizedKey = key;
    for (const [greek, ascii] of Object.entries(GREEK_REPLACEMENTS)) {
      sanitizedKey = sanitizedKey.replaceAll(greek, ascii);
    }
    let asciiKey = "";
    for (let index = 0; index < sanitizedKey.length; index++) {
      const character = sanitizedKey[index];
      asciiKey += character.charCodeAt(0) <= 0x7f ? character : "_";
    }
    sanitizedKey = asciiKey;
    result[sanitizedKey] = sanitizeKeys(value);
  }
  return result;
}

function loadLatestResults(resultsPath) {
  const rows = readFileSync(resultsPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const latestByJobId = new Map();
  for (const row of rows) {
    latestByJobId.set(row.jobId, row);
  }

  return Array.from(latestByJobId.values());
}

function requireAllSuccessful(results) {
  const failed = results.filter((result) => result.status !== "success");
  if (failed.length > 0) {
    throw new Error(`Cannot apply rewrites: ${failed.length} jobs are not successful.`);
  }
}

function groupResultsByArticle(results) {
  const map = new Map();
  for (const result of results) {
    if (!map.has(result.articleSlug)) {
      map.set(result.articleSlug, []);
    }
    map.get(result.articleSlug).push(result);
  }
  return map;
}

function updateByFieldPath(article, fieldPath, rewrittenText) {
  let target = null;

  const dosageRouteMatch = fieldPath.match(/^dosage\.routes\[(.+)\]\.notes$/);
  if (dosageRouteMatch) {
    const route = dosageRouteMatch[1];
    target = article?.dosage?.routes?.find((entry) => entry.route === route);
    if (!target) throw new Error(`Missing dosage route: ${route}`);
    const before = target.notes;
    target.notes = rewrittenText;
    return { before, after: target.notes };
  }

  const durationRouteMatch = fieldPath.match(/^duration\.routes\[(.+)\]\.half_life_notes$/);
  if (durationRouteMatch) {
    const route = durationRouteMatch[1];
    target = article?.duration?.routes?.find((entry) => entry.route === route);
    if (!target) throw new Error(`Missing duration route: ${route}`);
    const before = target.half_life_notes;
    target.half_life_notes = rewrittenText;
    return { before, after: target.half_life_notes };
  }

  if (fieldPath === "dosage.plateau_dosing.notes") {
    if (!article?.dosage?.plateau_dosing) {
      throw new Error("Missing plateau dosing object");
    }
    const before = article.dosage.plateau_dosing.notes;
    article.dosage.plateau_dosing.notes = rewrittenText;
    return { before, after: article.dosage.plateau_dosing.notes };
  }

  throw new Error(`Unsupported field path: ${fieldPath}`);
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function syncToPostgres(changedArticles, batchSize, writeCommand) {
  const credential = requireProductionWriteCredential("editorArticleWrite");
  const client = createDataClient({ target: writeCommand.targetUrl }).client;
  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < changedArticles.length; i += batchSize) {
    const batch = changedArticles.slice(i, i + batchSize).map(sanitizeKeys);
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchCount = Math.ceil(changedArticles.length / batchSize);
    process.stdout.write(`Postgres batch ${batchNum}/${batchCount} (${batch.length} articles)... `);

    const result = await client.mutation(api.substanceIndex.saveSubstances, {
      apiKey: credential.token,
      articles: batch,
    });

    created += result.created;
    updated += result.updated;
    if (result.errors?.length) {
      errors.push(...result.errors);
      console.log(`done (${result.created} created, ${result.updated} updated, ${result.errors.length} errors)`);
    } else {
      console.log(`done (${result.created} created, ${result.updated} updated)`);
    }
  }

  return { created, updated, errors };
}

async function main() {
  const options = parseArgs();
  printProductionWriteCommand(options.writeCommand);
  const results = loadLatestResults(options.results);
  requireAllSuccessful(results);

  const filteredResults = options.article
    ? results.filter((result) => result.articleSlug === options.article)
    : results;

  if (filteredResults.length === 0) {
    throw new Error("No matching successful rewrite results found.");
  }

  const grouped = groupResultsByArticle(filteredResults);
  const articles = JSON.parse(readFileSync(options.articles, "utf8"));
  const articlesBySlug = new Map(articles.map((article) => [article.slug, article]));
  const timestamp = buildTimestamp();

  mkdirSync(options.outDir, { recursive: true });

  const changedArticles = [];
  const changeSummary = [];

  for (const [slug, articleResults] of grouped.entries()) {
    const article = articlesBySlug.get(slug);
    if (!article) {
      throw new Error(`Article not found for slug: ${slug}`);
    }

    const articleChange = {
      slug,
      title: article.title,
      changes: [],
    };

    for (const result of articleResults) {
      const rewrittenText = result?.response?.parsed?.rewrittenText;
      if (typeof rewrittenText !== "string" || rewrittenText.trim().length === 0) {
        throw new Error(`Missing rewrittenText for ${result.jobId}`);
      }

      const applied = updateByFieldPath(article, result.fieldPath, rewrittenText.trim());
      articleChange.changes.push({
        jobId: result.jobId,
        fieldPath: result.fieldPath,
        before: applied.before,
        after: applied.after,
      });
    }

    assertNoPublicProseArtifactLanguage(article, {
      sections: ["dosage", "duration"],
      sourcePath: `batch:dosage_duration_apply:${slug}`,
    });
    assertNoPublicProseNamedSourceAttribution(article, {
      sections: ["dosage", "duration"],
      sourcePath: `batch:dosage_duration_apply:${slug}`,
    });

    changedArticles.push(article);
    changeSummary.push(articleChange);
  }

  const summaryJsonPath = join(
    options.outDir,
    options.article
      ? `dosage-duration-rewrite-apply-${options.article}-summary.json`
      : "dosage-duration-rewrite-apply-summary.json"
  );
  const summaryMdPath = join(
    options.outDir,
    options.article
      ? `dosage-duration-rewrite-apply-${options.article}-summary.md`
      : "dosage-duration-rewrite-apply-summary.md"
  );

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    articlesPath: options.articles,
    resultsPath: options.results,
    articleCount: changedArticles.length,
    rewriteCount: filteredResults.length,
    articleSlugs: changedArticles.map((article) => article.slug),
    changes: changeSummary,
  };

  writeFileSync(summaryJsonPath, JSON.stringify(summaryPayload, null, 2) + "\n");

  const mdLines = [
    "# Dosage/Duration Rewrite Apply Summary",
    "",
    `- Articles changed: ${changedArticles.length}`,
    `- Rewrite items applied: ${filteredResults.length}`,
    "",
    "## Articles",
    "",
  ];

  for (const entry of changeSummary) {
    mdLines.push(`- ${entry.title} (${entry.slug})`);
    for (const change of entry.changes) {
      mdLines.push(`  - ${change.fieldPath}`);
      mdLines.push(`    - Before: ${JSON.stringify(change.before ?? "")}`);
      mdLines.push(`    - After: ${JSON.stringify(change.after ?? "")}`);
    }
  }

  writeFileSync(summaryMdPath, mdLines.join("\n") + "\n");

  if (!options.dryRun) {
    assertProductionWriteAllowed(options.writeCommand);
    const backupPath = join(
      PROJECT_ROOT,
      "src/data/backups",
      `SubstanceIndex.backup.${timestamp}.json`
    );
    if (!existsSync(backupPath)) {
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(options.articles, backupPath);
    }

    writeFileSync(options.articles, JSON.stringify(articles, null, 2) + "\n");
  }

  let postgresResult = null;
  if (!options.dryRun && !options.skipPostgres) {
    postgresResult = await syncToPostgres(
      changedArticles,
      options.batchSize,
      options.writeCommand,
    );
  }

  console.log(JSON.stringify({
    articleCount: changedArticles.length,
    rewriteCount: filteredResults.length,
    localArtifactUpdated: !options.dryRun,
    postgresSynced: !options.dryRun && !options.skipPostgres,
    postgresResult,
    summaryJsonPath,
    summaryMdPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
