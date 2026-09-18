#!/usr/bin/env node
/**
 * Remove a contributor from all subjective effect articles.
 * Uses the existing update mutation to patch each article.
 * 
 * Usage: node scripts/remove-contributor.mjs "Gabriel"
 */

import { createDataClient } from "./lib/data-client.ts";
import { api } from "../lib/postgres/runtime/api.ts";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "./lib/production-write-command.mjs";

const argv = process.argv.slice(2);
const command = createProductionWriteCommand({ operation: "remove-contributor", argv });

function getFlagValue(name) {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requireReadUrl() {
  const sourceUrl =
    getFlagValue("--source-url") ??
    process.env.SOURCE_POSTGRES_URL ??
    process.env.SOURCE_POSTGRES_URL ??
    command.targetUrl;
  if (!sourceUrl) {
    throw new Error(
      "Provide --source-url or SOURCE_POSTGRES_URL for dry-run; writes require an explicit target.",
    );
  }
  return sourceUrl;
}

async function main() {
  const contributorName = argv.find((entry) => !entry.startsWith("--"));
  
  if (!contributorName) {
    console.error("Usage: node scripts/remove-contributor.mjs <contributor-name>");
    console.error("Example: node scripts/remove-contributor.mjs Gabriel");
    process.exit(1);
  }
  
  const nameToRemove = contributorName.toLowerCase();
  printProductionWriteCommand(command);
  console.log(`Planning removal of contributor "${contributorName}" from all effect articles...`);
  
  const sourceClient = createDataClient({ target: requireReadUrl() }).client;
  
  try {
    // Get all effects
    const allEffects = await sourceClient.query(api.subjectiveEffects.getAll, {});
    console.log(`Found ${allEffects.length} total effect articles`);
    let targetClient = null;
    let writeCredential = null;
    if (!command.dryRun) {
      assertProductionWriteAllowed(command);
      writeCredential = requireProductionWriteCredential("editorArticleWrite");
      targetClient = createDataClient({ target: command.targetUrl }).client;
    }
    
    let updated = 0;
    
    for (const effect of allEffects) {
      if (effect.contributors && effect.contributors.length > 0) {
        const filteredContributors = effect.contributors.filter(
          (c) => c.toLowerCase() !== nameToRemove
        );
        
        if (filteredContributors.length !== effect.contributors.length) {
          console.log(`  Updating: ${effect.name} (removing from ${effect.contributors.length} -> ${filteredContributors.length} contributors)`);
          
          if (!command.dryRun) {
            await targetClient.mutation(api.subjectiveEffects.update, {
              apiKey: writeCredential.token,
              slug: effect.slug,
              updates: {
                contributors: filteredContributors,
              },
            });
          }
          
          updated++;
        }
      }
    }
    
    console.log(
      `\n${command.dryRun ? "Dry run" : "Done"}! ` +
        `${command.dryRun ? "Would update" : "Updated"} ${updated} effect article(s).`,
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
