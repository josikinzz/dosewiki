#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "seed-featured-replications";
const CONFIG_PATH = "data/effects/effectIndexFeaturedReplications.json";

async function seedFeaturedReplications() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "No Postgres URL to read from. Set TARGET_POSTGRES_URL (or POSTGRES_POOLED_URL for a dry run).",
    );
  }

  const config = JSON.parse(
    await readFile(path.join(command.repoRoot, CONFIG_PATH), "utf8"),
  );
  const slugs = Array.isArray(config.slugs) ? config.slugs : [];
  if (slugs.length === 0) {
    throw new Error(`${CONFIG_PATH} lists no slugs; seeding it would blank the carousel.`);
  }

  const client = createDataClient({ target: readUrl }).client;

  const [stored, replications] = await Promise.all([
    client.query(api.siteConfig.getFeaturedReplications, {}),
    client.query(api.replications.getAll, {}),
  ]);

  const known = new Set(replications.map((row) => row.slug));
  const resolvable = slugs.filter((slug) => known.has(slug));
  const missing = slugs.filter((slug) => !known.has(slug));

  console.log(`\nReading from: ${postgresFingerprintFromUrl(readUrl)}`);
  console.log(`Checked-in slugs: ${slugs.length}`);
  console.log(`Resolving against this deployment: ${resolvable.length}`);
  if (missing.length > 0) {
    console.log(`Not on this deployment (the mutation prunes these): ${missing.join(", ")}`);
  }

  if (stored) {
    console.log(
      `\nA featured selection is already stored (${stored.slugs.length} slugs, updated ${stored.updatedAt}).`,
    );
    console.log("Leaving it alone — after the first save it is an editor's decision.");
    return;
  }

  if (command.dryRun) {
    console.log(`\nDry run; ${resolvable.length} slug(s) would be stored.`);
    return;
  }

  const credential = requireProductionWriteCredential("editorArticleWrite");

  const result = await client.mutation(api.siteConfig.saveFeaturedReplications, {
    apiKey: credential.token,
    slugs,
    updatedBy: "seed-featured-replications@dosewiki.internal",
  });

  console.log("\nSeed complete.");
  console.log(`  Stored:  ${result.slugs.length}`);
  console.log(`  Pruned:  ${result.pruned.length}${result.pruned.length ? ` (${result.pruned.join(", ")})` : ""}`);
}

seedFeaturedReplications().catch((error) => {
  console.error(`\nFailed to seed the featured replications: ${error.message}`);
  process.exit(1);
});
