#!/usr/bin/env node
/**
 * Sync just the LSD article to Convex.
 */

import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const ARTICLES_PATH = "./src/data/articles.json";

/**
 * Greek letter replacements for Convex field name compatibility.
 */
const GREEK_REPLACEMENTS = {
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'δ': 'delta',
  'ε': 'epsilon',
  'κ': 'kappa',
  'μ': 'mu',
  'σ': 'sigma',
  'Δ': 'Delta',
};

/**
 * Sanitize object keys to be ASCII-only (Convex requirement).
 */
function sanitizeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    let sanitizedKey = key;
    for (const [greek, ascii] of Object.entries(GREEK_REPLACEMENTS)) {
      sanitizedKey = sanitizedKey.replaceAll(greek, ascii);
    }
    sanitizedKey = sanitizedKey.replace(/[^\x00-\x7F]/g, '_');
    result[sanitizedKey] = sanitizeKeys(value);
  }
  return result;
}

async function main() {
  const convexUrl = process.env.VITE_CONVEX_URL;
  
  if (!convexUrl) {
    console.error("Error: VITE_CONVEX_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Reading articles from:", ARTICLES_PATH);
  
  // Read articles.json
  const articlesJson = readFileSync(ARTICLES_PATH, "utf-8");
  const articles = JSON.parse(articlesJson);
  
  // Find LSD article
  const lsdArticle = articles.find(a => a.title === 'LSD');
  
  if (!lsdArticle) {
    console.error("LSD article not found!");
    process.exit(1);
  }
  
  console.log("Found LSD article (ID:", lsdArticle.id, ")");
  console.log("History & Culture sections:", lsdArticle.history_culture?.sections?.length || 0);
  
  // Check for Notable Individuals subsections
  const notableSection = lsdArticle.history_culture?.sections?.find(s => s.heading === "Notable Individuals");
  if (notableSection) {
    console.log("Notable Individuals subsections:", notableSection.subsections?.length || 0);
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  console.log("\nSaving LSD article to Convex...");

  try {
    const sanitizedArticle = sanitizeKeys(lsdArticle);
    const result = await client.mutation(api.articles.saveArticle, {
      article: sanitizedArticle,
    });

    console.log("Save complete!");
    console.log("  Result:", result);
  } catch (error) {
    console.error("Error saving article:", error);
    process.exit(1);
  }
}

main();
