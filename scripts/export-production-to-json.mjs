#!/usr/bin/env node
/**
 * Export production Convex substanceIndex to JSON file.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "./lib/convex-pagination.mjs";
import { writeFileSync } from "fs";
import { resolve } from "path";

const PROD_URL = "https://glad-minnow-656.convex.cloud";

async function main() {
  console.log("🔄 Fetching substances from production Convex...");
  console.log(`   URL: ${PROD_URL}\n`);

  const client = new ConvexHttpClient(PROD_URL);

  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);

  // Strip Convex internal fields
  const cleanArticles = articles.map(({ _id, _creationTime, ...doc }) => doc);

  console.log(`✅ Fetched ${cleanArticles.length} substances`);

  // Write to file
  const outputPath = resolve(process.cwd(), "src/data/SubstanceIndex.json");
  writeFileSync(outputPath, JSON.stringify(cleanArticles, null, 2));

  console.log(`\n📁 Written to: ${outputPath}`);
  console.log(`   File size: ${(JSON.stringify(cleanArticles).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error("❌ Export failed:", error);
  process.exit(1);
});
