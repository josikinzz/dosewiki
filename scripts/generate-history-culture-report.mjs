#!/usr/bin/env node
/**
 * Generate a report of all history_culture section headings.
 */

import { readFileSync, writeFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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
  } catch (e) {}
}

async function main() {
  loadEnv();
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  const client = new ConvexHttpClient(convexUrl);

  console.log("Fetching articles...");
  const articles = await client.query(api.articles.getAll);

  const headingCounts = {};

  for (const article of articles) {
    if (!article.history_culture?.sections?.length) continue;
    for (const section of article.history_culture.sections) {
      headingCounts[section.heading] = (headingCounts[section.heading] || 0) + 1;
    }
  }

  const sorted = Object.entries(headingCounts).sort((a, b) => b[1] - a[1]);

  let md = "# History & Culture Section Headings\n\n";
  md += "> Generated from Convex articles database\n\n";
  md += "| Count | Heading |\n";
  md += "|------:|:--------|\n";

  for (const [heading, count] of sorted) {
    md += `| ${count} | ${heading} |\n`;
  }

  md += "\n---\n\n";
  md += `**Total unique headings:** ${sorted.length}\n\n`;
  md += `**Total usages:** ${sorted.reduce((acc, [, c]) => acc + c, 0)}\n\n`;

  writeFileSync("notes-and-plans/reports/history-culture-headings.md", md);
  console.log(`Generated report with ${sorted.length} unique headings`);
}

main();
