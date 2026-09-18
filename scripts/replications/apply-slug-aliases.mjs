#!/usr/bin/env node
/**
 * Apply the committed replication slug-alias plan to a Postgres deployment.
 *
 * `data/effects/replicationSlugAliases.json` records slug renames as
 * old -> new. The middleware 308s the old slug to the new one, and the
 * permalink route only prerenders slugs that exist in the database, so an alias
 * whose rename never landed turns a live permalink into a hard 404 (the row
 * still holds the old slug; the redirect target does not exist).
 *
 * That is exactly the state the corpus was left in: `normalize-slugs.mjs`
 * writes the alias file even on a dry run, and the write pass was never
 * executed. This script closes the gap: for every alias whose source is a
 * live slug, it renames the row to the alias target (resolving multi-hop
 * chains to their final target) via `replications:renameSlug`, which also
 * patches effect `gallery_order` arrays.
 *
 * Dry run (default) prints the plan and writes nothing:
 *   node scripts/replications/apply-slug-aliases.mjs
 * Write mode uses the shared production-write gate:
 *   node scripts/replications/apply-slug-aliases.mjs --write \
 *     --target=postgresql://<host>/<database> \
 *     --confirm-write=apply-replication-slug-aliases \
 *     --expected-deployment=<deployment>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
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

/** Follow old -> new hops to the final target; a cycle returns null. */
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

/**
 * Decide which alias entries can be applied as renames right now.
 *
 * - `renames`: source slug is held by exactly one row and the final target is
 *   free (or freed by this very plan, since the source row moves away).
 * - `skipped`: source held by more than one row (renameSlug would move an
 *   arbitrary twin) or the final target is occupied by a different row.
 * - `settled`: source is not a live slug — the alias is already historical.
 */
export function planAliasApplications(aliases, replications) {
  const occurrences = new Map();
  for (const item of replications) {
    occurrences.set(item.slug, (occurrences.get(item.slug) ?? 0) + 1);
  }

  const renames = [];
  const skipped = [];
  const settled = [];

  // Every slug that stays put; sources being renamed vacate their slot.
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

  assertProductionWriteAllowed(command);
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
