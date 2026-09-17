#!/usr/bin/env node
/**
 * Give every credited name in the corpus a profile row.
 *
 * Two hundred and forty-seven replications and one hundred and sixty-four trip
 * reports credit ninety-odd distinct names. Thirteen of them have a profile.
 * The rest are free text: they render as plain strings, they link nowhere, and
 * nothing in the database says who they are. This script closes that gap.
 *
 * ## Everyone on the same terms
 *
 * The owner's ruling: give every credited name "their own profile page like
 * anyone else". So there is no contributor-versus-attribution split here, no
 * special handling for Zdzisław Beksiński or H. R. Giger or Tame Impala, and
 * nothing held back for a later decision. One shape, one set of defaults,
 * everybody.
 *
 * That has a public consequence, because the same table feeds the About page's
 * contributor roster: the roster grows from twelve names to eighty-three, and
 * the third parties are on it. Every run prints the exact before/after and
 * names every profile that newly appears, because that page is what the owner
 * is actually approving when they approve this import.
 *
 * ## The two things that make this delicate
 *
 * **Matching is exact.** `contributorMatchNames` resolves a credit line to a
 * profile by whole normalized name — display name or alias, nothing else. So a
 * spelling that is not literally recorded does not match, and the aliases below
 * are the whole of the join.
 *
 * **The stored spelling is not always the artist's name.** Some of them are
 * corruptions of a real name, and a long tail of stored `artist_url`s are dead,
 * or answer 200 while belonging to somebody else entirely. Those decisions live
 * in a reviewed identity corrections JSON kept outside the repository (it
 * describes real people) and passed in with `--corrections=<path>`, each with
 * its evidence and a strong/weak/needs-owner marker; only `strong` is applied,
 * and the run prints everything else for the owner. Correcting the name here
 * does not correct `replications.artist`; see
 * `scripts/replications/plan-artist-name-corrections.mjs` for that half.
 *
 * **The largest artist in the corpus is already here under another name.**
 * "Symmetric Vision" credits sixty works, 24% of the gallery, and it is
 * StingrayZ, whose profile currently matches zero works. That is an alias
 * addition, never a new profile: a new one would split the biggest artist in
 * the archive in half and leave both halves looking minor.
 *
 * Dry run (default):
 *   node scripts/contributors/seed-credited-identities.mjs --corrections=<path>
 *
 * Apply:
 *   node scripts/contributors/seed-credited-identities.mjs --corrections=<path> --write \
 *     --confirm-write=seed-credited-contributor-profiles \
 *     --expected-deployment=<fingerprint>
 */
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  MAX_PROFILE_LINKS,
  loadIdentityCorrections,
} from "./seed-credited-identities-decisions.mjs";
import {
  buildImportEntries,
  buildSeedPlan,
} from "./seed-credited-identities-plan.mjs";
import { normalizeKey } from "./seed-credited-identities-policy.mjs";
import { previewRosterImpact } from "./seed-credited-identities-roster.mjs";

export * from "./seed-credited-identities-decisions.mjs";
export * from "./seed-credited-identities-plan.mjs";
export * from "./seed-credited-identities-policy.mjs";
export * from "./seed-credited-identities-roster.mjs";

const OPERATION = "seed-credited-contributor-profiles";





/* ---------------------------------------------------------------------------- report */

function printPlan(plan, entries, roster) {
  const creates = entries.filter((entry) => entry.action === "create");
  const updates = entries.filter((entry) => entry.action === "update");
  const unchanged = entries.filter((entry) => entry.action === "unchanged");

  console.log("\n" + "#".repeat(78));
  console.log("# NAME CORRECTIONS — the highest-stakes item. Read this first.");
  console.log("#".repeat(78));
  console.log(
    "\n  These stored spellings are wrong. Each was established from the artist's own\n" +
      "  published property, and in two cases from this repo's own source filenames.\n" +
      "  The profile below is created under the corrected name and answers to both\n" +
      "  spellings, so it matches the corpus before and after the rows are fixed.\n",
  );
  for (const entry of plan.nameCorrectionsApplied) {
    console.log(
      `  ${entry.storedAs}  ->  ${entry.correctedTo}      key ${entry.key}   ` +
        `${entry.works}w/${entry.reports}r`,
    );
    console.log(`    aliases: ${entry.aliases.map((alias) => `"${alias}"`).join(", ")}`);
    console.log(`    ${entry.evidence}`);
    if (entry.correctsReplicationArtistField) {
      console.log(
        "    ALSO ON THE ROWS: replications.artist still says the wrong spelling. This script\n" +
          "    does not touch it. Run scripts/replications/plan-artist-name-corrections.mjs.",
      );
    }
    console.log("");
  }
  if (plan.nameCorrectionsApplied.length === 0) {
    console.log("  (none)\n");
  }

  console.log("\n" + "#".repeat(78));
  console.log("# ROSTER IMPACT — what the public About page becomes.");
  console.log("#".repeat(78));
  console.log(
    `\n  Effect Index contributor roster: ${roster.before.length} names  ->  ${roster.after.length} names` +
      `   (+${roster.added.length})`,
  );
  console.log(
    "  Everyone the import creates appears there, on the same terms as anyone else, under\n" +
      '  the heading "Everyone who has contributed to the archive". That includes the\n' +
      "  third parties whose work the gallery reproduces — they are marked below.\n" +
      "  To veto: narrow `isRosterMember` in src/data/contributorRoster.ts. One function.",
  );

  console.log(`\n  ROSTER TODAY (${roster.before.length}):`);
  for (const [index, entry] of roster.before.entries()) {
    console.log(
      `    ${String(index + 1).padStart(3)}. ${entry.displayName.padEnd(26)} ${entry.referenceCount} page(s)`,
    );
  }

  console.log(`\n  NEWLY ON THE ROSTER (${roster.added.length}), with the position each would take:`);
  for (const entry of roster.added) {
    const flag = entry.notableThirdParty ? "   <-- third party, reproduced work" : "";
    console.log(
      `    ${String(entry.position).padStart(3)}. ${entry.displayName.padEnd(26)} ${entry.referenceCount} page(s)${flag}`,
    );
  }

  if (roster.movedByAlias.length > 0) {
    console.log("\n  EXISTING NAMES WHOSE CREDIT COUNT CHANGES (the alias merges):");
    for (const entry of roster.movedByAlias) {
      console.log(
        `    ${entry.displayName.padEnd(26)} ${entry.wasReferenceCount} -> ${entry.referenceCount} page(s)` +
          `   (now ranked #${roster.after.findIndex((row) => row.key === entry.key) + 1})`,
      );
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`  credited identities needing a profile : ${plan.created.length}`);
  console.log(`  alias additions to existing profiles  : ${plan.aliasAdditions.length}`);
  console.log(`  absence markers left alone            : ${plan.absenceMarkers.length}`);
  console.log(
    `  names already resolving to a profile  : ${plan.alreadyResolved.length}` +
      ` (${plan.alreadyResolved.map((entry) => `${entry.displayName}->${entry.key}`).join(", ")})`,
  );
  console.log(`\n  writes: ${creates.length} create, ${updates.length} update, ${unchanged.length} already correct`);

  console.log("\n=== ALIAS ADDITIONS ===");
  for (const addition of plan.aliasAdditions) {
    const status = addition.alreadyPresent ? "already present" : `adding ${addition.missing.map((a) => `"${a}"`).join(", ")}`;
    console.log(`\n  ${addition.key} (${addition.displayName}) — ${status}`);
    console.log(`    claims ${addition.claims.replications} replication(s), ${addition.claims.reports} report(s)`);
    console.log(`    ${addition.evidence}`);
  }
  for (const warning of plan.aliasWarnings) {
    console.warn(`  WARNING ${warning}`);
  }

  console.log("\n=== NEW PROFILES — one shape, one set of defaults, everybody ===");
  for (const row of plan.created) {
    const flags = [
      row.explicitKey ? "EXPLICIT KEY" : null,
      row.role ? `role="${row.role}"` : null,
      row.links.length > 0 ? `${row.links.length} link(s)` : null,
      row.notableThirdParty ? "third party" : null,
    ].filter(Boolean);
    console.log(
      `  ${row.key.padEnd(22)} "${row.displayName}"  ${row.sources.replications}w/${row.sources.reports}r` +
        (flags.length > 0 ? `  ${flags.join(", ")}` : ""),
    );
  }

  console.log("\n=== LINKS: ADDED, REMOVED, UPGRADED, DROPPED, TRUNCATED ===");
  if (plan.linkNotes.length === 0) {
    console.log("  (none)");
  }
  for (const note of plan.linkNotes) {
    const heading =
      note.storedAs && note.storedAs !== note.displayName
        ? `${note.displayName}   (stored as "${note.storedAs}")`
        : note.displayName;
    console.log(`\n  ${heading}`);
    for (const item of note.added) {
      console.log(`    ADDED    ${item.url}   [${item.verification}]`);
      console.log(`             ${item.evidence}`);
    }
    for (const item of note.removed) {
      console.log(`    REMOVED  ${JSON.stringify(item.url)} (x${item.count}) — ${item.reason}`);
    }
    for (const item of note.upgraded) {
      console.log(`    UPGRADED http -> https  ${item.from}`);
      console.log(`                            evidence: ${item.evidence}`);
    }
    for (const item of note.dropped) {
      console.log(`    DROPPED  ${JSON.stringify(item.url)} (x${item.count}) — ${item.reason}`);
      if (item.suggestedRepair) {
        console.log(`             suggested repair, needs approval: ${item.suggestedRepair}`);
      }
    }
    for (const item of note.truncated) {
      console.log(`    TRUNCATED (over the ${MAX_PROFILE_LINKS}-link cap): ${item.url}`);
    }
  }

  const waybackOnly = plan.linkNotes.flatMap((note) =>
    note.added
      .filter((item) => item.verification === "wayback-only")
      .map((item) => ({ displayName: note.displayName, url: item.url })),
  );
  console.log("\n=== LINKS APPLIED ON ARCHIVE EVIDENCE, NOT A LIVE CHECK ===");
  console.log(
    "  Reddit blocks the researching network end to end, so no reddit.com URL below was\n" +
      "  fetched. Existence rests on a Wayback capture and the attribution rests on Effect\n" +
      "  Index's or Josie's own published pairing. Treat as unverified for liveness.",
  );
  if (waybackOnly.length === 0) {
    console.log("  (none)");
  }
  for (const item of waybackOnly) {
    console.log(`  ${item.displayName.padEnd(22)} ${item.url}`);
  }

  console.log("\n" + "#".repeat(78));
  console.log("# LEFT TO THE OWNER — nothing below is written by this run.");
  console.log("#".repeat(78));
  for (const decision of plan.ownerDecisions) {
    console.log(`\n  ${decision.subject}  [${decision.strength}]`);
    console.log(`    Q: ${decision.question}`);
    for (const candidate of decision.candidates ?? []) {
      console.log(`    - ${candidate.url ?? "(no link at all)"}`);
      if (candidate.note) {
        console.log(`      ${candidate.note}`);
      }
    }
    console.log(`    Why not applied: ${decision.whyNotApplied}`);
  }
  for (const entry of plan.inertNameCorrections) {
    console.log(`\n  NAME (inert, ${entry.strength}) ${entry.stored} -> ${entry.correct}`);
    console.log(`    ${entry.evidence}`);
  }
  for (const entry of plan.inertLinkCorrections) {
    console.log(`\n  LINKS (inert, ${entry.strength}) ${entry.artist}`);
  }

  if (plan.checkedAndFoundWrong.length > 0) {
    console.log("\n=== RESEARCH CLAIMS CHECKED AND FOUND WRONG ===");
    for (const entry of plan.checkedAndFoundWrong) {
      console.log(`\n  CLAIM   ${entry.claim}`);
      console.log(`  FINDING ${entry.finding}`);
    }
  }

  console.log("\n=== ABSENCE MARKERS — NO PROFILE CREATED ===");
  for (const marker of plan.absenceMarkers) {
    console.log(`  "${marker.displayName}"  ${marker.replications} replication(s), ${marker.reports} report(s)`);
  }

  const collisions = plan.collisions;
  const collisionCount =
    collisions.duplicateKeys.length +
    collisions.keyMatchesExistingProfile.length +
    collisions.keyShadowedByAlias.length +
    collisions.aliasClaimsExistingName.length;

  console.log("\n=== COLLISION CHECKS ===");
  console.log(`  duplicate proposed keys            : ${collisions.duplicateKeys.length} ${collisions.duplicateKeys.join(", ")}`);
  console.log(`  proposed key already a profile     : ${collisions.keyMatchesExistingProfile.length} ${collisions.keyMatchesExistingProfile.join(", ")}`);
  console.log(`  proposed key shadowed by an alias  : ${collisions.keyShadowedByAlias.length} ${collisions.keyShadowedByAlias.join(", ")}`);
  console.log(`  proposed alias claims a taken name : ${collisions.aliasClaimsExistingName.length}`);

  console.log("\n=== CORRECTIONS FILE CHECKS ===");
  console.log(`  blocked URL reached a planned link : ${plan.blockedLinks.length}`);
  for (const item of plan.blockedLinks) {
    console.error(`    BLOCKED ${item.displayName}: ${item.url} — ${item.reason}`);
  }
  console.log(`  corrections matching no credit     : ${plan.unmatchedCorrections.length}`);
  for (const item of plan.unmatchedCorrections) {
    console.warn(`    UNMATCHED ${item.kind} for "${item.name}" — nothing in the corpus is credited to it.`);
  }

  if (plan.possibleMerges.length > 0) {
    console.log("\n=== FOR INFORMATION: POSSIBLE DUPLICATES ===");
    console.log("  Given their own profile, like everyone else. renameKey folds one into another");
    console.log("  later if the owner confirms; an alias applied on a hunch would instead credit");
    console.log("  one person's work to another, which is the harder mistake to notice.");
    for (const merge of plan.possibleMerges) {
      console.log(`\n  ${merge.key} "${merge.displayName}"  -> possibly ${merge.candidateKey}`);
      console.log(`    ${merge.evidence}`);
    }
  }

  return { creates, updates, unchanged, collisionCount, blockedCount: plan.blockedLinks.length };
}

/* ------------------------------------------------------------------------------ main */

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  const corrections = loadIdentityCorrections(
    getFlagValue(process.argv.slice(2), "--corrections"),
  );

  // Deliberately not falling back to POSTGRES_POOLED_URL: that variable points at
  // the dev deployment, and a plan built from dev data would describe writes to
  // production that were never checked against production.
  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;

  if (!readUrl) {
    throw new Error(
      "Set TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL) so the script knows which deployment to read.",
    );
  }

  const client = createDataClient({ target: readUrl }).client;
  // `subjectiveEffects` is read only for the roster preview: its `contributors[]`
  // and `audio_replications[].artist` are credit sources the About page counts,
  // so leaving them out would understate where each new name ranks.
  const [replications, reports, profiles, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.tripReports.getAll, {}),
    client.query(api.contributorProfiles.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);

  console.log(
    `\nRead ${replications.length} replications, ${reports.length} trip reports, ` +
      `${profiles.length} profiles, ${effects.length} effects.`,
  );

  const plan = buildSeedPlan({ replications, reports, profiles, corrections });
  const storedByKey = new Map(profiles.map((profile) => [normalizeKey(profile.key), profile]));
  const entries = buildImportEntries(plan, storedByKey);
  const roster = previewRosterImpact({ profiles, plan, effects, replications, reports });
  const { creates, updates, collisionCount, blockedCount } = printPlan(plan, entries, roster);

  if (collisionCount > 0) {
    throw new Error(`${collisionCount} identity collision(s) — resolve them before writing.`);
  }

  // Fails the dry run too. A blocked URL in the plan means the corrections file
  // and the link planner disagree about what may be published, and that is not
  // a thing to discover by reading past it.
  if (blockedCount > 0) {
    throw new Error(
      `${blockedCount} planned link(s) are on the blocked list — a trap or a dead host would be published.`,
    );
  }

  if (command.dryRun) {
    console.log(
      "\nDry run — no Postgres writes performed. The write path re-reads the raw profile rows " +
        "through getForBulkImport and merges against those, so avatars, membership emails and " +
        "createdAt survive the patch.",
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  // The public read materializes rows, which loses avatarStorageId, membershipEmail
  // and createdAt — all of which bulkImport would then clear. Re-plan the merge
  // against the raw rows before writing anything.
  const rawProfiles = await writeClient.query(api.contributorProfiles.getForBulkImport, {
    apiKey,
    keys: entries.map((entry) => entry.entry.key),
  });
  const rawByKey = new Map(rawProfiles.map((profile) => [normalizeKey(profile.key), profile]));
  const finalEntries = buildImportEntries(plan, rawByKey).filter(
    (entry) => entry.action !== "unchanged",
  );

  console.log(`\nWriting ${finalEntries.length} profile row(s)...`);
  const result = await writeClient.mutation(api.contributorProfiles.bulkImport, {
    apiKey,
    profiles: finalEntries.map((entry) => entry.entry),
  });

  console.log(`Created ${result.created}, updated ${result.updated}.`);
  console.log(`(planned: ${creates.length} create, ${updates.length} update)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
