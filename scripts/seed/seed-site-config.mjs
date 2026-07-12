#!/usr/bin/env node
/**
 * Seed the siteConfig table with existing static About page content.
 *
 * Usage:
 *   VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud node scripts/seed-site-config.mjs
 *
 * For production:
 *   VITE_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/seed-site-config.mjs
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
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
  path.join(__dirname, "../src/data/content/aboutContent.md"),
  "utf-8"
).trim();

const aboutSubtitle = fs.readFileSync(
  path.join(__dirname, "../src/data/content/aboutSubtitle.md"),
  "utf-8"
).trim();

const aboutConfig = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../src/data/content/aboutConfig.json"),
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
  const client = new ConvexHttpClient(command.targetUrl);
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
