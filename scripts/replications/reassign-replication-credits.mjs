#!/usr/bin/env node
/**
 * Move named replication rows onto the artist who actually made them.
 *
 * This is the row-scoped companion to
 * `scripts/replications/plan-artist-name-corrections.mjs`. That script is keyed
 * by *name*: every row credited "X" becomes "Y", which is the right shape for a
 * spelling fix and the wrong shape for both jobs here.
 *
 *  - **A handle rename with stragglers.** "StingrayZ" is Symmetric Vision's
 *    reddit-era handle (the profile SYMMETRICVISION already answers to the
 *    alias). Most of the corpus moved long ago; six rows were left behind and
 *    the gallery groups on the raw `artist` string, so they surface as a second
 *    six-work artist.
 *  - **A misattribution.** `embedded-geometry-test-pole-loka` is credited Loka
 *    but is Symmetric Vision's work. No name-keyed rule can express that: the
 *    other 42 Loka rows are correctly Loka's.
 *
 * ## What moves, and what deliberately does not
 *
 * `artist` and `credit_line` move together — the credit line embeds the name and
 * is what the tile byline and the permalink page print.
 *
 * `artist_url` moves only where the stored link names the *wrong person*. The
 * misattributed row points at lokavision.com, which must not follow the work to
 * another artist; it is retargeted to the site 191 other Symmetric Vision rows
 * already carry. The renamed rows' old-handle links (gfycat, PsychonautWiki) are
 * the same person's own pages and stay, exactly as they stay on the twenty
 * already-renamed rows that carry them.
 *
 * `rightsholder` stays. It records the identity a work was licensed under, not
 * the display credit, and the thirty-five rows renamed before this run kept
 * "StingrayZ" there. Moving it here would make this run disagree with them.
 *
 * Slugs are never touched: they are public URLs, and renaming one needs a
 * redirect entry in `data/effects/replicationSlugAliases.json` written by
 * `scripts/replications/normalize-slugs.mjs`.
 *
 * Writes go through `replications.applyProvenanceCorrection`, the compare-and-
 * swap that takes the full credit snapshot the plan was built from, so a row
 * that moved underneath the plan fails closed instead of being overwritten.
 *
 * Dry run (default):
 *   node scripts/replications/reassign-replication-credits.mjs
 *
 * Apply:
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *   node scripts/replications/reassign-replication-credits.mjs --write \
 *     --confirm-write=reassign-replication-credits \
 *     --expected-deployment=<host>/<database>
 */
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "reassign-replication-credits";

const SYMMETRIC_VISION = "Symmetric Vision";
const SYMMETRIC_VISION_URL = "https://symmetric-vision.xyz/";

/**
 * The rows to move, each with the credit it must still carry for the move to
 * apply. `from` is a precondition, not a search key: a row already corrected by
 * hand is reported as settled rather than written again, and a row credited to
 * somebody else entirely stops the run.
 */
export const CREDIT_REASSIGNMENTS = Object.freeze([
  {
    slug: "360-degree-acid-snowscape-stingrayz",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "after-images-stingrayz-pepperymedicalafghanhound",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "another-version-of-yourself-stingrayz",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "breathing-sky-stingrayz",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "dmt-closed-eye-visuals-stingrayz-deliriousoptimalcopperhead",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "lucy-the-fairy-stingrayz",
    from: "StingrayZ",
    to: SYMMETRIC_VISION,
    reason: "handle rename: StingrayZ is Symmetric Vision's reddit-era name",
  },
  {
    slug: "embedded-geometry-test-pole-loka",
    from: "Loka",
    to: SYMMETRIC_VISION,
    // The stored link is Loka's own site and must not travel to another artist.
    artistUrl: SYMMETRIC_VISION_URL,
    reason: "misattribution: the work is Symmetric Vision's, not Loka's (site owner, 2026-08-19)",
  },
]);

/** Replace the outgoing name wherever it appears in a free-text credit field. */
export function retextCredit(value, from, to) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  return value.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
}

export function creditSnapshot(row) {
  return {
    title: row.title,
    artist: row.artist,
    artist_url: row.artist_url ?? null,
    credit_line: row.credit_line ?? null,
    source_url: row.source_url ?? null,
    rightsholder: row.rightsholder ?? null,
  };
}

/**
 * One row's move: the snapshot the mutation must match and the fields it sets.
 *
 * `credit_line` is required by the mutation's validator, so a row that never had
 * one gets the corpus's standard "<title> by <artist>" rather than an empty
 * string. Optional fields are passed through unchanged where they exist and
 * omitted where they are null — an omitted key is not patched.
 */
export function planReassignment(row, subject) {
  const expected = creditSnapshot(row);
  const artistUrl = subject.artistUrl ?? expected.artist_url;
  const creditLine =
    retextCredit(expected.credit_line, subject.from, subject.to)
    ?? `${row.title} by ${subject.to}`;

  return {
    id: row._id,
    slug: row.slug,
    reason: subject.reason,
    expected,
    updates: {
      title: row.title,
      artist: subject.to,
      credit_line: creditLine,
      ...(artistUrl === null ? {} : { artist_url: artistUrl }),
      ...(expected.source_url === null ? {} : { source_url: expected.source_url }),
      ...(expected.rightsholder === null ? {} : { rightsholder: expected.rightsholder }),
    },
  };
}

/**
 * Split the subject list against the live corpus: what to write, what is already
 * where it belongs, and what cannot be acted on safely.
 *
 * A subject whose row is missing or credited to a third name is a `blocked`
 * entry rather than a silent skip. Either means the plan was built against data
 * that no longer holds, and the caller stops instead of writing the rest.
 */
export function planCreditReassignments(replications, subjects = CREDIT_REASSIGNMENTS) {
  const bySlug = new Map(replications.map((row) => [row.slug, row]));
  const rows = [];
  const settled = [];
  const blocked = [];

  for (const subject of subjects) {
    const row = bySlug.get(subject.slug);
    if (!row) {
      blocked.push({ slug: subject.slug, why: "no row with this slug" });
      continue;
    }
    if (row.artist === subject.to) {
      settled.push({ slug: subject.slug, artist: row.artist });
      continue;
    }
    if (row.artist !== subject.from) {
      blocked.push({
        slug: subject.slug,
        why: `credited "${row.artist}", expected "${subject.from}"`,
      });
      continue;
    }
    rows.push(planReassignment(row, subject));
  }

  return { rows, settled, blocked };
}

function printPlan(plan) {
  console.log(
    "\n##############################################################################",
  );
  console.log("# REPLICATION CREDIT REASSIGNMENTS");
  console.log(
    "##############################################################################\n",
  );

  for (const row of plan.rows) {
    console.log(`  ${row.slug}`);
    console.log(`    reason       ${row.reason}`);
    console.log(`    artist       "${row.expected.artist}"  ->  "${row.updates.artist}"`);
    console.log(
      `    credit_line  "${row.expected.credit_line}"  ->  "${row.updates.credit_line}"`,
    );
    if ((row.updates.artist_url ?? null) !== row.expected.artist_url) {
      console.log(
        `    artist_url   "${row.expected.artist_url}"  ->  "${row.updates.artist_url}"`,
      );
    }
    console.log(`    rightsholder ${JSON.stringify(row.expected.rightsholder)}  (unchanged)`);
    console.log(`    slug         ${row.slug}  (never renamed here)`);
    console.log("");
  }

  console.log(`  ${plan.rows.length} row(s) to move.`);
  if (plan.settled.length > 0) {
    console.log(`  ${plan.settled.length} row(s) already correct:`);
    for (const entry of plan.settled) console.log(`    ${entry.slug} — "${entry.artist}"`);
  }
  if (plan.blocked.length > 0) {
    console.log(`  ${plan.blocked.length} row(s) BLOCKED:`);
    for (const entry of plan.blocked) console.log(`    ${entry.slug} — ${entry.why}`);
  }
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

  const client = createDataClient({ target: readUrl }).client;
  const replications = await client.query(api.replications.getAll, {});
  console.log(`\nRead ${replications.length} replications.`);

  const plan = planCreditReassignments(replications);
  printPlan(plan);

  if (plan.blocked.length > 0) {
    throw new Error(
      `${plan.blocked.length} subject row(s) do not match the plan — resolve before writing.`,
    );
  }

  if (command.dryRun) {
    console.log("\nDry run — no Postgres writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
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
    console.log(`  reassigned ${row.slug}`);
  }

  console.log(`\nReassigned ${applied} replication row(s). Slugs untouched.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
