#!/usr/bin/env node
/**
 * Repair Loka's attribution (DW-12, PRD W10b).
 *
 * Owner confirmation 2026-08-14: Loka = LokaVision, and her website is
 * https://lokavision.com/ (verified live). This settles the "Loka" entry in
 * src/data/config/contributorIdentityCorrections.json ownerDecisions, which
 * had held the repair back pending exactly this confirmation.
 *
 * Three repairs, all idempotent — a second run plans nothing:
 *  1. The LOKA contributor profile gets
 *     `links: [{ label: "lokavision.com", url: "https://lokavision.com/" }]`.
 *     Refused if the stored profile already carries a different link list.
 *  2. Every replication credited to Loka gets
 *     `artist_url: "https://lokavision.com/"`. Three rows carry the schemeless
 *     `reddit.com/u/wheressuede`, which `toExternalArtistUrl` silently drops,
 *     so the gallery heading has never linked out; the rest carry nothing.
 *  3. Residual `rightsholder: "Wheressuede"` / `"wheressuede"` strings
 *     normalize to "Loka".
 *
 * Row writes go through `replications.applyProvenanceCorrection`, which
 * compares the complete current credit snapshot before patching, so a row
 * edited since this plan was printed fails closed. The profile write re-reads
 * the raw row through `getForBulkImport` and merges, so avatars, membership
 * email and createdAt survive the patch.
 *
 * Dry run (default):
 *   node scripts/contributors/repair-loka-attribution.mjs
 *
 * Dry run against an explicit deployment (read-only, works for prod):
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *     node scripts/contributors/repair-loka-attribution.mjs
 *
 * Apply (prod):
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *     node scripts/contributors/repair-loka-attribution.mjs --write \
 *     --confirm-write=repair-loka-attribution \
 *     --expected-deployment=glad-minnow-656
 *   (needs CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE and
 *    CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE, or the legacy CONVEX_ADMIN_KEY,
 *    valid for that deployment)
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "repair-loka-attribution";

export const PROFILE_KEY = "LOKA";
export const WEBSITE_URL = "https://lokavision.com/";
export const PROFILE_LINKS = Object.freeze([
  { label: "lokavision.com", url: WEBSITE_URL },
]);

/** The one stored artist_url value this script is allowed to replace. */
const LEGACY_ARTIST_URL = "reddit.com/u/wheressuede";
const LEGACY_RIGHTSHOLDER = "wheressuede";
const CORRECT_RIGHTSHOLDER = "Loka";

const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** Scheme and trailing slash are not identity, same as the identity seed. */
const urlIdentity = (value) =>
  normalize(value).replace(/^https?:\/\//, "").replace(/\/+$/, "");

const LEGACY_URL_IDENTITY = urlIdentity(LEGACY_ARTIST_URL);
const WEBSITE_URL_IDENTITY = urlIdentity(WEBSITE_URL);

/**
 * What to do about the LOKA profile row.
 *
 * A stored link list this script did not plan is a human decision, so anything
 * other than "empty" or "already lokavision.com" is a conflict, not an
 * overwrite.
 */
export function planProfileRepair(profile) {
  if (!profile) {
    return { action: "missing" };
  }

  const links = profile.links ?? [];
  if (links.some((link) => urlIdentity(link?.url) === WEBSITE_URL_IDENTITY)) {
    return { action: "unchanged", links };
  }
  if (links.length > 0) {
    return {
      action: "conflict",
      reason: `profile ${PROFILE_KEY} already carries links this script did not plan: ${links
        .map((link) => link.url)
        .join(", ")}`,
    };
  }

  return { action: "update", before: links, after: [...PROFILE_LINKS] };
}

/**
 * The per-row plan for every replication credited to Loka, plus any row that
 * still carries a wheressuede residue without her artist credit — matching on
 * the residue too means a mis-credited row surfaces as a conflict instead of
 * silently keeping the string the acceptance criteria say must be gone.
 */
export function planReplicationRepairs(replications = []) {
  const matched = replications.filter(
    (row) =>
      normalize(row.artist) === "loka" ||
      normalize(row.rightsholder) === LEGACY_RIGHTSHOLDER ||
      urlIdentity(row.artist_url) === LEGACY_URL_IDENTITY,
  );

  const conflicts = [];
  const rows = [];

  for (const row of matched) {
    if (normalize(row.artist) !== "loka") {
      conflicts.push(
        `${row.slug}: carries a wheressuede residue but is credited to "${row.artist}", not Loka`,
      );
      continue;
    }

    const currentUrl = row.artist_url ?? null;
    const urlIsLegacy = urlIdentity(currentUrl) === LEGACY_URL_IDENTITY;
    const urlIsRepaired = urlIdentity(currentUrl) === WEBSITE_URL_IDENTITY;
    if (currentUrl && !urlIsLegacy && !urlIsRepaired) {
      conflicts.push(
        `${row.slug}: artist_url is "${currentUrl}", which this script does not know how to repair`,
      );
      continue;
    }

    // `applyProvenanceCorrection` updates carry credit_line as a required
    // string, so a row without one gets the canonical fallback the rest of the
    // corpus already stores verbatim (every prod Loka row carries exactly
    // this). Same precedent as apply-artist-license.mjs.
    const creditLine = row.credit_line?.trim() || `${row.title} by ${row.artist}`;
    const creditLineSynthesized = !row.credit_line?.trim();

    const needsArtistUrl = !urlIsRepaired;
    const needsRightsholder = normalize(row.rightsholder) === LEGACY_RIGHTSHOLDER;

    rows.push({
      id: row._id,
      slug: row.slug,
      title: row.title,
      creditLineSynthesized,
      unchanged: !needsArtistUrl && !needsRightsholder,
      before: { artist_url: currentUrl, rightsholder: row.rightsholder ?? null },
      expected: {
        title: row.title,
        artist: row.artist,
        artist_url: currentUrl,
        credit_line: row.credit_line ?? null,
        source_url: row.source_url ?? null,
        rightsholder: row.rightsholder ?? null,
      },
      updates: {
        title: row.title,
        artist: row.artist,
        artist_url: WEBSITE_URL,
        credit_line: creditLine,
        ...(row.source_url ? { source_url: row.source_url } : {}),
        ...(needsRightsholder
          ? { rightsholder: CORRECT_RIGHTSHOLDER }
          : row.rightsholder
            ? { rightsholder: row.rightsholder }
            : {}),
      },
    });
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  return { rows, conflicts };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  // Deliberately not falling back to VITE_CONVEX_URL: a plan built from one
  // deployment must describe writes to that same deployment.
  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error(
      "Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL) so the script knows which deployment to read.",
    );
  }
  console.log(`Reading from: ${readUrl}`);

  const client = new ConvexHttpClient(readUrl);
  const [profile, replications] = await Promise.all([
    client.query(api.contributorProfiles.getByKey, { key: PROFILE_KEY }),
    client.query(api.replications.getAll, {}),
  ]);

  const profilePlan = planProfileRepair(profile);
  const { rows, conflicts } = planReplicationRepairs(replications);

  if (profilePlan.action === "conflict") {
    conflicts.push(profilePlan.reason);
  }
  if (conflicts.length > 0) {
    console.error("\nConflicts — nothing will be written until a human resolves them:");
    for (const conflict of conflicts) {
      console.error(`  ${conflict}`);
    }
    throw new Error(`${conflicts.length} conflict(s); resolve before writing.`);
  }

  console.log(`\nProfile ${PROFILE_KEY}:`);
  if (profilePlan.action === "missing") {
    console.log("  not present on this deployment — nothing to do for the profile.");
  } else if (profilePlan.action === "unchanged") {
    console.log("  links already carry lokavision.com — up to date.");
  } else {
    console.log(
      `  links: ${JSON.stringify(profilePlan.before)} -> ${JSON.stringify(profilePlan.after)}`,
    );
  }

  const pendingRows = rows.filter((row) => !row.unchanged);
  console.log(
    `\nReplications credited to Loka: ${rows.length} matched; ${pendingRows.length} need updating.`,
  );
  for (const row of rows) {
    if (row.unchanged) {
      console.log(`  ${row.slug}  (${row.title})  [up-to-date]`);
      continue;
    }
    const changes = [];
    if (urlIdentity(row.before.artist_url) !== WEBSITE_URL_IDENTITY) {
      changes.push(`artist_url: ${row.before.artist_url ?? "(none)"} -> ${WEBSITE_URL}`);
    }
    if (normalize(row.before.rightsholder) === LEGACY_RIGHTSHOLDER) {
      changes.push(`rightsholder: ${row.before.rightsholder} -> ${CORRECT_RIGHTSHOLDER}`);
    }
    if (row.creditLineSynthesized) {
      changes.push(`credit_line: (none) -> ${row.updates.credit_line}`);
    }
    console.log(`  ${row.slug}  (${row.title})  ${changes.join("; ")}`);
  }

  const profileNeedsWrite = profilePlan.action === "update";
  if (!profileNeedsWrite && pendingRows.length === 0) {
    console.log("\nNothing to write — this deployment is already repaired (or Loka is absent).");
    return;
  }

  if (command.dryRun) {
    console.log("\nDry run — no Convex writes performed. To apply against production:");
    console.log(
      "  TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \\\n" +
        "    node scripts/contributors/repair-loka-attribution.mjs --write \\\n" +
        `    --confirm-write=${OPERATION} \\\n` +
        "    --expected-deployment=glad-minnow-656",
    );
    return;
  }

  assertProductionWriteAllowed(command);

  if (pendingRows.length > 0) {
    const { token: replicationKey } = requireProductionWriteCredential("replicationMaintenance");
    const writeClient = new ConvexHttpClient(command.targetUrl);
    let updated = 0;
    for (const row of pendingRows) {
      await writeClient.mutation(api.replications.applyProvenanceCorrection, {
        apiKey: replicationKey,
        id: row.id,
        expected: row.expected,
        updates: row.updates,
      });
      updated += 1;
      console.log(`  repaired ${row.slug}`);
    }
    console.log(`\nUpdated ${updated} replication row(s).`);
  }

  if (profileNeedsWrite) {
    const { token: profileKey } = requireProductionWriteCredential("profileMediaWrite");
    const writeClient = new ConvexHttpClient(command.targetUrl);

    // The public read materializes rows, which loses avatarStorageId,
    // membershipEmail and createdAt — all of which bulkImport would then
    // clear. Re-read the raw row and merge before writing.
    const [raw] = await writeClient.query(api.contributorProfiles.getForBulkImport, {
      apiKey: profileKey,
      keys: [PROFILE_KEY],
    });
    if (!raw) {
      throw new Error(`Profile ${PROFILE_KEY} vanished between planning and writing.`);
    }
    if ((raw.links ?? []).length > 0) {
      throw new Error(
        `Profile ${PROFILE_KEY} gained links between planning and writing; re-run to re-plan.`,
      );
    }

    const result = await writeClient.mutation(api.contributorProfiles.bulkImport, {
      apiKey: profileKey,
      profiles: [
        {
          key: raw.key,
          displayName: raw.displayName,
          aliases: raw.aliases ?? [],
          bio: raw.bio ?? "",
          links: [...PROFILE_LINKS],
          ...(raw.role ? { role: raw.role } : {}),
          ...(raw.avatarStorageId ? { avatarStorageId: raw.avatarStorageId } : {}),
          ...(raw.avatarUrl ? { avatarUrl: raw.avatarUrl } : {}),
          ...(raw.membershipEmail ? { membershipEmail: raw.membershipEmail } : {}),
          ...(raw.createdAt ? { createdAt: raw.createdAt } : {}),
        },
      ],
    });
    console.log(`\nProfile write: created ${result.created}, updated ${result.updated}.`);
  }

  console.log("\nDone. Re-run without --write to confirm the plan is now empty.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
