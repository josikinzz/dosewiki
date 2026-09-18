#!/usr/bin/env bun
/**
 * Give every contributor who has a work in the gallery, and no avatar, an avatar
 * cut from their own work.
 *
 * Seventy-five of the eighty-six contributor profiles render as initials in a
 * circle. Fifty-eight of those seventy-five are credited on at least one
 * publishable replication, which means the archive already holds a picture that
 * is unambiguously theirs. This script cuts a 256x256 square out of one of those
 * pictures, writes it to `public/profile-avatars/<key>/avatar.webp`, and points
 * the profile's `avatarUrl` at it.
 *
 * ## Which work becomes the avatar
 *
 * A strict, total ordering. Every step is derived from stored data, so a re-run
 * on unchanged data picks the same work:
 *
 *  1. **A curated work beats an uncurated one.** `effectIndexFeaturedReplications.json`
 *     is thirty-six slugs of editorial "best of" recovered from Effect Index. It
 *     is the only human judgement available about which works represent the
 *     archive, and it outranks everything mechanical below it.
 *  2. **A still image beats a video.** A still is a frame its author chose and
 *     graded; any frame pulled out of a video is a frame nobody chose. This is a
 *     convenience, not a judgement, which is why it sits under curation — see
 *     below.
 *  3. **The larger square wins**, measured as `min(width, height)` of the source.
 *     The delivered asset is square, so the short side — not the area — is what
 *     bounds it. A 5600x2840 landscape yields a 2840px square; a 3000x200
 *     panorama yields 200.
 *  4. **Slug ascending**, so the ordering is total and nothing is left to
 *     document order or to whatever the database returns first.
 *
 * Steps 1 and 2 disagree for exactly one contributor in the current corpus, and
 * that case is why they are in this order. Hyperactive Filly's one still,
 * `sleep-paralysis-hyperactive-filly`, is a deliberately near-black photograph of
 * a dark ceiling — true to its subject and unreadable at 128px in a circle (mean
 * luminance 22.9 of 255). Their curated work, `strawberry-fields-hyperactive-filly`,
 * is a video, and a frame a second into it is vivid. Preferring the still because
 * extracting a frame is more work produced a black circle; preferring the curated
 * work produced an avatar. Curation is the more considered signal, so it goes on
 * top and the mechanical preference breaks ties beneath it.
 *
 * Only rows whose effective role is `replication` are eligible, via the existing
 * `isPublishableReplication`. A clinical figure or a molecule diagram is stored,
 * credited and rights-tracked in the same table, and is nobody's portfolio.
 *
 * Names resolve through `profileMatchesName`, the shared exact-whole-name
 * matcher. This script deliberately owns no matching of its own: a second
 * definition of "this credit is that contributor" is how one person quietly
 * inherits another's work.
 *
 * ## The crop
 *
 * Centre, always, and never enlarged. `ContributorAvatar` renders into a
 * `rounded-full` frame with `object-cover`, so the delivered square is masked to
 * a circle and its corners are thrown away — the middle of the frame is the only
 * part guaranteed to survive. Artwork is centre-weighted in a way portraits are
 * not; the top-crop convention that suits a face is wrong here, and would land
 * in empty sky on the landscapes that make up most of this set.
 *
 * If a source's short side is under 256 the avatar is delivered at that size
 * instead. Nothing is upscaled, padded or stretched.
 *
 * ## Video frames
 *
 * Fourteen of the fifty-eight have only video. `t=0` is the wrong frame to take:
 * these open on fades from black, and a black circle is a failure rather than an
 * edge case. Frames are tried on a fixed ladder starting a second in, each one
 * measured for mean luminance, and the first frame at or above
 * `MIN_FRAME_LUMA` is kept. If the whole ladder is dark the brightest attempt is
 * kept and the run says so.
 *
 * ## Provenance
 *
 * An avatar cut from someone's artwork is still their artwork. Every selection —
 * the work, its title, its credit line, its rights status, and for a video the
 * exact timestamp of the frame — is recorded in
 * `data/contributors/contributorAvatarSources.json`, which is checked in.
 *
 * ## Running it
 *
 * Requires `ffmpeg`/`ffprobe` on PATH for the video sources.
 *
 * Dry run (default; writes nothing, reads production):
 *   bun scripts/contributors/generate-avatars-from-replications.ts
 *
 * Dry run rendering the avatars somewhere disposable, to look at them first:
 *   bun scripts/contributors/generate-avatars-from-replications.ts --preview-dir=/tmp/avatars
 *
 * Apply:
 *   DATA_BACKEND=postgres TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   bun scripts/contributors/generate-avatars-from-replications.ts --write \
 *     --confirm-write=generate-contributor-avatars \
 *     --expected-deployment=localhost/dosewiki
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  normalizeProfileKey,
  sanitizeContributorAvatarUrl,
} from "../../lib/contributorProfileIdentity";
import { isPublishableReplication } from "../../src/types/replications";
import {
  hasStoredAvatar,
  isFeaturedReplication,
  preferredTier,
  rankMeasuredCandidates,
  worksForProfile,
} from "./generate-avatar-candidates";
import type {
  Dimensions,
  PlanEntry,
  ProfileRow,
  ReplicationRow,
} from "./generate-avatar-candidates";
import {
  MANIFEST_PATH,
  ROOT,
  avatarFileExists,
  avatarFilePathForKey,
  avatarUrlForKey,
  buildAvatarManifest,
  buildAvatarManifestEntry,
  previewAvatarFilePath,
  writeAvatarFile,
  writeAvatarManifest,
} from "./generate-avatar-files";
import type {
  AvatarFrame,
  AvatarManifestEntry,
} from "./generate-avatar-files";
import {
  avatarOnlyImportRow,
  importRowDiff,
  projectedStoredProfile,
} from "./generate-avatar-import-policy";
import type {
  ContributorImportRow,
  StoredContributorProfile,
} from "./generate-avatar-import-policy";
import {
  AVATAR_SIZE,
  MIN_FRAME_LUMA,
  centreSquare,
  fetchBytes,
  meanLuminance,
  orientImage,
  probeVideo,
  renderAvatar,
  selectVideoFrame,
} from "./generate-avatar-media";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export * from "./generate-avatar-candidates";
export * from "./generate-avatar-files";
export * from "./generate-avatar-import-policy";
export * from "./generate-avatar-media";


const OPERATION = "generate-contributor-avatars";
const SCRIPT_PATH = fileURLToPath(import.meta.url);










/* -------------------------------------------------------------------- report */

function log(message = "") {
  console.log(message);
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const previewDir = process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--preview-dir="))
    ?.slice("--preview-dir=".length);

  const client = createDataClient({ target: resolvePostgresSource().url }).client;
  const [profiles, replications] = (await Promise.all([
    client.query(api.contributorProfiles.getAll, {}),
    client.query(api.replications.getAll, {}),
  ])) as [ProfileRow[], ReplicationRow[]];

  const publishable = replications.filter((row) => isPublishableReplication(row));
  const withAvatar = profiles.filter(hasStoredAvatar);
  const withoutAvatar = profiles.filter((profile) => !hasStoredAvatar(profile));

  log();
  log(`Profiles: ${profiles.length} total, ${withAvatar.length} with an avatar, ${withoutAvatar.length} without.`);
  log(
    `Replications: ${replications.length} rows, ${publishable.length} publishable ` +
      `(${replications.length - publishable.length} withheld as figures or undrawable media).`,
  );

  const eligible: Array<{ profile: ProfileRow; works: ReplicationRow[] }> = [];
  const noWorks: ProfileRow[] = [];

  for (const profile of withoutAvatar) {
    const works = worksForProfile(profile, publishable);
    if (works.length === 0) {
      noWorks.push(profile);
      continue;
    }
    eligible.push({ profile, works });
  }

  eligible.sort((left, right) => left.profile.key.localeCompare(right.profile.key));

  log(
    `Without an avatar: ${eligible.length} have at least one publishable replication, ` +
      `${noWorks.length} have none and are skipped.`,
  );
  log();
  log("SKIPPED — no work to cut an avatar from:");
  for (const profile of noWorks.sort((left, right) => left.key.localeCompare(right.key))) {
    log(`  ${profile.key.padEnd(24)} ${profile.displayName}`);
  }

  log();
  log("UNTOUCHED — an avatar already chosen:");
  for (const profile of withAvatar.sort((left, right) => left.key.localeCompare(right.key))) {
    log(`  ${profile.key.padEnd(24)} ${profile.avatarUrl}`);
  }

  // Resolve every tier candidate's bytes through production storage. The stored
  // `url` column on the older rows points at retired deployments, so storage is
  // the source of truth and `url` is only a fallback, exactly as the public read
  // resolves it.
  const tiers = eligible.map(({ profile, works }) => ({ profile, works, tier: preferredTier(works) }));
  const storageIds = [...new Set(tiers.flatMap(({ tier }) => tier.map((row) => row.storage_id)))];
  const resolvedUrls = new Map<string, string>();
  for (let index = 0; index < storageIds.length; index += 50) {
    const batch = storageIds.slice(index, index + 50);
    const urls = (await client.query(api.replications.resolveStorageUrls, {
      storageIds: batch,
    })) as Array<string | null>;
    batch.forEach((storageId, offset) => {
      if (urls[offset]) {
        resolvedUrls.set(storageId, urls[offset]);
      }
    });
  }

  const mediaUrlFor = (row: ReplicationRow) => {
    const url = resolvedUrls.get(row.storage_id) ?? row.url;
    if (!url) {
      throw new Error(`${row.slug} resolves to no media URL`);
    }
    return url;
  };

  log();
  log(`Measuring ${tiers.reduce((total, entry) => total + entry.tier.length, 0)} tier candidate(s)...`);

  const measured = new Map<string, Dimensions & { duration?: number }>();
  const measure = async (row: ReplicationRow) => {
    if (measured.has(row.slug)) {
      return;
    }
    const url = mediaUrlFor(row);
    if (row.type === "video") {
      measured.set(row.slug, await probeVideo(url));
      return;
    }
    const { dimensions } = await orientImage(await fetchBytes(url));
    measured.set(row.slug, dimensions);
  };

  const measureQueue = tiers.flatMap(({ tier }) => tier);
  let queueIndex = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queueIndex < measureQueue.length) {
        await measure(measureQueue[queueIndex++]);
      }
    }),
  );

  const plan: PlanEntry[] = tiers.map(({ profile, works, tier }) => {
    const candidates = rankMeasuredCandidates(
      tier.map((row) => {
        const dimensions = measured.get(row.slug);
        return {
          slug: row.slug,
          type: row.type as "image" | "video",
          featured: isFeaturedReplication(row.slug),
          squareSide: Math.min(dimensions.width, dimensions.height),
        };
      }),
    );
    const winner = candidates[0];
    const replication = tier.find((row) => row.slug === winner.slug);
    const dimensions = measured.get(winner.slug);

    return {
      key: normalizeProfileKey(profile.key),
      displayName: profile.displayName,
      worksConsidered: works.length,
      tierSize: tier.length,
      candidates,
      winner,
      replication,
      mediaUrl: mediaUrlFor(replication),
      dimensions: { width: dimensions.width, height: dimensions.height },
      duration: dimensions.duration,
    };
  });

  log();
  log("PLAN — one avatar per contributor, cut from the work named:");
  log(
    "  key                      src   source px      square  from  work",
  );
  for (const entry of plan) {
    const crop = centreSquare(entry.dimensions);
    log(
      `  ${entry.key.padEnd(24)} ${entry.winner.type.padEnd(5)} ` +
        `${`${entry.dimensions.width}x${entry.dimensions.height}`.padEnd(14)} ` +
        `${String(crop.output).padEnd(6)} ${`${entry.tierSize}/${entry.worksConsidered}`.padEnd(5)} ` +
        `${entry.winner.slug}${entry.winner.featured ? "  [curated]" : ""}`,
    );
  }

  const fromImages = plan.filter((entry) => entry.winner.type === "image").length;
  const fromVideos = plan.length - fromImages;
  const undersized = plan.filter((entry) => centreSquare(entry.dimensions).output < AVATAR_SIZE);

  log();
  log(`Total: ${plan.length} avatar(s) — ${fromImages} from stills, ${fromVideos} from video frames.`);
  log(
    `Delivered under ${AVATAR_SIZE}px because the source is smaller: ${undersized.length}` +
      (undersized.length > 0
        ? ` (${undersized.map((entry) => `${entry.key} @ ${centreSquare(entry.dimensions).output}px`).join(", ")})`
        : ""),
  );

  const collisions = plan.filter((entry) => avatarFileExists(entry.key));
  if (collisions.length > 0) {
    throw new Error(
      `Refusing to overwrite ${collisions.length} existing avatar file(s): ` +
        `${collisions.map((entry) => avatarUrlForKey(entry.key)).join(", ")}. ` +
        "Somebody chose those; this script only fills empty ones.",
    );
  }

  for (const entry of plan) {
    if (!sanitizeContributorAvatarUrl(avatarUrlForKey(entry.key))) {
      throw new Error(
        `${avatarUrlForKey(entry.key)} would be rejected by sanitizeContributorAvatarUrl and render nothing.`,
      );
    }
  }

  const renderTargets = command.dryRun
    ? previewDir
      ? plan.map((entry) => ({
          entry,
          filePath: previewAvatarFilePath(previewDir, entry.key),
        }))
      : []
    : plan.map((entry) => ({ entry, filePath: avatarFilePathForKey(entry.key) }));

  if (command.dryRun && !previewDir) {
    log();
    log("Dry run — no images rendered, no files written, no Postgres writes.");
    log("Pass --preview-dir=<path> to render the avatars somewhere disposable and look at them.");
    return;
  }

  log();
  log(`Rendering ${renderTargets.length} avatar(s)...`);

  const manifestEntries: AvatarManifestEntry[] = [];

  for (const { entry, filePath } of renderTargets) {
    let source: Buffer;
    let dimensions = entry.dimensions;
    const frame: AvatarFrame = {};

    if (entry.winner.type === "video") {
      const { chosen, attempts, fellBackToBrightest } = await selectVideoFrame(
        entry.mediaUrl,
        entry.duration ?? 0,
      );
      const oriented = await orientImage(chosen.bytes);
      source = oriented.bytes;
      dimensions = oriented.dimensions;
      frame.frameSeconds = chosen.seconds;
      frame.frameMeanLuminance = Number(chosen.luma.toFixed(1));
      frame.frameAttempts = attempts.map((attempt) => ({
        seconds: attempt.seconds,
        meanLuminance: Number(attempt.luma.toFixed(1)),
      }));
      if (fellBackToBrightest) {
        console.warn(
          `  WARNING ${entry.key}: every sampled frame of ${entry.winner.slug} was below the ` +
            `black-frame threshold; kept the brightest at t=${chosen.seconds}s (luma ${chosen.luma.toFixed(1)}).`,
        );
      }
    } else {
      const oriented = await orientImage(await fetchBytes(entry.mediaUrl));
      source = oriented.bytes;
      dimensions = oriented.dimensions;
    }

    const rendered = await renderAvatar(source, dimensions);
    const luminance = await meanLuminance(rendered.bytes);

    // `wx` on the repository path: an avatar that already exists was chosen by
    // somebody and is never replaced. A disposable preview directory is meant to
    // be re-rendered, so it is overwritten instead.
    writeAvatarFile(filePath, rendered.bytes, command.dryRun);

    if (luminance < MIN_FRAME_LUMA) {
      console.warn(
        `  WARNING ${entry.key}: the delivered avatar has a mean luminance of ${luminance.toFixed(1)} — ` +
          "close to black. Look at it before shipping.",
      );
    }

    log(
      `  ${entry.key.padEnd(24)} ${rendered.size}x${rendered.size} ` +
        `${String(rendered.bytes.length).padStart(6)}B  luma ${luminance.toFixed(1).padStart(5)}  ` +
        `${entry.winner.slug}${frame.frameSeconds !== undefined ? ` @ t=${frame.frameSeconds}s` : ""}`,
    );

    manifestEntries.push(
      buildAvatarManifestEntry({ entry, dimensions, frame, rendered, luminance }),
    );
  }

  if (command.dryRun) {
    log();
    log(`Dry run — avatars rendered into ${previewDir} only. No repository file, manifest or Postgres row was touched.`);
    return;
  }

  const manifest = buildAvatarManifest(manifestEntries);
  writeAvatarManifest(manifest);
  log();
  log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} (${manifestEntries.length} entries).`);

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  // The public read materializes rows, which loses avatarStorageId,
  // membershipEmail, createdAt, updatedAt and updatedBy — every one of which
  // bulkImport would then reset. Merge against the raw rows instead.
  const rawProfiles = (await writeClient.query(api.contributorProfiles.getForBulkImport, {
    apiKey,
    keys: plan.map((entry) => entry.key),
  })) as StoredContributorProfile[];
  const rawByKey = new Map(rawProfiles.map((profile) => [normalizeProfileKey(profile.key), profile]));

  const importRows: ContributorImportRow[] = [];
  log();
  log("DATA DIFF — the fields bulkImport will change on each row:");
  for (const entry of plan) {
    const stored = rawByKey.get(entry.key);
    if (!stored) {
      console.warn(`  SKIP ${entry.key} — no contributorProfiles row.`);
      continue;
    }
    // Re-check at the write boundary: an editor may have set an avatar between
    // the plan and this moment, and this script must never replace one.
    if (sanitizeContributorAvatarUrl(stored.avatarUrl) || stored.avatarStorageId) {
      console.warn(`  SKIP ${entry.key} — an avatar appeared since the plan was built.`);
      continue;
    }

    const row = avatarOnlyImportRow(stored, avatarUrlForKey(entry.key));
    const changed = importRowDiff(stored, projectedStoredProfile(row));
    log(`  ${entry.key.padEnd(24)} ${changed.join(", ") || "(nothing)"}`);
    if (changed.length !== 1 || changed[0] !== "avatarUrl") {
      throw new Error(
        `${entry.key} would change ${changed.join(", ")}; this script may only change avatarUrl.`,
      );
    }
    importRows.push(row);
  }

  log();
  log(`Writing ${importRows.length} profile row(s) to ${command.deploymentFingerprint}...`);
  const result = await writeClient.mutation(api.contributorProfiles.bulkImport, {
    apiKey,
    profiles: importRows,
  });
  log(`Created ${result.created}, updated ${result.updated}.`);
}

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
