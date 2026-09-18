#!/usr/bin/env node
/**
 * Export production Postgres substanceIndex to JSON file.
 */

import { createDataClient } from "./lib/data-client.ts";
import { api } from "../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "./lib/data-pagination.mjs";
import { writeFileSync } from "fs";
import { resolve } from "path";


async function main() {
  const { client, fingerprint } = createDataClient();
  console.log(`Fetching substances from Postgres ${fingerprint}...`);

  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);

  // Strip Postgres internal fields
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
)} MB`);
}

main().catch((error) => {
  console.error("❌ Export failed:", error);
  process.exit(1);
});
