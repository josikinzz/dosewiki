#!/usr/bin/env node
/**
 * Give the gallery's marker credits real contributor profiles.
 *
 * The replications gallery groups by credit line, and three of those groups are
 * not people: works credited to a collective ("various artists"), to a
 * generator ("midjourney"), or to someone who asked not to be named
 * ("Anonymous", plus one row spelled "Anomymous"). They rendered as plain-text
 * headings with no page behind them, which also meant their sections could not
 * be ordered — curation lives on `contributorProfiles.replicationOrder` and
 * there was no row to store it on.
 *
 * This seeds one profile per marker so those sections are curatable like anyone
 * else's, from the same Contributors tab, through the same mutation.
 *
 * WHAT IS DELIBERATELY NOT SEEDED
 * -------------------------------
 * The gallery's *unattributed* bucket. On the dev deployment it holds the rows
 * credited "Unknown" (15) and "unknown" (1) — a marker that names nothing, not
 * a byline. A profile there could not honestly claim anything, its page would
 * be a portfolio of works nobody claims, and `hasKnownCreator` already renders
 * those rows as "Creator unknown" everywhere else. "Anonymous" is a different
 * thing and is seeded: it is a byline an author chose, and the gallery already
 * groups it under its own heading rather than in the unattributed bucket.
 *
 * Idempotent and non-destructive: a key that already exists is reported and
 * skipped, never patched, so an editor's bio, aliases or curated ordering
 * survive a re-run.
 *
 * Dry run by default. Nothing is written without `--write` plus the standard
 * write confirmations.
 *
 * Usage:
 *   node scripts/contributors/seed-marker-contributor-profiles.mjs
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *     node scripts/contributors/seed-marker-contributor-profiles.mjs --write \
 *       --confirm-write=seed-marker-contributor-profiles \
 *       --expected-deployment=enchanted-echidna-791
 */

import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "seed-marker-contributor-profiles";

/**
 * One entry per marker credit. `aliases` are the stored spellings the profile
 * answers to — including "anomymous", the one misspelled row, so its heading
 * links to the same page instead of stranding a group of one.
 */
const MARKER_PROFILES = [
  {
    key: "VARIOUS-ARTISTS",
    displayName: "Various Artists",
    aliases: ["various artists"],
    role: "Collective credit",
    bio:
      "A marker credit, not a person. Works filed here come from more than one " +
      "artist and were archived without a per-work attribution.",
  },
  {
    key: "MIDJOURNEY",
    displayName: "Midjourney",
    aliases: ["midjourney"],
    role: "Generative model",
    bio:
      "A marker credit, not a person. Works filed here were generated with " +
      "Midjourney rather than drawn, painted, or filmed by a contributor.",
  },
  {
    key: "ANONYMOUS",
    displayName: "Anonymous",
    aliases: ["anonymous", "anomymous"],
    role: "Anonymous contributors",
    bio:
      "A marker credit, not a person. Works filed here were shared by their " +
      "creators without a name attached. This is distinct from the gallery's " +
      "unattributed section, which holds works whose creator is unknown.",
  },
];

const MARKER_NAMES = new Set(
  MARKER_PROFILES.flatMap((profile) => [profile.displayName, ...profile.aliases]).map((name) =>
    name.trim().toLowerCase(),
  ),
);

/** The credits the gallery folds into its unattributed bucket, for the report. */
function isUnattributedCredit(artist) {
  const value = typeof artist === "string" ? artist.trim().toLowerCase() : "";
  return value === "" || value === "unknown";
}

async function seedMarkerProfiles() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "No Postgres URL to read from. Set TARGET_POSTGRES_URL (or POSTGRES_POOLED_URL for a dry run).",
    );
  }

  const client = createDataClient({ target: readUrl }).client;

  const [replications, existingKeys] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.contributorProfiles.getKeys, {}),
  ]);

  const creditCounts = new Map();
  let unattributed = 0;
  for (const row of replications) {
    if (isUnattributedCredit(row.artist)) {
      unattributed += 1;
      continue;
    }
    const normalized = row.artist.trim().toLowerCase();
    if (MARKER_NAMES.has(normalized)) {
      creditCounts.set(normalized, (creditCounts.get(normalized) ?? 0) + 1);
    }
  }

  const present = new Set(existingKeys);
  const missing = MARKER_PROFILES.filter((profile) => !present.has(profile.key));

  console.log(`\nReading from: ${postgresFingerprintFromUrl(readUrl)}`);
  console.log(`Replication rows: ${replications.length}`);
  console.log(`Rows in the unattributed bucket (never seeded): ${unattributed}`);
  for (const profile of MARKER_PROFILES) {
    // The display name normalizes to one of the aliases for most markers, so
    // the names are de-duplicated before counting or the row count doubles.
    const names = new Set(
      [profile.displayName, ...profile.aliases].map((name) => name.trim().toLowerCase()),
    );
    const counted = [...names].reduce((total, name) => total + (creditCounts.get(name) ?? 0), 0);
    const state = present.has(profile.key) ? "already exists — skipped" : "to create";
    console.log(`  · ${profile.key} (${counted} credited rows): ${state}`);
  }

  if (missing.length === 0) {
    console.log("\nEvery marker profile already exists. Nothing to do.");
    return;
  }

  if (command.dryRun) {
    console.log(`\nDry run; ${missing.length} profile(s) would be created.`);
    return;
  }

  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("profileMediaWrite");

  const result = await client.mutation(api.contributorProfiles.bulkImport, {
    apiKey: credential.token,
    profiles: missing.map((profile) => ({
      key: profile.key,
      displayName: profile.displayName,
      aliases: profile.aliases,
      bio: profile.bio,
      role: profile.role,
      links: [],
      updatedBy: "seed-marker-contributor-profiles@dosewiki.internal",
    })),
  });

  console.log("\nSeed complete.");
  console.log(`  Created: ${result.created}`);
  console.log(`  Updated: ${result.updated}`);

  if (result.updated > 0) {
    console.log(
      "  ! An existing profile was patched. That should be impossible here — " +
        "only absent keys are sent. Check the profile before trusting it.",
    );
    process.exitCode = 1;
  }
}

seedMarkerProfiles().catch((error) => {
  console.error(`\nFailed to seed marker contributor profiles: ${error.message}`);
  process.exit(1);
});
