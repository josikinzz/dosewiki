#!/usr/bin/env bun
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
  authorizeProductionWrite,
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

function log(message = "") {
  console.log(message);
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);
  const writeCredential = command.writeRequested ? requireProductionWriteCredential("profileMediaWrite") : null;

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

  const apiKey = writeCredential.token;
  const writeClient = createDataClient({ target: command.targetUrl }).client;

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
