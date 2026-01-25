#!/usr/bin/env node
/**
 * Convex Admin CLI
 *
 * Run authenticated mutations against dev or prod Convex.
 *
 * Usage:
 *   node scripts/admin/convex-admin.mjs <function> [args-json] [--prod]
 *
 * Examples:
 *   # Rename author on dev
 *   node scripts/admin/convex-admin.mjs tripReports:renameAuthor '{"oldName":"Foo","newName":"Bar"}'
 *
 *   # Delete trip report on prod
 *   node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"abc123"}' --prod
 *
 *   # Run a query (no auth needed)
 *   node scripts/admin/convex-admin.mjs tripReports:getAll --query
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local manually
function loadEnv() {
  try {
    const envPath = join(__dirname, "../../.env.local");
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        vars[match[1].trim()] = match[2].trim();
      }
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnv();
const DEV_URL = "https://enchanted-echidna-791.convex.cloud";
const PROD_URL = "https://glad-minnow-656.convex.cloud";
const API_KEY = env.CONVEX_ADMIN_KEY || process.env.CONVEX_ADMIN_KEY;

function printUsage() {
  console.log(`
Convex Admin CLI

Usage:
  node scripts/admin/convex-admin.mjs <function> [args-json] [options]

Options:
  --prod     Run against production (default: dev)
  --query    Run as query instead of mutation (no auth needed)
  --help     Show this help

Examples:
  # Rename author on dev
  node scripts/admin/convex-admin.mjs tripReports:renameAuthor '{"oldName":"Foo","newName":"Bar"}'

  # Delete trip report on prod
  node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"abc123"}' --prod

  # Query (no auth)
  node scripts/admin/convex-admin.mjs tripReports:getByAuthor '{"authorName":"Anonymous"}' --query
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const isProd = args.includes("--prod");
  const isQuery = args.includes("--query");
  const functionName = args.find(a => !a.startsWith("--") && !a.startsWith("{"));
  const argsJson = args.find(a => a.startsWith("{"));

  if (!functionName) {
    console.error("Error: Function name required");
    printUsage();
    process.exit(1);
  }

  const url = isProd ? PROD_URL : DEV_URL;
  const client = new ConvexHttpClient(url);

  let parsedArgs = {};
  if (argsJson) {
    try {
      parsedArgs = JSON.parse(argsJson);
    } catch (e) {
      console.error("Error: Invalid JSON args:", e.message);
      process.exit(1);
    }
  }

  // Add API key for mutations
  if (!isQuery && API_KEY) {
    parsedArgs.apiKey = API_KEY;
  }

  console.log(`Running ${isQuery ? "query" : "mutation"}: ${functionName}`);
  console.log(`Environment: ${isProd ? "PROD" : "DEV"} (${url})`);
  console.log(`Args:`, parsedArgs.apiKey ? { ...parsedArgs, apiKey: "[REDACTED]" } : parsedArgs);
  console.log("");

  try {
    const result = isQuery
      ? await client.query(functionName, parsedArgs)
      : await client.mutation(functionName, parsedArgs);

    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
