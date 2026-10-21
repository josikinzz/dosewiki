#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { buildSlugCandidate } from "./normalize-slugs.mjs";

const OPERATION = "correct-replication-artist-names";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ALIAS_PATH = path.join(ROOT, "data/effects/replicationSlugAliases.json");

function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function loadArtistNameCorrections(filePath, { only = [] } = {}) {
  if (!filePath) {
    throw new Error("Pass --corrections=<path> pointing at the reviewed identity corrections JSON.");
  }
  const corrections = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const strong = (corrections.nameCorrections ?? []).filter(
    (entry) => entry.strength === "strong" && entry.correctsReplicationArtistField === true,
  );
  if (only.length === 0) {
    return strong;
  }

  const wanted = new Set(only.map(normalizeName));
  const missing = only.filter(
    (name) => !strong.some((entry) => normalizeName(entry.stored) === normalizeName(name)),
  );
  if (missing.length > 0) {
    throw new Error(
      `No strong artist-name correction on file for: ${missing.map((name) => JSON.stringify(name)).join(", ")}.`,
    );
  }
  return strong.filter((entry) => wanted.has(normalizeName(entry.stored)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function retextCreditField(value, storedName, correctName) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  const name = escapeRegExp(storedName);
  const pattern = new RegExp(`^${name}$|(?<= by )${name}(?=$|\\.(?:\\s|$))`, "gi");
  return value.replace(pattern, correctName);
}

export function planRowCorrection(row, correction, { existingSlugs = new Set() } = {}) {
  const current = {
    title: row.title,
    artist: row.artist,
    artist_url: row.artist_url ?? null,
    credit_line: row.credit_line ?? null,
    source_url: row.source_url ?? null,
    rightsholder: row.rightsholder ?? null,
  };

  const creditLine = retextCreditField(current.credit_line, correction.stored, correction.correct);
  const rightsholder = retextCreditField(current.rightsholder, correction.stored, correction.correct);

  const updates = {
    title: current.title,
    artist: correction.correct,
    credit_line: creditLine ?? "",
    ...(current.artist_url === null ? {} : { artist_url: current.artist_url }),
    ...(current.source_url === null ? {} : { source_url: current.source_url }),
    ...(rightsholder === null ? {} : { rightsholder }),
  };

  const candidateSlug = buildSlugCandidate({
    slug: row.slug,
    title: row.title,
    artist: correction.correct,
  });

  return {
    id: row._id,
    slug: row.slug,
    title: row.title,
    effectSlug: row.effect_slug,
    expected: current,
    updates,
    changedFields: ["artist", "credit_line", "rightsholder"].filter((field) => {
      const before = field === "artist" ? current.artist : current[field];
      const after = field === "artist" ? updates.artist : (updates[field] ?? null);
      return before !== after;
    }),
    slugConsequence:
      candidateSlug === row.slug || new RegExp(`^${candidateSlug}-\\d+$`).test(row.slug)
        ? { changes: false, slug: row.slug }
        : {
            changes: true,
            from: row.slug,
            to: candidateSlug,
            collides: existingSlugs.has(candidateSlug),
          },
  };
}

export function planArtistNameCorrections(replications, corrections) {
  const byName = new Map(corrections.map((entry) => [normalizeName(entry.stored), entry]));
  const existingSlugs = new Set(replications.map((row) => row.slug));

  const rows = [];
  const settled = [];
  const unmatched = [];

  for (const correction of corrections) {
    const matches = replications.filter(
      (row) => normalizeName(row.artist) === normalizeName(correction.stored),
    );
    if (matches.length === 0) {
      unmatched.push(correction);
    }
  }

  for (const row of replications) {
    const correction = byName.get(normalizeName(row.artist));
    if (!correction) {
      continue;
    }
    const plan = planRowCorrection(row, correction, { existingSlugs });
    if (plan.changedFields.length === 0) {
      settled.push({ slug: row.slug, artist: row.artist });
      continue;
    }
    rows.push(plan);
  }

  return {
    rows: rows.sort((left, right) => left.slug.localeCompare(right.slug)),
    settled: settled.sort((left, right) => left.slug.localeCompare(right.slug)),
    unmatched,
  };
}

export function planSlugConsequences(rows, aliases) {
  const renames = rows.filter((row) => row.slugConsequence.changes).map((row) => row.slugConsequence);
  const renameByFrom = new Map(renames.map((rename) => [rename.from, rename]));

  const newAliases = renames.map((rename) => ({ from: rename.from, to: rename.to }));
  const staleAliases = Object.entries(aliases)
    .filter(([, target]) => renameByFrom.has(target))
    .map(([source, target]) => ({
      source,
      currentTarget: target,
      shouldRetargetTo: renameByFrom.get(target).to,
    }));

  return {
    renames,
    newAliases,
    staleAliases,
    collisions: renames.filter((rename) => rename.collides),
    unchanged: rows.filter((row) => !row.slugConsequence.changes).map((row) => row.slug),
  };
}

function printPlan(plan, slugPlan) {
  console.log("\n" + "#".repeat(78));
  console.log("# REPLICATION ARTIST NAME CORRECTIONS — plan only, nothing is written.");
  console.log("#".repeat(78));

  console.log(`\n  ${plan.rows.length} row(s) carry a stored artist name to correct.\n`);

  for (const row of plan.rows) {
    console.log(`  ${row.slug}   (${row.effectSlug})`);
    console.log(`    title        ${JSON.stringify(row.title)}`);
    console.log(`    artist       ${JSON.stringify(row.expected.artist)}  ->  ${JSON.stringify(row.updates.artist)}`);
    console.log(
      `    credit_line  ${JSON.stringify(row.expected.credit_line)}  ->  ${JSON.stringify(row.updates.credit_line)}`,
    );
    console.log(
      `    rightsholder ${JSON.stringify(row.expected.rightsholder)}  ->  ${JSON.stringify(row.updates.rightsholder ?? null)}`,
    );
    if (row.slugConsequence.changes) {
      console.log(
        `    slug         ${row.slugConsequence.from}  ->  ${row.slugConsequence.to}` +
          (row.slugConsequence.collides ? "   *** COLLIDES WITH AN EXISTING SLUG ***" : "   (NOT renamed here)"),
      );
    } else {
      console.log(`    slug         ${row.slug}   (unaffected)`);
    }
    console.log("");
  }

  for (const correction of plan.unmatched) {
    console.warn(
      `  WARNING correction "${correction.stored}" -> "${correction.correct}" matches no replication row.`,
    );
  }

  if (plan.settled.length > 0) {
    console.log(`  ${plan.settled.length} row(s) already carry the corrected credit and are not written.`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("= SLUG CONSEQUENCES — reported, never applied by this script.");
  console.log("=".repeat(78));
  console.log(
    "\n  Slugs were derived from title + artist, so correcting the artist changes what the\n" +
      "  derivation produces. These are public URLs; renaming one needs a redirect entry in\n" +
      "  data/effects/replicationSlugAliases.json, which scripts/replications/normalize-slugs.mjs\n" +
      "  writes as part of the same run that performs the rename.\n",
  );

  console.log(`  SLUGS THAT WOULD CHANGE (${slugPlan.renames.length}):`);
  for (const rename of slugPlan.renames) {
    console.log(`    ${rename.from}\n      -> ${rename.to}${rename.collides ? "   *** COLLISION ***" : ""}`);
  }

  console.log(`\n  REDIRECTS THAT WOULD BE NEEDED (${slugPlan.newAliases.length}):`);
  for (const alias of slugPlan.newAliases) {
    console.log(`    ${JSON.stringify(alias.from)}: ${JSON.stringify(alias.to)},`);
  }

  console.log(
    `\n  EXISTING ALIASES THAT WOULD BREAK (${slugPlan.staleAliases.length}) — these already point at a slug that moves.`,
  );
  console.log(
    "  The alias map resolves one hop only, so an entry left pointing at the old slug\n" +
      "  sends an already-shared legacy URL to a 404. Each must be retargeted, not just added to.",
  );
  for (const alias of slugPlan.staleAliases) {
    console.log(
      `    ${JSON.stringify(alias.source)}: ${JSON.stringify(alias.currentTarget)}` +
        `  ->  must become ${JSON.stringify(alias.shouldRetargetTo)}`,
    );
  }

  if (slugPlan.unchanged.length > 0) {
    console.log(`\n  SLUGS UNAFFECTED BY THE NAME CHANGE (${slugPlan.unchanged.length}):`);
    for (const slug of slugPlan.unchanged) {
      console.log(`    ${slug}`);
    }
  }

  return { collisions: slugPlan.collisions.length };
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

  const argv = process.argv.slice(2);
  const only = argv
    .filter((arg) => arg.startsWith("--stored="))
    .map((arg) => arg.slice("--stored=".length))
    .filter(Boolean);
  const corrections = loadArtistNameCorrections(getFlagValue(argv, "--corrections"), { only });
  const client = createDataClient({ target: readUrl }).client;
  const replications = await client.query(api.replications.getAll, {});
  const aliases = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"));

  console.log(
    `\nRead ${replications.length} replications. ${corrections.length} strong artist-name correction(s) ${
      only.length > 0 ? `selected by --stored (${only.map((name) => JSON.stringify(name)).join(", ")})` : "on file"
    }.`,
  );

  const plan = planArtistNameCorrections(replications, corrections);
  const slugPlan = planSlugConsequences(plan.rows, aliases);
  const { collisions } = printPlan(plan, slugPlan);

  if (collisions > 0) {
    console.warn(
      `\n  ${collisions} would-be slug rename(s) collide with an existing slug; resolve before running normalize-slugs.`,
    );
  }

  if (command.dryRun) {
    console.log(
      "\nDry run — no Postgres writes performed. Slugs are never renamed by this script in\n" +
        "either mode; run scripts/replications/normalize-slugs.mjs for that, after the names land.",
    );
    return;
  }

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  let applied = 0;
  for (const row of plan.rows) {
    await writeClient.mutation(api.replications.applyProvenanceCorrection, {
      apiKey,
      id: row.id,
      expected: row.expected,
      updates: row.updates,
    });
    applied += 1;
    console.log(`  corrected ${row.slug}`);
  }

  console.log(`\nCorrected ${applied} replication row(s). Slugs untouched.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
