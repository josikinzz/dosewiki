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
 * `src/data/config/contributorAvatarSources.json`, which is checked in.
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
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *   bun scripts/contributors/generate-avatars-from-replications.ts --write \
 *     --confirm-write=generate-contributor-avatars \
 *     --expected-deployment=glad-minnow-656
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";
import { buildImportedStoredProfile } from "../../convex/lib/contributorProfiles";
import featuredReplications from "../../src/data/config/effectIndexFeaturedReplications.json";
import {
  normalizeProfileKey,
  profileMatchesName,
  sanitizeContributorAvatarUrl,
} from "../../lib/contributorProfileIdentity";
import { isPublishableReplication } from "../../src/types/replications";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const execFileAsync = promisify(execFile);

// sharp is a native addon and this script runs under Bun, whose allocator has
// been seen to abort when several sharp pipelines are in flight at once. Decoding
// is serialized through `withSharp` below; the network fetches around it still
// run in parallel, which is where the wall-clock time actually goes.
sharp.concurrency(1);

let sharpQueue: Promise<unknown> = Promise.resolve();
function withSharp<T>(work: () => Promise<T>): Promise<T> {
  const next = sharpQueue.then(work, work);
  sharpQueue = next.catch(() => undefined);
  return next;
}

const OPERATION = "generate-contributor-avatars";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const AVATAR_ROOT = path.join(ROOT, "public/profile-avatars");
const MANIFEST_PATH = path.join(ROOT, "src/data/config/contributorAvatarSources.json");

/** 2x the largest render: `ContributorAvatar size="lg"` is 128 CSS px. */
export const AVATAR_SIZE = 256;
const AVATAR_WEBP_QUALITY = 82;

/**
 * Mean luminance, 0-255, below which a frame is treated as black. A fade-in
 * frame measures in the low single digits; the darkest frame this run actually
 * keeps is far above it. Deliberately generous: the cost of rejecting a usable
 * dark frame is trying the next one, and the cost of keeping a black one is a
 * contributor whose avatar is a black circle.
 */
export const MIN_FRAME_LUMA = 24;

/**
 * Where in a video to look, in seconds, in order. Starts a second in because
 * these open on fades from black.
 */
export const FRAME_LADDER_SECONDS = Object.freeze([1, 2, 3.5, 5, 8]);

const FEATURED_SLUGS: ReadonlySet<string> = new Set(featuredReplications.slugs);

type ReplicationRow = {
  slug: string;
  title?: string;
  artist: string;
  artist_url?: string;
  type: "image" | "video" | "audio";
  role?: "replication" | "figure";
  storage_id: string;
  url?: string;
  credit_line?: string;
  rights_status?: string;
  source_url?: string;
  rightsholder?: string;
};

type ProfileRow = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl?: string | null;
};

type Dimensions = { width: number; height: number };

/** Exactly the shape `bulkImportProfileValidator` accepts. */
type ContributorImportRow = {
  key: string;
  displayName: string;
  aliases: string[];
  bio: string;
  links: Array<{ label: string; url: string }>;
  avatarUrl: string;
  role?: string;
  avatarStorageId?: string;
  membershipEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type AvatarCandidate = {
  slug: string;
  type: "image" | "video";
  featured: boolean;
  /** `min(width, height)`: the largest square this source can yield. */
  squareSide: number;
};

/* ----------------------------------------------------------------- selection */

/**
 * The eligible works of one contributor: publishable replications whose credit
 * line resolves to them through the shared matcher.
 */
export function worksForProfile(
  profile: { displayName: string; aliases: readonly string[] },
  replications: readonly ReplicationRow[],
): ReplicationRow[] {
  return replications
    .filter((row) => isPublishableReplication(row))
    .filter((row) => profileMatchesName(profile, row.artist));
}

/**
 * Narrow a contributor's works to the tier the avatar must come from, before any
 * pixel is fetched: curated works if there are any, then stills if the surviving
 * set has any. Steps 1 and 2 of the ordering, and the only steps that can be
 * decided from stored metadata alone.
 */
export function preferredTier<Row extends { slug: string; type: string }>(works: readonly Row[]): Row[] {
  const curated = works.filter((row) => FEATURED_SLUGS.has(row.slug));
  const tier = curated.length > 0 ? curated : works;
  const stills = tier.filter((row) => row.type === "image");
  return stills.length > 0 ? stills : tier.filter((row) => row.type === "video");
}

/**
 * Steps 3 and 4, applied to a tier whose sources have been measured. Separated
 * from `preferredTier` because it is the half that costs a network round trip.
 */
export function rankMeasuredCandidates(candidates: readonly AvatarCandidate[]): AvatarCandidate[] {
  return [...candidates].sort(
    (left, right) => right.squareSide - left.squareSide || left.slug.localeCompare(right.slug),
  );
}

/* ------------------------------------------------------------------- imaging */

/**
 * The centred square of a source, and the size it is delivered at.
 *
 * Never enlarges: a source whose short side is under {@link AVATAR_SIZE} is
 * delivered at its own size rather than stretched up to a size it does not have.
 */
export function centreSquare({ width, height }: Dimensions, target = AVATAR_SIZE) {
  const side = Math.min(width, height);
  return {
    left: Math.round((width - side) / 2),
    top: Math.round((height - side) / 2),
    side,
    output: Math.min(side, target),
  };
}

/** Mean luminance 0-255 of an encoded image, as the black-frame guard reads it. */
export async function meanLuminance(bytes: Buffer): Promise<number> {
  const { channels } = await withSharp(() => sharp(bytes).greyscale().stats());
  return channels[0].mean;
}

/**
 * Auto-orient first, then measure. `sharp` reports pre-rotation dimensions, so a
 * portrait phone photo carrying EXIF orientation 6 would otherwise be cropped
 * against a landscape frame it does not actually have.
 */
async function orientImage(bytes: Buffer): Promise<{ bytes: Buffer; dimensions: Dimensions }> {
  return await withSharp(async () => {
    const oriented = await sharp(bytes, { animated: false }).rotate().toBuffer();
    const metadata = await sharp(oriented).metadata();
    return { bytes: oriented, dimensions: { width: metadata.width, height: metadata.height } };
  });
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error(`${url} returned an empty body`);
  }
  return bytes;
}

async function probeVideo(url: string): Promise<Dimensions & { duration: number }> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration",
      "-show_entries", "format=duration",
      "-of", "json",
      url,
    ],
    { maxBuffer: 1024 * 1024 * 16 },
  );
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error("ffprobe reported no video stream");
  }
  return {
    width: stream.width,
    height: stream.height,
    duration: Number(stream.duration ?? parsed.format?.duration ?? 0) || 0,
  };
}

/**
 * The timestamps to try for a video of a given length, in order.
 *
 * Anything at or past the end is dropped, and a clip shorter than the first rung
 * is sampled at its midpoint — which is still not `t=0`, the frame this ladder
 * exists to avoid.
 */
export function frameLadder(duration: number): number[] {
  const usable = FRAME_LADDER_SECONDS.filter((seconds) => duration <= 0 || seconds < duration);
  return usable.length > 0 ? [...usable] : [Number((duration / 2).toFixed(3))];
}

/**
 * The frame taken when the ladder yields nothing at all.
 *
 * `t=0` is the frame the ladder exists to avoid, so it is not on it and never
 * competes with a real frame for brightness. It is reached only when every other
 * seek produced no image — which one row does:
 * `smeared-walk-through-the-woods-oracle-emissary` is a 0.04-second, single-frame
 * mp4 where any seek at all lands past the end of the file.
 */
export const LAST_RESORT_FRAME_SECONDS = 0;

async function extractFrame(url: string, seconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-nostdin",
      "-v", "error",
      "-ss", String(seconds),
      "-i", url,
      "-frames:v", "1",
      "-f", "image2pipe",
      "-vcodec", "png",
      "-",
    ],
    { maxBuffer: 1024 * 1024 * 256, encoding: "buffer" },
  );
  const bytes = Buffer.from(stdout);
  if (bytes.length === 0) {
    throw new Error(`ffmpeg produced no frame at t=${seconds}s`);
  }
  return bytes;
}

/**
 * A still from a video, taken a second or so in and checked for black.
 *
 * Every attempt is reported, including the rejected ones, so a contributor whose
 * source is dark end to end is visible in the run rather than discovered later
 * as a black circle on their profile.
 */
async function selectVideoFrame(url: string, duration: number) {
  const attempts: Array<{ seconds: number; luma: number; bytes: Buffer }> = [];

  const tryAt = async (seconds: number) => {
    let bytes: Buffer;
    try {
      bytes = await extractFrame(url, seconds);
    } catch {
      return false;
    }
    const luma = await meanLuminance(bytes);
    attempts.push({ seconds, luma, bytes });
    return luma >= MIN_FRAME_LUMA;
  };

  for (const seconds of frameLadder(duration)) {
    if (await tryAt(seconds)) {
      return { chosen: attempts[attempts.length - 1], attempts, fellBackToBrightest: false };
    }
  }

  if (attempts.length === 0 && (await tryAt(LAST_RESORT_FRAME_SECONDS))) {
    return { chosen: attempts[attempts.length - 1], attempts, fellBackToBrightest: false };
  }

  if (attempts.length === 0) {
    throw new Error("no frame could be extracted at any timestamp");
  }

  const brightest = [...attempts].sort((left, right) => right.luma - left.luma)[0];
  return { chosen: brightest, attempts, fellBackToBrightest: true };
}

/** Centre-crop to a square and encode the delivered avatar. */
export async function renderAvatar(bytes: Buffer, dimensions: Dimensions) {
  const crop = centreSquare(dimensions);
  const encoded = await withSharp(() =>
    sharp(bytes)
      .extract({ left: crop.left, top: crop.top, width: crop.side, height: crop.side })
      .resize(crop.output, crop.output, { fit: "fill" })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer(),
  );

  return { bytes: encoded, size: crop.output, crop };
}

/* ---------------------------------------------------------------------- plan */

export function avatarUrlForKey(key: string): string {
  return `/profile-avatars/${normalizeProfileKey(key).toLowerCase()}/avatar.webp`;
}

function avatarFilePathForKey(key: string): string {
  return path.join(AVATAR_ROOT, normalizeProfileKey(key).toLowerCase(), "avatar.webp");
}

/**
 * The one field this script is allowed to change, merged onto the raw stored row.
 *
 * `bulkImport` patches every field it is handed, and silently defaults the ones
 * it is not: an omitted `createdAt` becomes now, an omitted `updatedBy` becomes
 * `system@dosewiki.internal`, an omitted `updatedAt` becomes now. Every field
 * including those three is therefore restated from the live row verbatim, so the
 * stored document differs in `avatarUrl` and in nothing else at all.
 */
export function avatarOnlyImportRow(
  stored: Record<string, any>,
  avatarUrl: string,
): ContributorImportRow {
  const row: ContributorImportRow = {
    key: stored.key,
    displayName: stored.displayName,
    aliases: stored.aliases ?? [],
    // Required by the validator even when empty.
    bio: stored.bio ?? "",
    links: stored.links ?? [],
    avatarUrl,
  };

  if (stored.role) row.role = stored.role;
  if (stored.avatarStorageId) row.avatarStorageId = stored.avatarStorageId;
  if (stored.membershipEmail) row.membershipEmail = stored.membershipEmail;
  if (stored.createdAt) row.createdAt = stored.createdAt;
  if (stored.updatedAt) row.updatedAt = stored.updatedAt;
  if (stored.updatedBy) row.updatedBy = stored.updatedBy;

  return row;
}

/**
 * What `bulkImport` would change about a stored row, field by field.
 *
 * The comparison is against `buildImportedStoredProfile` — the mutation's own
 * transform — rather than against the request, because the two are not the same
 * document. The mutation reshapes everything it is handed on the way in
 * (`sanitizeAliases` lowercases and dedupes, `sanitizeLinks` drops any non-HTTPS
 * link and keeps three, `sanitizeRole` collapses whitespace), so a row that
 * echoes a stored value back verbatim can still store something different. Only
 * a diff of stored-against-projected can say "`avatarUrl` moved and nothing
 * else" and be right.
 */
export function projectedStoredProfile(row: ContributorImportRow) {
  return buildImportedStoredProfile(row);
}

export function importRowDiff(stored: Record<string, any>, row: Record<string, any>): string[] {
  const fields = [
    "key",
    "displayName",
    "aliases",
    "avatarStorageId",
    "avatarUrl",
    "bio",
    "role",
    "links",
    "membershipEmail",
    "createdAt",
    "updatedAt",
    "updatedBy",
  ];

  return fields.filter(
    (field) => JSON.stringify(stored[field] ?? null) !== JSON.stringify(row[field] ?? null),
  );
}

type PlanEntry = {
  key: string;
  displayName: string;
  worksConsidered: number;
  tierSize: number;
  candidates: AvatarCandidate[];
  winner: AvatarCandidate;
  replication: ReplicationRow;
  mediaUrl: string;
  dimensions: Dimensions;
  duration?: number;
};

function hasStoredAvatar(profile: ProfileRow): boolean {
  return Boolean(sanitizeContributorAvatarUrl(profile.avatarUrl));
}

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

  // Deliberately not falling back to VITE_CONVEX_URL. A plan built from the dev
  // deployment would describe writes to production that were never checked
  // against production.
  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error(
      "Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL) so the script knows which deployment to read.",
    );
  }

  const client = new ConvexHttpClient(readUrl);
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
          featured: FEATURED_SLUGS.has(row.slug),
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

  const collisions = plan.filter((entry) => {
    const filePath = avatarFilePathForKey(entry.key);
    return fs.existsSync(filePath);
  });
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
          filePath: path.join(previewDir, normalizeProfileKey(entry.key).toLowerCase(), "avatar.webp"),
        }))
      : []
    : plan.map((entry) => ({ entry, filePath: avatarFilePathForKey(entry.key) }));

  if (command.dryRun && !previewDir) {
    log();
    log("Dry run — no images rendered, no files written, no Convex writes.");
    log("Pass --preview-dir=<path> to render the avatars somewhere disposable and look at them.");
    return;
  }

  log();
  log(`Rendering ${renderTargets.length} avatar(s)...`);

  const manifestEntries: any[] = [];

  for (const { entry, filePath } of renderTargets) {
    let source: Buffer;
    let dimensions = entry.dimensions;
    const frame: Record<string, any> = {};

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

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // `wx` on the repository path: an avatar that already exists was chosen by
    // somebody and is never replaced. A disposable preview directory is meant to
    // be re-rendered, so it is overwritten instead.
    fs.writeFileSync(filePath, rendered.bytes, { flag: command.dryRun ? "w" : "wx" });

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

    manifestEntries.push({
      profileKey: entry.key,
      displayName: entry.displayName,
      avatarUrl: avatarUrlForKey(entry.key),
      source: {
        replicationSlug: entry.replication.slug,
        title: entry.replication.title ?? null,
        artist: entry.replication.artist,
        type: entry.winner.type,
        curated: entry.winner.featured,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
        ...frame,
        creditLine: entry.replication.credit_line ?? null,
        rightsStatus: entry.replication.rights_status ?? null,
        rightsholder: entry.replication.rightsholder ?? null,
        sourceUrl: entry.replication.source_url ?? null,
      },
      selection: {
        worksConsidered: entry.worksConsidered,
        tierSize: entry.tierSize,
        rankedCandidates: entry.candidates.map((candidate) => ({
          slug: candidate.slug,
          curated: candidate.featured,
          squareSide: candidate.squareSide,
        })),
      },
      output: {
        width: rendered.size,
        height: rendered.size,
        format: "webp",
        crop: "centre-square",
        bytes: rendered.bytes.length,
        meanLuminance: Number(luminance.toFixed(1)),
      },
    });
  }

  if (command.dryRun) {
    log();
    log(`Dry run — avatars rendered into ${previewDir} only. No repository file, manifest or Convex row was touched.`);
    return;
  }

  const manifest = {
    note:
      "Provenance for every avatar cut from a contributor's own work by " +
      "scripts/contributors/generate-avatars-from-replications.ts. Each avatar is a centre " +
      "square of the named replication, delivered at 256x256 WebP (or at the source's short " +
      "side when that is smaller — nothing is upscaled). The artwork remains the artist's; " +
      "this file is the record of which work each avatar came from.",
    selectionRule: [
      "1. a curated work beats an uncurated one (src/data/config/effectIndexFeaturedReplications.json)",
      "2. a still image beats a video (a still is a frame its author chose)",
      "3. the larger square wins, measured as min(width, height) of the source",
      "4. slug ascending, so the ordering is total",
    ],
    generatedAt: new Date().toISOString(),
    avatars: manifestEntries.sort((left, right) => left.profileKey.localeCompare(right.profileKey)),
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  log();
  log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} (${manifestEntries.length} entries).`);

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const writeClient = new ConvexHttpClient(command.targetUrl);

  // The public read materializes rows, which loses avatarStorageId,
  // membershipEmail, createdAt, updatedAt and updatedBy — every one of which
  // bulkImport would then reset. Merge against the raw rows instead.
  const rawProfiles = (await writeClient.query(api.contributorProfiles.getForBulkImport, {
    apiKey,
    keys: plan.map((entry) => entry.key),
  })) as Array<Record<string, any>>;
  const rawByKey = new Map(rawProfiles.map((profile) => [normalizeProfileKey(profile.key), profile]));

  const importRows: ContributorImportRow[] = [];
  log();
  log("CONVEX DIFF — the fields bulkImport will change on each row:");
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
