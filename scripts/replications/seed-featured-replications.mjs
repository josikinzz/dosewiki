#!/usr/bin/env node
/**
 * Seed the Effect Index featured carousel from the checked-in JSON list.
 *
 * The carousel used to read `data/effects/effectIndexFeaturedReplications.json`
 * directly, so re-curating it was a code change. It is now a `siteConfig`
 * document the Replication Studio edits, and the JSON survives as the fallback
 * for a deployment that has never been curated. This writes the JSON's contents
 * once, so behaviour is unchanged the moment the storage flips over: the
 * homepage shows the same replications in the same order, from the database.
 *
 * Idempotent and non-destructive: if the document already exists it is reported
 * and left alone, because after the first save the stored selection is an
 * editor's decision and the JSON is only history.
 *
 * Dry run by default. Nothing is written without `--write` plus the standard
 * write confirmations.
 *
 * Usage:
 *   node scripts/replications/seed-featured-replications.mjs
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *     node scripts/replications/seed-featured-replications.mjs --write \
 *       --confirm-write=seed-featured-replications \
 *       --expected-deployment=enchanted-echidna-791
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "seed-featured-replications";
const CONFIG_PATH = "data/effects/effectIndexFeaturedReplications.json";

async function seedFeaturedReplications() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

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

  assertProductionWriteAllowed(command);
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
