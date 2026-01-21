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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

if (!CONVEX_URL) {
  console.error("Error: VITE_CONVEX_URL or CONVEX_URL environment variable is required");
  console.error("Usage: VITE_CONVEX_URL=https://your-deployment.convex.cloud node scripts/seed-site-config.mjs");
  process.exit(1);
}

console.log(`Connecting to Convex at ${CONVEX_URL}...`);
const client = new ConvexHttpClient(CONVEX_URL);

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

try {
  const result = await client.mutation(api.siteConfig.saveAbout, {
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
