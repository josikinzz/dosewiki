#!/usr/bin/env node
/**
 * Migrate EffectIndex articles to Convex.
 * 
 * Imports specific articles from the EffectIndex dump:
 * - Dissociative Intensity Scale
 * - Psychedelic Intensity Scale
 * - DMT substance article
 * - DXM substance article
 * 
 * Usage:
 *   CONVEX_URL=https://your-deployment.convex.cloud node scripts/migrate-effectindex-articles.mjs
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Articles to import by slug
const TARGET_SLUGS = [
  "dissociative-intensity-scale",
  "psychedelic-intensity-scale",
  "dmt",
  "dxm",
];

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error("Error: CONVEX_URL environment variable is required");
    console.error("Usage: CONVEX_URL=https://your-deployment.convex.cloud node scripts/migrate-effectindex-articles.mjs");
    process.exit(1);
  }

  console.log("=== EffectIndex Articles Migration ===\n");

  // Load articles dump
  const articlesPath = resolve(__dirname, "../../EffectIndex-master/effectindex_dump/articles.json");
  let articlesData;
  
  try {
    const raw = readFileSync(articlesPath, "utf-8");
    articlesData = JSON.parse(raw);
    console.log(`Loaded ${articlesData.length} articles from dump`);
  } catch (error) {
    console.error(`Failed to load articles dump from ${articlesPath}:`, error.message);
    process.exit(1);
  }

  // Also check substances dump for DMT/DXM
  const substancesPath = resolve(__dirname, "../../EffectIndex-master/effectindex_dump/substances.json");
  let substancesData = [];
  
  try {
    const raw = readFileSync(substancesPath, "utf-8");
    substancesData = JSON.parse(raw);
    console.log(`Loaded ${substancesData.length} substances from dump`);
  } catch (error) {
    console.warn(`Could not load substances dump: ${error.message}`);
  }

  // Find target articles
  const targetArticles = [];

  for (const slug of TARGET_SLUGS) {
    // Search in articles dump
    let found = articlesData.find((a) => a.slug === slug);
    
    // If not in articles, check substances (DMT/DXM might be there)
    if (!found && substancesData.length > 0) {
      found = substancesData.find((s) => s.url?.toLowerCase() === slug || s.name?.toLowerCase() === slug);
    }

    if (found) {
      console.log(`  Found: ${found.title || found.name} (${slug})`);
      targetArticles.push({ slug, data: found, source: found.title ? "articles" : "substances" });
    } else {
      console.warn(`  Not found: ${slug}`);
    }
  }

  if (targetArticles.length === 0) {
    console.log("\nNo target articles found. Exiting.");
    process.exit(0);
  }

  // Transform articles for import
  const transformedArticles = targetArticles.map(({ slug, data, source }) => {
    if (source === "articles") {
      // Standard article format
      // Note: body_ast can be very large, storing raw only for now
      return {
        slug,
        title: data.title,
        tags: data.tags || [],
        featured: data.featured || false,
        shortDescription: data.short_description || "",
        publicationDate: data.publication_date?.$date || null,
        body_raw: data.body?.raw || "",
        // Skip body_ast for now - too large and can be regenerated from raw
        authors: [], // Would need to resolve author IDs
        citations: (data.citations || []).map((c) => ({
          url: c.url || "",
          text: c.title || c.text || "",
        })),
      };
    } else {
      // Substance article format (DMT/DXM)
      // These have multiple sections that we combine
      const bodyParts = [];
      if (data.description_raw) bodyParts.push(data.description_raw);
      if (data.analysis_raw) bodyParts.push("\n\n## Analysis\n\n" + data.analysis_raw);
      if (data.style_variations_raw) bodyParts.push("\n\n## Style Variations\n\n" + data.style_variations_raw);
      if (data.intensity_scale_raw) bodyParts.push("\n\n## Intensity Scale\n\n" + data.intensity_scale_raw);
      if (data.duration_raw) bodyParts.push("\n\n## Duration\n\n" + data.duration_raw);

      return {
        slug,
        title: data.name || slug.toUpperCase(),
        tags: ["substance", ...(data.tags || [])],
        featured: data.featured || false,
        shortDescription: data.summary || "",
        publicationDate: data.created?.$date || null,
        body_raw: bodyParts.join(""),
        body_ast: null, // Would need to parse all sections
        authors: [],
        citations: (data.citations || []).map((c) => ({
          url: c.url || "",
          text: c.title || c.text || "",
        })),
      };
    }
  });

  console.log(`\nTransformed ${transformedArticles.length} articles for import:`);
  transformedArticles.forEach((a) => {
    console.log(`  - ${a.title} (${a.slug}): ${a.body_raw.length} chars, ${a.tags.join(", ")}`);
  });

  // Import to Convex
  console.log("\nImporting to Convex...");
  const client = new ConvexHttpClient(convexUrl);

  try {
    const result = await client.mutation(api.effectIndexArticles.bulkImport, {
      articles: transformedArticles,
    });

    console.log("\n=== Import Results ===");
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
  } catch (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }

  console.log("\nMigration complete!");
}

main().catch(console.error);
