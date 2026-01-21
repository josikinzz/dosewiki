#!/usr/bin/env node
/**
 * Migrate article source files to Convex.
 * 
 * This script reads all article source TypeScript files from src/data/article-sources/
 * and uploads them to the Convex database.
 * 
 * Note: These files are auto-generated and contain large amounts of text content.
 * The migration imports them one at a time due to size constraints.
 * 
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 * 
 * Usage:
 *   node scripts/migrate-sources-to-convex.mjs
 *   node scripts/migrate-sources-to-convex.mjs --dry-run
 *   node scripts/migrate-sources-to-convex.mjs --limit 10   # Only import first 10
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const SOURCES_DIR = "./src/data/article-sources";

/**
 * Parse an article source TypeScript file to extract its data.
 * The files have this structure:
 * 
 * export const substanceName = "Name";
 * export const sources = [...];
 * export const contents: Record<string, string> = { ... };
 */
function parseSourceFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  
  // Extract substanceName
  const nameMatch = content.match(/export const substanceName = "([^"]+)"/);
  if (!nameMatch) {
    throw new Error("Could not find substanceName");
  }
  const substanceName = nameMatch[1];

  // Extract sources array (JSON-like structure on one line)
  const sourcesMatch = content.match(/export const sources = (\[[\s\S]*?\]);/);
  if (!sourcesMatch) {
    throw new Error("Could not find sources array");
  }
  
  // Parse the sources array (it's valid JSON)
  let sources;
  try {
    sources = JSON.parse(sourcesMatch[1]);
  } catch (e) {
    throw new Error(`Failed to parse sources array: ${e.message}`);
  }

  // Extract contents object
  // The contents object starts with "export const contents: Record<string, string> = {"
  // and ends with "};" at the end of the file
  const contentsStart = content.indexOf("export const contents: Record<string, string> = {");
  if (contentsStart === -1) {
    throw new Error("Could not find contents object");
  }
  
  // Parse the contents by extracting each key-value pair
  // Format: "key": `template string content`,
  const contents = {};
  const contentsSection = content.slice(contentsStart);
  
  // Find each key and its template string value
  const keyValueRegex = /"([^"]+)":\s*`/g;
  let match;
  const keys = [];
  
  while ((match = keyValueRegex.exec(contentsSection)) !== null) {
    keys.push({
      key: match[1],
      startIndex: match.index + match[0].length,
    });
  }

  // For each key, find the end of its template string (closing backtick followed by comma or closing brace)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].key;
    const startIndex = keys[i].startIndex;
    
    // Find the closing backtick - need to handle escaped backticks
    let endIndex = startIndex;
    let depth = 0;
    while (endIndex < contentsSection.length) {
      const char = contentsSection[endIndex];
      if (char === '\\' && contentsSection[endIndex + 1] === '`') {
        // Escaped backtick, skip both characters
        endIndex += 2;
        continue;
      }
      if (char === '`') {
        if (depth === 0) {
          break;
        }
      }
      if (char === '$' && contentsSection[endIndex + 1] === '{') {
        depth++;
        endIndex += 2;
        continue;
      }
      if (char === '}' && depth > 0) {
        depth--;
      }
      endIndex++;
    }
    
    const value = contentsSection.slice(startIndex, endIndex);
    // Unescape escaped backticks and dollars
    contents[key] = value
      .replace(/\\`/g, '`')
      .replace(/\\\$/g, '$');
  }

  return {
    substanceName,
    sources,
    contents,
  };
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit"));
  const limit = limitArg ? parseInt(limitArg.split("=")[1] || process.argv[process.argv.indexOf("--limit") + 1], 10) : null;
  
  // Get Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl && !isDryRun) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    console.error("Run 'bunx convex dev' first to set up your Convex project.");
    process.exit(1);
  }

  console.log("Scanning article source files...\n");

  const files = readdirSync(SOURCES_DIR);
  // Filter for .ts files but exclude index.ts and any .d.ts files
  let tsFiles = files.filter((f) => 
    f.endsWith(".ts") && 
    !f.endsWith(".d.ts") && 
    f !== "index.ts" &&
    f !== "prompt.ts"  // Exclude prompt.ts if it exists
  );

  if (limit) {
    tsFiles = tsFiles.slice(0, limit);
    console.log(`Limiting to first ${limit} files.`);
  }

  console.log(`Found ${tsFiles.length} article source files.`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would import the following source files:");
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of tsFiles.slice(0, 20)) {
      const filePath = join(SOURCES_DIR, file);
      const slug = file.replace(".ts", "");
      
      try {
        const data = parseSourceFile(filePath);
        const totalContentSize = Object.values(data.contents).reduce((sum, c) => sum + c.length, 0);
        console.log(`  ${slug}: ${data.substanceName} (${data.sources.length} sources, ${(totalContentSize / 1024).toFixed(1)} KB content)`);
        successCount++;
      } catch (error) {
        console.log(`  ${slug}: ERROR - ${error.message}`);
        errorCount++;
      }
    }
    
    if (tsFiles.length > 20) {
      console.log(`  ... and ${tsFiles.length - 20} more`);
    }
    
    console.log(`\nParse test: ${successCount} successful, ${errorCount} errors`);
    console.log("\nRun without --dry-run to perform the actual import.");
    return;
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  console.log("\nImporting article sources to Convex...");
  console.log("This may take a while due to large file sizes.\n");

  let created = 0;
  let updated = 0;
  let errors = [];

  for (let i = 0; i < tsFiles.length; i++) {
    const file = tsFiles[i];
    const filePath = join(SOURCES_DIR, file);
    const slug = file.replace(".ts", "");

    process.stdout.write(`  [${i + 1}/${tsFiles.length}] ${slug}... `);

    try {
      const data = parseSourceFile(filePath);
      
      const result = await client.mutation(api.articleSources.importOne, {
        slug,
        substanceName: data.substanceName,
        sources: data.sources,
        contents: data.contents,
      });

      if (result.updated) {
        updated++;
        console.log("updated");
      } else {
        created++;
        console.log("created");
      }
    } catch (error) {
      errors.push(`${slug}: ${error.message}`);
      console.log(`error: ${error.message.slice(0, 50)}...`);
    }
  }

  console.log("\nImport complete!");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
    if (errors.length > 10) {
      console.log(`    ... and ${errors.length - 10} more`);
    }
  }
}

main();
