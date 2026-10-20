import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeProfileKey } from "../../lib/contributorProfileIdentity";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import type { Dimensions, PlanEntry } from "./generate-avatar-candidates";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AVATAR_ROOT = path.join(ROOT, "public/profile-avatars");
export const MANIFEST_PATH = path.join(ROOT, "data/contributors/contributorAvatarSources.json");

export function avatarUrlForKey(key: string): string {
  return `/profile-avatars/${normalizeProfileKey(key).toLowerCase()}/avatar.webp`;
}

export function avatarFilePathForKey(key: string): string {
  return path.join(AVATAR_ROOT, normalizeProfileKey(key).toLowerCase(), "avatar.webp");
}

export function avatarFileExists(key: string): boolean {
  return fs.existsSync(avatarFilePathForKey(key));
}

function writeFileCreatingDirectory(filePath: string, bytes: Buffer, overwrite: boolean): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes, { flag: overwrite ? "w" : "wx" });
}

export function installAvatarFile(key: string, bytes: Buffer, { overwrite }: { overwrite: boolean }): void {
  const filePath = avatarFilePathForKey(key);
  assertDataWritesNotFrozen(`profile-avatars:${path.relative(AVATAR_ROOT, filePath)}`);
  writeFileCreatingDirectory(filePath, bytes, overwrite);
}

function physicalPath(target: string): string {
  const missing: string[] = [];
  let current = path.resolve(target);
  while (!fs.lstatSync(current, { throwIfNoEntry: false })) {
    missing.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(fs.realpathSync(current), ...missing);
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function writePreviewAvatarFile(previewDir: string, key: string, bytes: Buffer): string {
  const filePath = path.resolve(previewDir, normalizeProfileKey(key).toLowerCase(), "avatar.webp");
  if (isWithin(physicalPath(ROOT), physicalPath(filePath))) {
    throw new Error("--preview-dir must be disposable, outside the repository checkout.");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  fs.renameSync(temporary, filePath);
  return filePath;
}

export function writeProvenanceManifest(filePath: string, manifest: object): void {
  assertDataWritesNotFrozen(`avatar-provenance:${path.relative(ROOT, path.resolve(filePath))}`);
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export interface AvatarFrame {
  frameSeconds?: number;
  frameMeanLuminance?: number;
  frameAttempts?: Array<{ seconds: number; meanLuminance: number }>;
}

export interface AvatarManifestEntry {
  profileKey: string;
  displayName: string;
  avatarUrl: string;
  source: {
    replicationSlug: string;
    title: string | null;
    artist: string;
    type: "image" | "video";
    curated: boolean;
    sourceWidth: number;
    sourceHeight: number;
    creditLine: string | null;
    rightsStatus: string | null;
    rightsholder: string | null;
    sourceUrl: string | null;
  } & AvatarFrame;
  selection: {
    worksConsidered: number;
    tierSize: number;
    rankedCandidates: Array<{ slug: string; curated: boolean; squareSide: number }>;
  };
  output: {
    width: number;
    height: number;
    format: "webp";
    crop: "centre-square";
    bytes: number;
    meanLuminance: number;
  };
}

export interface AvatarManifest {
  note: string;
  selectionRule: string[];
  generatedAt: string;
  avatars: AvatarManifestEntry[];
}

export function buildAvatarManifestEntry({
  entry,
  dimensions,
  frame,
  rendered,
  luminance,
}: {
  entry: PlanEntry;
  dimensions: Dimensions;
  frame: AvatarFrame;
  rendered: { bytes: Buffer; size: number };
  luminance: number;
}): AvatarManifestEntry {
  return {
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
  };
}

export function buildAvatarManifest(
  manifestEntries: AvatarManifestEntry[],
  generatedAt = new Date().toISOString(),
): AvatarManifest {
  return {
    note:
      "Provenance for every avatar cut from a contributor's own work by " +
      "scripts/contributors/generate-avatars-from-replications.ts. Each avatar is a centre " +
      "square of the named replication, delivered at 256x256 WebP (or at the source's short " +
      "side when that is smaller — nothing is upscaled). The artwork remains the artist's; " +
      "this file is the record of which work each avatar came from.",
    selectionRule: [
      "1. a curated work beats an uncurated one (data/effects/effectIndexFeaturedReplications.json)",
      "2. a still image beats a video (a still is a frame its author chose)",
      "3. the larger square wins, measured as min(width, height) of the source",
      "4. slug ascending, so the ordering is total",
    ],
    generatedAt,
    avatars: manifestEntries.sort((left, right) => left.profileKey.localeCompare(right.profileKey)),
  };
}
