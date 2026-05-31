/**
 * Clean "== References ==" from legality notes in Convex articles.
 * 
 * Usage:
 *   CONVEX_URL=https://your-deployment.convex.cloud CONVEX_ADMIN_KEY=... node scripts/clean-legality-references.mjs
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
const adminKey = process.env.CONVEX_ADMIN_KEY;

if (!convexUrl) {
  console.error("Error: CONVEX_URL environment variable is required");
  console.error("Usage: CONVEX_URL=https://your-deployment.convex.cloud CONVEX_ADMIN_KEY=... node scripts/clean-legality-references.mjs");
  process.exit(1);
}

if (!adminKey) {
  console.error("Error: CONVEX_ADMIN_KEY environment variable is required");
  console.error("Usage: CONVEX_URL=https://your-deployment.convex.cloud CONVEX_ADMIN_KEY=... node scripts/clean-legality-references.mjs");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

// Fetch all articles
console.log("Fetching articles from Convex...");
const articles = await client.query(api.substanceIndex.getAll, {});
console.log(`Found ${articles.length} articles`);

let cleanedCount = 0;

for (const article of articles) {
  if (!article.legality?.countries) continue;
  
  let modified = false;
  for (const [country, data] of Object.entries(article.legality.countries)) {
    if (data.notes === "== References ==") {
      data.notes = "";
      modified = true;
      console.log(`Cleaning ${article.title} - ${country}`);
    }
  }
  
  if (modified) {
    // Remove the Convex _id and _creationTime before saving
    const { _id, _creationTime, ...articleData } = article;
    await client.mutation(api.substanceIndex.saveSubstance, {
      apiKey: adminKey,
      article: articleData,
    });
    cleanedCount++;
  }
}

console.log(`\nDone! Cleaned ${cleanedCount} articles.`);
