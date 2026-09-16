#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { readFileSync } from "node:fs";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { requireQuoteSection } from "../../lib/quoteSections.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    slug: getFlagValue(argv, "--slug"),
    section: getFlagValue(argv, "--section"),
    file: getFlagValue(argv, "--file"),
    updatedBy: getFlagValue(argv, "--updated-by") ?? "manual-extraction-worker",
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
  return options;
}

function printHelp() {
  console.log(`
Save a reviewed quote markdown document to Postgres.

Usage:
  TARGET_POSTGRES_URL=postgresql://localhost/dosewiki bun scripts/batch/save-quote-doc.mjs \\
    --slug=lsd --section=pharmacology --file=tmp/lsd-pharmacology.md
`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.slug || !options.section || !options.file) {
    throw new Error("--slug, --section, and --file are required");
  }

  const section = requireQuoteSection(options.section).id;
  const content = readFileSync(options.file, "utf8");
  if (!content.trim()) {
    throw new Error(`Quote file is empty: ${options.file}`);
  }

  const context = createDataOpsRunContext({
    operation: "save quote document",
    intent: "quoteMigrationWrite",
    argv: process.argv.slice(2),
    selectedTables: ["quotes"],
    localArtifacts: [options.file],
  });
  const targetUrl = requireTargetUrl(context, "quote save target Postgres URL");

  console.log(`Slug: ${options.slug}`);
  console.log(`Section: ${section}`);
  console.log(`File: ${options.file}`);
  console.log(`Target Postgres: ${postgresFingerprintFromUrl(targetUrl)}`);
  console.log(`Content length: ${content.length.toLocaleString()} chars`);

  if (options.dryRun) {
    console.log("Dry run; not saving.");
    return;
  }

  assertDataOpsWriteAllowed(context);

  const adminKey = requireAdminIntentToken("quoteMigrationWrite").token;

  const client = createDataClient({ target: targetUrl }).client;
  const result = await client.mutation(api.quotes.save, {
    apiKey: adminKey,
    slug: options.slug,
    section,
    content,
    updatedBy: options.updatedBy,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
