#!/usr/bin/env node
/**
 * Correct a misspelled artist name on the replication rows that carry it.
 *
 * Seeding a profile called "Ben Ridgway" while every gallery tile underneath it
 * still says "Ben Ridgeway" is half a fix. The name lives on
 * `replications.artist`, and it leaks from there into `credit_line`
 * ("Continuum Infinitum by Ben Ridgeway"), into `rightsholder`, and into the
 * slug, which was built from title plus artist.
 *
 * The corrections themselves are not here. They are the `strong` entries of
 * `src/data/config/contributorIdentityCorrections.json`, where each one carries
 * its evidence, and this script only turns them into a plan.
 *
 * ## What it will and will not do
 *
 * Writes go through `replications.applyProvenanceCorrection`, the existing
 * compare-and-swap: the complete current credit snapshot is sent alongside the
 * update, so a row that has moved since the plan was built fails closed rather
 * than being overwritten from stale data.
 *
 * It does **not** rename slugs. A slug is a public URL and renaming one needs an
 * alias entry in `src/data/config/replicationSlugAliases.json` to keep shared
 * links alive — and one of the affected slugs is already the *target* of an
 * existing alias, which would be left pointing at a 404. So the slug half is
 * reported in full, with the exact redirect entries it would need, and left for
 * a human to run through `scripts/replications/normalize-slugs.mjs`.
 *
 * Dry run (default):
 *   node scripts/replications/plan-artist-name-corrections.mjs
 *
 * Apply:
 *   node scripts/replications/plan-artist-name-corrections.mjs --write \
 *     --confirm-write=correct-replication-artist-names \
 *     --expected-deployment=<fingerprint>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { buildSlugCandidate } from "./normalize-slugs.mjs";

const OPERATION = "correct-replication-artist-names";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORRECTIONS_PATH = path.join(ROOT, "src/data/config/contributorIdentityCorrections.json");
const ALIAS_PATH = path.join(ROOT, "src/data/config/replicationSlugAliases.json");

function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * The `strong` name corrections that say they also apply to the rows.
 *
 * A correction may be right about a display name and still not be something to
 * push onto the stored data — `correctsReplicationArtistField` is how the review
 * says which is which, so this script never widens its own scope.
 */
export function loadArtistNameCorrections(filePath = CORRECTIONS_PATH) {
  const corrections = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return (corrections.nameCorrections ?? []).filter(
    (entry) => entry.strength === "strong" && entry.correctsReplicationArtistField === true,
  );
}

/** Replace the stored name wherever it appears in a free-text credit field. */
export function retextCreditField(value, storedName, correctName) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  const pattern = new RegExp(storedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return value.replace(pattern, correctName);
}

/**
 * One row's correction: the snapshot the mutation must match, the updates, and
 * the slug the row would have if it were built from the corrected name today.
 */
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
    // Required by the validator, and it embeds the name, so it moves too.
    credit_line: creditLine ?? "",
    // Optional in the validator: omitted keys are simply not patched. Passing
    // the current value through keeps the payload complete and self-documenting
    // without changing anything, and a null must be omitted rather than sent.
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
    // A slug that is the candidate plus a `-N` counter is already the
    // collision-resolved form normalize-slugs' resolveTarget produces for a
    // duplicate title — it is settled, not a pending rename that collides.
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
    rows.push(planRowCorrection(row, correction, { existingSlugs }));
  }

  return {
    rows: rows.sort((left, right) => left.slug.localeCompare(right.slug)),
    unmatched,
  };
}

/**
 * What the slug renames would break if they were run without care.
 *
 * `renameSlug` already moves an effect's `gallery_order` with the slug, so that
 * half is safe. The half that is not: an alias whose *target* is one of these
 * slugs keeps pointing at the old value, so an already-shared legacy URL would
 * start 404ing the moment the rename lands.
 */
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

  console.log(`\n  ${plan.rows.length} row(s) carry a misspelled artist name.\n`);

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

  console.log("\n" + "=".repeat(78));
  console.log("= SLUG CONSEQUENCES — reported, never applied by this script.");
  console.log("=".repeat(78));
  console.log(
    "\n  Slugs were derived from title + artist, so correcting the artist changes what the\n" +
      "  derivation produces. These are public URLs; renaming one needs a redirect entry in\n" +
      "  src/data/config/replicationSlugAliases.json, which scripts/replications/normalize-slugs.mjs\n" +
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

  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;

  if (!readUrl) {
    throw new Error(
      "Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL) so the script knows which deployment to read.",
    );
  }

  const corrections = loadArtistNameCorrections();
  const client = new ConvexHttpClient(readUrl);
  const replications = await client.query(api.replications.getAll, {});
  const aliases = JSON.parse(fs.readFileSync(ALIAS_PATH, "utf8"));

  console.log(
    `\nRead ${replications.length} replications. ${corrections.length} strong artist-name correction(s) on file.`,
  );

  const plan = planArtistNameCorrections(replications, corrections);
  const slugPlan = planSlugConsequences(plan.rows, aliases);
  const { collisions } = printPlan(plan, slugPlan);

  if (collisions > 0) {
    throw new Error(`${collisions} corrected slug(s) collide with an existing slug — resolve before renaming.`);
  }

  if (command.dryRun) {
    console.log(
      "\nDry run — no Convex writes performed. Slugs are never renamed by this script in\n" +
        "either mode; run scripts/replications/normalize-slugs.mjs for that, after the names land.",
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = new ConvexHttpClient(command.targetUrl);

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
