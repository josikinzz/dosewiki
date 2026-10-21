#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-replication-slug-aliases";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIAS_FILE = path.join(
  __dirname,
  "../../data/effects/replicationSlugAliases.json",
);

export function resolveAliasTarget(aliases, from) {
  let current = from;
  const seen = new Set([from]);

  while (aliases[current]) {
    current = aliases[current];
    if (seen.has(current)) {
      return null;
    }
    seen.add(current);
  }

  return current === from ? null : current;
}

export function planAliasApplications(aliases, replications) {
  const occurrences = new Map();
  for (const item of replications) {
    occurrences.set(item.slug, (occurrences.get(item.slug) ?? 0) + 1);
  }

  const renames = [];
  const skipped = [];
  const settled = [];

  const sources = new Set(
    Object.keys(aliases).filter((from) => occurrences.has(from)),
  );
  const taken = new Set(
    replications.map((item) => item.slug).filter((slug) => !sources.has(slug)),
  );

  for (const from of Object.keys(aliases).sort()) {
    const live = occurrences.get(from) ?? 0;

    if (live === 0) {
      settled.push(from);
      continue;
    }

    if (live > 1) {
      skipped.push({ from, reason: `slug held by ${live} rows — merge the twins first` });
      continue;
    }

    const target = resolveAliasTarget(aliases, from);

    if (!target) {
      skipped.push({ from, reason: "alias chain is cyclic" });
      continue;
    }

    if (taken.has(target)) {
      skipped.push({ from, reason: `target ${target} is already a live slug` });
      continue;
    }

    taken.add(target);
    renames.push({ from, to: target });
  }

  return { renames, skipped, settled };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL) so the script knows which deployment to read.",
    );
  }

  const aliases = JSON.parse(fs.readFileSync(ALIAS_FILE, "utf8"));
  const client = createDataClient({ target: readUrl }).client;
  const replications = await client.query(api.replications.getAll, {});
  const { renames, skipped, settled } = planAliasApplications(aliases, replications);

  console.log(`\nScanned ${replications.length} replications against ${Object.keys(aliases).length} aliases.`);
  console.log(
    `Unapplied renames: ${renames.length}; skipped: ${skipped.length}; already settled: ${settled.length}\n`,
  );

  for (const rename of renames) {
    console.log(`  ${rename.from}\n    -> ${rename.to}`);
  }
  for (const skip of skipped) {
    console.warn(`  SKIP ${skip.from}: ${skip.reason}`);
  }

  if (command.dryRun) {
    console.log("\nDry run: no writes performed.");
    return;
  }

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  let renamed = 0;
  let galleryOrdersPatched = 0;

  for (const rename of renames) {
    const result = await writeClient.mutation(api.replications.renameSlug, {
      apiKey,
      from: rename.from,
      to: rename.to,
    });
    if (result.renamed) renamed += 1;
    galleryOrdersPatched += result.galleryOrdersPatched ?? 0;
    console.log(`  renamed ${rename.from} -> ${rename.to}`);
  }

  console.log(`\nRenamed ${renamed} replications; patched ${galleryOrdersPatched} gallery_order arrays.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
