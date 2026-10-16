#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

const runContext = createDataOpsRunContext({
  operation: "export Postgres articles to local JSON",
  intent: "local-export",
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
  localArtifacts: ["src/data/SubstanceIndex.json"],
});

let dataUrl;
try {
  dataUrl = requireSourceUrl(runContext, "Postgres export source URL");
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

async function main() {
  console.log("📥 Exporting articles from Postgres to SubstanceIndex.json\n");
  printDataOpsRunContext(runContext);
  console.log("");

  const client = createDataClient({ target: dataUrl }).client;

  console.log("Fetching articles from Postgres...");
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);

  if (!articles || articles.length === 0) {
    console.error("❌ No articles found in Postgres database");
    console.error("   The Postgres articles table may be empty.");
    console.error("   Make sure articles have been synced to Postgres first.");
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles in Postgres\n`);

  const cleanedArticles = articles.map(({ _id, _creationTime, ...article }) => article);

  cleanedArticles.sort((a, b) => {
    if (a.id === null && b.id === null) return 0;
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.id - b.id;
  });

  const outputPath = resolve(process.cwd(), "src/data/SubstanceIndex.json");
  writeFileSync(outputPath, JSON.stringify(cleanedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: outputPath,
    sourceDeployment: "POSTGRES_POOLED_URL",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articleCount: cleanedArticles.length,
      dataUrlLabel: "POSTGRES_POOLED_URL",
    },
  });

  console.log(`✅ Exported ${cleanedArticles.length} articles to src/data/SubstanceIndex.json`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
  console.log("\nNext steps:");
  console.log("  1. git add . && git commit -m 'Sync articles from Postgres'");
  console.log("  2. git push");
}

main().catch((error) => {
  console.error("❌ Export failed:", error);
  process.exit(1);
});
