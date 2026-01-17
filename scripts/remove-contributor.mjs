#!/usr/bin/env node
/**
 * Remove a contributor from all subjective effect articles.
 * Uses the existing update mutation to patch each article.
 * 
 * Usage: node scripts/remove-contributor.mjs "Gabriel"
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://enchanted-echidna-791.convex.cloud";

async function main() {
  const contributorName = process.argv[2];
  
  if (!contributorName) {
    console.error("Usage: node scripts/remove-contributor.mjs <contributor-name>");
    console.error("Example: node scripts/remove-contributor.mjs Gabriel");
    process.exit(1);
  }
  
  const nameToRemove = contributorName.toLowerCase();
  console.log(`Removing contributor "${contributorName}" from all effect articles...`);
  console.log(`Using Convex URL: ${CONVEX_URL}`);
  
  const client = new ConvexHttpClient(CONVEX_URL);
  
  try {
    // Get all effects
    const allEffects = await client.query(api.subjectiveEffects.getAll, {});
    console.log(`Found ${allEffects.length} total effect articles`);
    
    let updated = 0;
    
    for (const effect of allEffects) {
      if (effect.contributors && effect.contributors.length > 0) {
        const filteredContributors = effect.contributors.filter(
          (c) => c.toLowerCase() !== nameToRemove
        );
        
        if (filteredContributors.length !== effect.contributors.length) {
          console.log(`  Updating: ${effect.name} (removing from ${effect.contributors.length} -> ${filteredContributors.length} contributors)`);
          
          await client.mutation(api.subjectiveEffects.update, {
            slug: effect.slug,
            updates: {
              contributors: filteredContributors,
            },
          });
          
          updated++;
        }
      }
    }
    
    console.log(`\nDone! Updated ${updated} effect article(s).`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
