#!/usr/bin/env node
/**
 * Export articles from Convex to SubstanceIndex.json
 *
 * This script fetches all articles from the Convex database and writes them
 * to src/data/SubstanceIndex.json. Run this before building for production to ensure
 * the static file has the latest data from Convex.
 *
 * Usage:
 *   node scripts/export-convex-to-json.mjs
 *
 * After running:
 *   node scripts/build/buildCompressedArticles.mjs
 *   git add . && git commit -m "Sync articles from Convex" && git push
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../lib/convex-pagination.mjs";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

const runContext = createDataOpsRunContext({
  operation: "export Convex articles to local JSON",
  intent: "local-export",
  sourceUrlKeys: ["SOURCE_CONVEX_URL", "CONVEX_PUBLIC_READ_URL", "VITE_CONVEX_URL", "CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
  targetUrlKeys: [],
  localArtifacts: ["src/data/SubstanceIndex.json"],
});

let convexUrl;
try {
  convexUrl = requireSourceUrl(runContext, "Convex export source URL");
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

async function main() {
  console.log("📥 Exporting articles from Convex to SubstanceIndex.json\n");
  printDataOpsRunContext(runContext);
  console.log("");

  const client = createDataClient({ target: convexUrl }).client;

  // Fetch all articles from Convex
  console.log("Fetching articles from Convex...");
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);

  if (!articles || articles.length === 0) {
    console.error("❌ No articles found in Convex database");
    console.error("   The Convex articles table may be empty.");
    console.error("   Make sure articles have been synced to Convex first.");
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles in Convex\n`);

  // Remove Convex internal fields (_id, _creationTime)
  const cleanedArticles = articles.map(({ _id, _creationTime, ...article }) => article);

  // Sort by id for consistent ordering
  cleanedArticles.sort((a, b) => {
    if (a.id === null && b.id === null) return 0;
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.id - b.id;
  });

  // Write to SubstanceIndex.json
  const outputPath = resolve(process.cwd(), "src/data/SubstanceIndex.json");
  writeFileSync(outputPath, JSON.stringify(cleanedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: outputPath,
    sourceDeployment: "VITE_CONVEX_URL",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articleCount: cleanedArticles.length,
      convexUrlLabel: "VITE_CONVEX_URL",
    },
  });

  console.log(`✅ Exported ${cleanedArticles.length} articles to src/data/SubstanceIndex.json`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
  console.log("\nNext steps:");
  console.log("  1. node scripts/build/buildCompressedArticles.mjs");
  console.log("  2. git add . && git commit -m 'Sync articles from Convex'");
  console.log("  3. git push");
}

main().catch((error) => {
  console.error("❌ Export failed:", error);
  process.exit(1);
});
