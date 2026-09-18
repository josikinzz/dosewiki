#!/usr/bin/env node
/**
 * Seed the `copyBlocks` table from the checked-in copy defaults.
 *
 * The defaults in `content/copy-blocks/copyBlocks.json` are the strings the public
 * pages hardcoded before the copy CMS existed. Seeding copies them into Postgres
 * so the /dev Copy Studio has something to edit; the same JSON stays the
 * fallback the server read helper uses when a key has no row, so a deployment
 * that is never seeded renders identically.
 *
 * Dry run by default. Nothing is written without `--write` plus the standard
 * production-write confirmations.
 *
 * Usage:
 *   node scripts/seed/seed-copy-blocks.mjs
 *   node scripts/seed/seed-copy-blocks.mjs --key=home-hero-tagline
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *     node scripts/seed/seed-copy-blocks.mjs --write \
 *       --confirm-write=seed-copy-blocks \
 *       --expected-deployment=<deployment>
 *
 * `--overwrite` is required to touch keys that already hold a row; without it
 * an existing block is left alone, so re-running the seed never clobbers copy
 * an editor changed in the Copy Studio.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = path.join(__dirname, "../../content/copy-blocks/copyBlocks.json");

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VALID_KINDS = new Set(["markdown", "plain", "list"]);

function getFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function loadDefaults() {
  if (!fs.existsSync(DEFAULTS_PATH)) {
    throw new Error(`Copy defaults not found at ${DEFAULTS_PATH}`);
  }

  const parsed = JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf-8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Copy defaults must be a JSON array of copy block definitions.");
  }

  const seen = new Set();
  return parsed.map((block, index) => {
    const where = `copy block #${index + 1}`;
    if (!block || typeof block !== "object") {
      throw new Error(`${where} is not an object.`);
    }
    if (typeof block.key !== "string" || !KEY_PATTERN.test(block.key)) {
      throw new Error(`${where} needs a lower-case kebab-case key.`);
    }
    if (seen.has(block.key)) {
      throw new Error(`Duplicate copy block key "${block.key}".`);
    }
    seen.add(block.key);
    if (!VALID_KINDS.has(block.kind)) {
      throw new Error(`${where} ("${block.key}") has an unknown kind "${block.kind}".`);
    }
    if (typeof block.label !== "string" || !block.label.trim()) {
      throw new Error(`Copy block "${block.key}" needs a label.`);
    }
    if (typeof block.group !== "string" || !block.group.trim()) {
      throw new Error(`Copy block "${block.key}" needs a group.`);
    }

    const payload = {
      key: block.key,
      kind: block.kind,
      label: block.label,
      group: block.group,
    };
    if (typeof block.flavor === "string" && block.flavor.trim()) {
      payload.flavor = block.flavor.trim();
    }
    if (block.kind === "list") {
      if (!Array.isArray(block.items) || block.items.some((item) => typeof item !== "string")) {
        throw new Error(`Copy block "${block.key}" is a list and needs string items.`);
      }
      payload.items = block.items;
    } else {
      if (typeof block.body !== "string" || !block.body.trim()) {
        throw new Error(`Copy block "${block.key}" needs a non-empty body.`);
      }
      payload.body = block.body;
    }

    return payload;
  });
}

function describe(block) {
  const size =
    block.kind === "list"
      ? `${block.items.length} item${block.items.length === 1 ? "" : "s"}`
      : `${block.body.length} character${block.body.length === 1 ? "" : "s"}`;
  const flavor = block.flavor ? ` [${block.flavor}]` : "";
  return `  ${block.key}${flavor} — ${block.group} / ${block.label} (${block.kind}, ${size})`;
}

async function seedCopyBlocks() {
  const command = createProductionWriteCommand({ operation: "seed-copy-blocks" });
  printProductionWriteCommand(command);

  const onlyKey = getFlag("key");
  const overwrite = hasFlag("overwrite");

  let blocks = loadDefaults();
  if (onlyKey) {
    blocks = blocks.filter((block) => block.key === onlyKey);
    if (blocks.length === 0) {
      console.error(`\nNo copy block matches --key=${onlyKey}.`);
      process.exit(1);
    }
  }

  console.log(`\nCopy blocks to seed (${blocks.length}):`);
  blocks.forEach((block) => console.log(describe(block)));
  console.log(`\nExisting rows: ${overwrite ? "overwritten" : "left untouched"} (--overwrite).`);

  if (command.dryRun) {
    console.log("\nDry run; no copy block was written.");
    return;
  }

  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("editorArticleWrite");
  const client = createDataClient({ target: command.targetUrl }).client;

  const existingKeys = new Set(
    (await client.query(api.copyBlocks.getAll, {})).map((row) => row.key),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const block of blocks) {
    if (existingKeys.has(block.key) && !overwrite) {
      skipped += 1;
      console.log(`  = ${block.key} (already present; --overwrite to replace)`);
      continue;
    }

    const result = await client.mutation(api.copyBlocks.upsert, {
      ...block,
      apiKey: credential.token,
      updatedBy: "seed-copy-blocks",
    });

    if (result.updated) {
      updated += 1;
      console.log(`  ↻ ${block.key}`);
    } else {
      created += 1;
      console.log(`  + ${block.key}`);
    }
  }

  console.log("\nSeed complete.");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
}

seedCopyBlocks().catch((error) => {
  console.error("\nFailed to seed copy blocks:", error.message);
  process.exit(1);
});
