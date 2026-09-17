#!/usr/bin/env node
/**
 * Seed the siteConfig table with existing static About page content.
 *
 * Usage (dry run by default):
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki node scripts/seed/seed-site-config.mjs
 *
 * Write: add --write --confirm-write=seed-site-config --expected-deployment=<fingerprint>.
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const command = createProductionWriteCommand({ operation: "seed-site-config" });
printProductionWriteCommand(command);

// Read the static content files
const aboutMarkdown = fs.readFileSync(
  path.join(__dirname, "../../content/about/about.md"),
  "utf-8"
).trim();

const aboutSubtitle = fs.readFileSync(
  path.join(__dirname, "../../content/about/subtitle.md"),
  "utf-8"
).trim();

const aboutConfig = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../content/about/config.json"),
    "utf-8"
  )
);

const founderProfileKeys = aboutConfig.founderProfileKeys || [];

console.log("\nAbout content to seed:");
console.log(`  Markdown: ${aboutMarkdown.length} characters`);
console.log(`  Subtitle: ${aboutSubtitle}`);
console.log(`  Founders: ${founderProfileKeys.join(", ") || "(none)"}`);

if (command.dryRun) {
  console.log("\nDry run; site configuration was not written.");
  process.exit(0);
}

try {
  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("editorArticleWrite");
  const client = createDataClient({ target: command.targetUrl }).client;
  const result = await client.mutation(api.siteConfig.saveAbout, {
    apiKey: credential.token,
    aboutMarkdown,
    aboutSubtitle,
    founderProfileKeys,
    updatedBy: "seed-script",
  });

  console.log("\nSeed complete!");
  console.log(`  Result: ${result.updated ? "Updated existing" : "Created new"} document`);
} catch (error) {
  console.error("\nFailed to seed siteConfig:", error.message);
  process.exit(1);
}
