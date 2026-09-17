#!/usr/bin/env node
/**
 * Generate a report of all history_culture section headings.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createDataClient } from "./lib/data-client.ts";
import { api } from "../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "./lib/data-pagination.mjs";

function loadEnv() {
  try {
    const envContent = readFileSync(".env.local", "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read .env.local: ${error.message}`);
    }
  }
}

async function main() {
  loadEnv();
  const dataUrl = process.env.POSTGRES_DIRECT_URL || process.env.POSTGRES_POOLED_URL;
  const client = createDataClient({ target: dataUrl }).client;

  console.log("Fetching articles...");
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);

  const headingCounts = {};

  for (const article of articles) {
    if (!article.history_culture?.sections?.length) continue;
    for (const section of article.history_culture.sections) {
      headingCounts[section.heading] = (headingCounts[section.heading] || 0) + 1;
    }
  }

  const sorted = Object.entries(headingCounts).sort((a, b) => b[1] - a[1]);

  let md = "# History & Culture Section Headings\n\n";
  md += "> Generated from Postgres articles database\n\n";
  md += "| Count | Heading |\n";
  md += "|------:|:--------|\n";

  for (const [heading, count] of sorted) {
    md += `| ${count} | ${heading} |\n`;
  }

  md += "\n---\n\n";
  md += `**Total unique headings:** ${sorted.length}\n\n`;
  md += `**Total usages:** ${sorted.reduce((acc, [, c]) => acc + c, 0)}\n\n`;

  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/history-culture-headings.md", md);
  console.log(`Generated report with ${sorted.length} unique headings`);
}

main();
