#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { buildAssetMap } from "./effects/rewrites.mjs";
import { partitionCuratedArticles } from "./articles/curation.mjs";
import { transformArticle } from "./articles/transform.mjs";

const DEFAULT_SOURCE_DIR = resolve(
  import.meta.dirname,
  "../../../..",
  "EffectIndex-master/effectindex_dump",
);
const DEFAULT_ARTICLES_PATH = resolve(DEFAULT_SOURCE_DIR, "articles.json");
const DEFAULT_REPLICATIONS_PATH = resolve(DEFAULT_SOURCE_DIR, "replications.json");
const CONFIRMATION_FLAG = "--confirm-article-import";
const EXPECTED_ARTICLE_COUNT = 19;

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse ${label} at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function printSkippedTable(skipped) {
  if (skipped.length === 0) return;
  console.log(`\nSkipped by curation (${skipped.length}):`);
  console.log("slug | reason");
  console.log("--- | ---");
  for (const { slug, reason } of skipped) {
    console.log(`${slug} | ${reason}`);
  }
}

function printStatusTable(results) {
  console.log(`\nPer-article transform status (${results.length} ported):`);
  console.log("slug | publication_status | transform | issues");
  console.log("--- | --- | --- | ---");
  for (const { article, issues, notes = [] } of results) {
    console.log(
      `${article.slug} | ${article.publication_status} | ${
        issues.length === 0 ? "ok" : "issues"
      } | ${[...issues, ...notes].length === 0 ? "none" : [...issues, ...notes].join("; ")}`,
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const writeRequested = argv.includes("--write");
  const explicitDryRun = argv.includes("--dry-run");
  const confirmed = argv.includes(CONFIRMATION_FLAG);
  const positionalArgs = argv.filter((arg) => !arg.startsWith("--"));
  const articlesPath = resolve(positionalArgs[0] ?? DEFAULT_ARTICLES_PATH);
  const replicationsPath = resolve(
    positionalArgs[1] ?? DEFAULT_REPLICATIONS_PATH,
  );
  const runContext = createDataOpsRunContext({
    operation: "migrate Effect Index articles",
    intent: "dev-data-import",
    argv: writeRequested ? argv : [...argv, "--dry-run"],
    sourceUrlKeys: [],
    localArtifacts: [articlesPath, replicationsPath],
    confirmationFlag: CONFIRMATION_FLAG,
    destructive: true,
  });

  if (writeRequested && explicitDryRun) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  if (writeRequested && !confirmed) {
    throw new Error(
      `Live article imports require both --write and ${CONFIRMATION_FLAG}.`,
    );
  }
  if (confirmed && !writeRequested) {
    throw new Error(`${CONFIRMATION_FLAG} only has effect together with --write.`);
  }
  if (!existsSync(articlesPath)) {
    throw new Error(`Articles file not found: ${articlesPath}`);
  }

  const rawArticles = readJson(articlesPath, "articles file");
  if (!Array.isArray(rawArticles)) {
    throw new Error("Articles source must be a JSON array.");
  }
  if (rawArticles.length !== EXPECTED_ARTICLE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_ARTICLE_COUNT} articles, found ${rawArticles.length}.`,
    );
  }

  // Only curated slugs are imported, and their publication status comes from the
  // curation list rather than the dump. Throws on any dump/list drift.
  const { ported, skipped } = partitionCuratedArticles(rawArticles);

  const assetMap = existsSync(replicationsPath)
    ? buildAssetMap(readJson(replicationsPath, "replications file"))
    : new Map();
  const results = ported.map((article) => transformArticle(article, assetMap));
  const transformedArticles = results.map(({ article }) => article);

  const publishedCount = transformedArticles.filter(
    ({ publication_status }) => publication_status === "published",
  ).length;
  const unlistedCount = transformedArticles.filter(
    ({ publication_status }) => publication_status === "unlisted",
  ).length;
  const issueCount = results.filter(({ issues }) => issues.length > 0).length;

  console.log(`Effect Index articles source: ${articlesPath}`);
  printDataOpsRunContext(runContext);
  console.log(
    `Mode: ${
      writeRequested ? "LIVE WRITE REQUESTED" : "DRY RUN ONLY — no Postgres writes performed"
    }`,
  );
  console.log(
    `Curation: ${transformedArticles.length} ported, ${skipped.length} skipped (of ${rawArticles.length} in the dump)`,
  );
  console.log(
    `Publication status: ${publishedCount} published, ${unlistedCount} unlisted`,
  );
  console.log(`Asset mappings loaded: ${assetMap.size}`);
  printSkippedTable(skipped);
  printStatusTable(results);

  if (issueCount > 0) {
    throw new Error(
      `${issueCount} article transform(s) reported issues; refusing to continue.`,
    );
  }

  if (!writeRequested) {
    console.log(
      `\nDry run complete. Re-run with --write ${CONFIRMATION_FLAG} to persist.`,
    );
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const target = {
    key: runContext.targetUrlKey,
    url: requireTargetUrl(runContext),
  };
  const adminKey = requireAdminIntentToken("legacyAdmin").token;
  const client = createDataClient({ target: target.url }).client;
  const result = await client.mutation(api.effectIndexArticles.bulkImport, {
    apiKey: adminKey,
    articles: transformedArticles,
  });

  console.log(
    `\nArticle import complete via ${target.key}. Created: ${result.created}, updated: ${result.updated}, errors: ${result.errors.length}`,
  );
  if (result.errors.length > 0) {
    for (const error of result.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
