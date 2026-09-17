#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDataClient } from "../lib/data-client.ts";
import sharp from "sharp";

import { api } from "../../lib/postgres/runtime/api.ts";
import {
  findContributorProfileByAuthorName,
  type MaterializedContributorProfile,
} from "../../lib/contributorProfileIdentity";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  renderReplicationSocialCardPng,
  REPLICATION_SOCIAL_CARD_RENDERER_VERSION,
  type ReplicationSocialCardInput,
} from "../../lib/og/prototypes/replicationSocialCard";
import {
  renderSubjectiveEffectSocialCardPng,
  SUBJECTIVE_EFFECT_SOCIAL_CARD_RENDERER_VERSION,
  type SubjectiveEffectSocialCardInput,
} from "../../lib/og/prototypes/subjectiveEffectSocialCard";
import {
  renderTripReportSocialCardPng,
  TRIP_REPORT_SOCIAL_CARD_RENDERER_VERSION,
  type TripReportSocialCardInput,
} from "../../lib/og/prototypes/tripReportSocialCard";
import {
  renderUserProfileSocialCardPng,
  USER_PROFILE_SOCIAL_CARD_RENDERER_VERSION,
  type UserProfileSocialCardInput,
} from "../../lib/og/prototypes/userProfileSocialCard";

const OUTPUT_ROOT = process.env.ENTITY_SOCIAL_CARD_OUTPUT_ROOT
  ? path.resolve(process.env.ENTITY_SOCIAL_CARD_OUTPUT_ROOT)
  : path.join(process.cwd(), "public/images/social/entities");
const MANIFEST_PATH = process.env.ENTITY_SOCIAL_CARD_MANIFEST_PATH
  ? path.resolve(process.env.ENTITY_SOCIAL_CARD_MANIFEST_PATH)
  : path.join(process.cwd(), "src/data/entitySocialCardManifest.generated.json");
const COVERAGE_PATH = process.env.ENTITY_SOCIAL_CARD_COVERAGE_PATH
  ? path.resolve(process.env.ENTITY_SOCIAL_CARD_COVERAGE_PATH)
  : null;
const MANIFEST_PUBLIC_PREFIX =
  process.env.ENTITY_SOCIAL_CARD_PUBLIC_PREFIX?.replace(/\/$/, "") ??
  "/images/social/entities";
// Contributor keys may carry underscores (PAVEL_SOUVIRON); the manifest is
// looked up by the lowercased key verbatim, so the slug must admit them.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const EFFECT_ICON = "material-symbols:person-play-outline-rounded";
const RENDER_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.ENTITY_SOCIAL_CARD_CONCURRENCY ?? "4", 10) || 4,
);
const FETCH_TIMEOUT_MS = Math.max(
  10_000,
  Number.parseInt(process.env.ENTITY_SOCIAL_CARD_FETCH_TIMEOUT_MS ?? "60000", 10) ||
    60_000,
);
const GENERATE_REPLICATION_CARDS =
  process.env.GENERATE_REPLICATION_SOCIAL_CARDS === "1";

type EntityKind = "effects" | "replications" | "reports" | "contributors";

type EffectRow = {
  slug: string;
  name: string;
  summary?: string | null;
  tags?: string[] | null;
  gallery_order?: string[] | null;
};

type ReplicationRow = {
  _id?: string;
  slug: string;
  title: string;
  artist?: string | null;
  rightsholder?: string | null;
  effect_slug?: string | null;
  type?: string | null;
  format?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  motion_poster_url?: string | null;
  width?: number | null;
  height?: number | null;
  source_url?: string | null;
  license_name?: string | null;
  license_url?: string | null;
  rights_status?: string | null;
  role?: string | null;
  publication_state?: string | null;
  replication_status?: string | null;
  source_sha256?: string | null;
};

type TimelineEntry = {
  time?: string | null;
  description?: string | null;
};

type ReportRow = {
  slug: string;
  title: string;
  introduction?: string | null;
  conclusion?: string | null;
  onset?: TimelineEntry[] | null;
  peak?: TimelineEntry[] | null;
  offset?: TimelineEntry[] | null;
  subject?: {
    name?: string | null;
    trip_date?: string | null;
    avatar_url?: string | null;
  } | null;
  substances?: Array<{
    name?: string | null;
    dose?: string | null;
    roa?: string | null;
  }> | null;
  tags?: string[] | null;
};

type ProfileRow = MaterializedContributorProfile & {
  avatarUrl?: string | null;
  replicationOrder?: string[] | null;
  reportOrder?: string[] | null;
};

type EntitySocialCardManifest = {
  version: 1;
  rendererVersions: Record<EntityKind, string>;
  cards: Record<EntityKind, Record<string, string>>;
};

type RenderJob = {
  kind: EntityKind;
  slug: string;
  digestSource: unknown;
  assetSources: string[];
  render: () => Promise<Buffer>;
};

type RenderedCard = {
  path: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
};

const rendererVersions: Record<EntityKind, string> = {
  effects: SUBJECTIVE_EFFECT_SOCIAL_CARD_RENDERER_VERSION,
  replications: REPLICATION_SOCIAL_CARD_RENDERER_VERSION,
  reports: TRIP_REPORT_SOCIAL_CARD_RENDERER_VERSION,
  contributors: USER_PROFILE_SOCIAL_CARD_RENDERER_VERSION,
};

const rendererInputPaths: Record<EntityKind, readonly string[]> = {
  effects: [
    "lib/og/prototypes/subjectiveEffectSocialCard.ts",
    "lib/og/socialCardPrimitives.ts",
  ],
  replications: [
    "lib/og/prototypes/replicationSocialCard.ts",
    "lib/og/socialCardPrimitives.ts",
  ],
  reports: [
    "lib/og/prototypes/tripReportSocialCard.ts",
    "lib/og/socialCardPrimitives.ts",
  ],
  contributors: [
    "lib/og/prototypes/userProfileSocialCard.ts",
    "lib/og/socialCardPrimitives.ts",
  ],
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter((item) => item.length > 0)
    : [];
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function assertSlug(slug: string, kind: EntityKind): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) {
    throw new Error(`Invalid ${kind} social-card slug: ${JSON.stringify(slug)}`);
  }
  return normalized;
}

function mediaSource(replication: ReplicationRow): string | null {
  const isMoving = replication.type === "video" || replication.type === "audio";
  const candidates = isMoving
    ? [
        replication.motion_poster_url,
        replication.thumbnail_url,
        replication.preview_url,
      ]
    : [replication.url, replication.thumbnail_url, replication.preview_url];
  return candidates.map(text).find(Boolean) ?? null;
}

function mediaSourceKind(replication: ReplicationRow): string | null {
  const source = mediaSource(replication);
  if (!source) return null;
  if (source === text(replication.motion_poster_url)) return "motion-poster";
  if (source === text(replication.thumbnail_url)) return "thumbnail";
  if (source === text(replication.preview_url)) return "preview";
  if (source === text(replication.url)) return "primary-media";
  return "unknown";
}

function contentAddressedSha256(source: string | null): string | null {
  if (!source) return null;
  return source.match(/\/media\/sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\./i)?.[1] ?? null;
}

function replicationExclusionReason(replication: ReplicationRow): string | null {
  const row = replication;
  if ((row.role ?? "replication") !== "replication") return "non-replication-role";
  if (row.publication_state === "duplicate-suppressed") return "duplicate-suppressed";
  if (row.replication_status === "not-replication") return "not-replication";
  if (row.type !== "image" && row.type !== "video") return "unsupported-media-type";
  if (!text(row.url)) return "missing-primary-media";
  return null;
}

function localPublicPath(source: string): string | null {
  if (!source.startsWith("/")) return null;
  return path.join(process.cwd(), "public", source.replace(/^\/+/, ""));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(targetPath: string, content: string | Buffer): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

class MediaCache {
  private readonly pending = new Map<string, Promise<string>>();
  private ephemeralSequence = 0;

  constructor(private readonly directory: string) {}

  resolve(source: string): Promise<string> {
    const existing = this.pending.get(source);
    if (existing) return existing;

    const pending = this.resolveUncached(source);
    this.pending.set(source, pending);
    return pending;
  }

  private async resolveUncached(source: string): Promise<string> {
    const localPath = localPublicPath(source);
    if (localPath) {
      if (!(await pathExists(localPath))) {
        throw new Error(`Missing public social-card asset: ${source}`);
      }
      return localPath;
    }

    const url = new URL(source);
    if (url.protocol !== "https:") {
      throw new Error(`Social-card media must use HTTPS: ${source}`);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Failed to download ${source}: HTTP ${response.status}`);
    }
    const outputPath = path.join(
      this.directory,
      createHash("sha256").update(source).digest("hex"),
    );
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    return outputPath;
  }

  async withEphemeral<T>(
    source: string,
    use: (filePath: string) => Promise<T>,
  ): Promise<T> {
    const localPath = localPublicPath(source);
    if (localPath) {
      if (!(await pathExists(localPath))) {
        throw new Error(`Missing public social-card asset: ${source}`);
      }
      return await use(localPath);
    }

    const url = new URL(source);
    if (url.protocol !== "https:") {
      throw new Error(`Social-card media must use HTTPS: ${source}`);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Failed to download ${source}: HTTP ${response.status}`);
    }
    this.ephemeralSequence += 1;
    const outputPath = path.join(
      this.directory,
      `ephemeral-${process.pid}-${this.ephemeralSequence}-${createHash("sha256").update(source).digest("hex")}`,
    );
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    try {
      return await use(outputPath);
    } finally {
      await rm(outputPath, { force: true });
    }
  }
}

async function isLandscape(
  replication: ReplicationRow,
  mediaCache: MediaCache,
): Promise<boolean> {
  const width = Number(replication.width);
  const height = Number(replication.height);
  if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
    return width > height;
  }

  const source = mediaSource(replication);
  if (!source) return false;
  const metadata = await sharp(await mediaCache.resolve(source)).metadata();
  return Boolean(metadata.width && metadata.height && metadata.width > metadata.height);
}

async function firstLandscape(
  replications: readonly ReplicationRow[],
  mediaCache: MediaCache,
): Promise<ReplicationRow | null> {
  for (const replication of replications) {
    if (!mediaSource(replication)) continue;
    try {
      if (await isLandscape(replication, mediaCache)) return replication;
    } catch (error) {
      console.warn(
        `[entity-social-cards] Skipping unavailable media for ${replication.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return null;
}

async function firstAvailable(
  replications: readonly ReplicationRow[],
  mediaCache: MediaCache,
): Promise<ReplicationRow | null> {
  for (const replication of replications) {
    const source = mediaSource(replication);
    if (!source) continue;
    try {
      await mediaCache.resolve(source);
      return replication;
    } catch {
      // The landscape pass already reports unavailable candidates.
    }
  }
  return null;
}

function orderEffectReplications(
  effect: EffectRow,
  allReplications: readonly ReplicationRow[],
  bySlug: ReadonlyMap<string, ReplicationRow>,
): ReplicationRow[] {
  const matching = allReplications.filter(
    (replication) => text(replication.effect_slug) === effect.slug,
  );
  const ordered: ReplicationRow[] = [];
  const seen = new Set<string>();
  for (const slug of strings(effect.gallery_order)) {
    const replication = bySlug.get(slug);
    if (replication && text(replication.effect_slug) === effect.slug) {
      ordered.push(replication);
      seen.add(replication.slug);
    }
  }
  for (const replication of matching) {
    if (!seen.has(replication.slug)) ordered.push(replication);
  }
  return ordered;
}

function findProfile(
  profiles: readonly ProfileRow[],
  creator: string,
): ProfileRow | null {
  return findContributorProfileByAuthorName(profiles, creator);
}

async function optionalMediaPath(
  source: string | null | undefined,
  mediaCache: MediaCache,
): Promise<string | undefined> {
  const normalized = text(source);
  if (!normalized) return undefined;
  try {
    return await mediaCache.resolve(normalized);
  } catch (error) {
    console.warn(
      `[entity-social-cards] Optional asset unavailable: ${normalized} (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}

function replicationRights(
  replication: ReplicationRow,
): ReplicationSocialCardInput["rights"] {
  const licenseName = text(replication.license_name);
  if (licenseName) {
    return {
      licenseName,
      licenseUrl: text(replication.license_url) || undefined,
      rightsholder: text(replication.rightsholder) || undefined,
    };
  }

  const rightsStatus = text(replication.rights_status).toLowerCase();
  return {
    licenseName: rightsStatus.includes("public")
      ? "Public domain"
      : "Rights remain with original creator",
    rightsholder:
      text(replication.rightsholder) || text(replication.artist) || undefined,
  };
}

function reportExcerpt(report: ReportRow): {
  excerpt: string;
  context?: string;
} {
  const phases: Array<[string, TimelineEntry[] | null | undefined]> = [
    ["Peak", report.peak],
    ["Onset", report.onset],
    ["Offset", report.offset],
  ];
  for (const [phase, entries] of phases) {
    const first = entries?.find((entry) => text(entry.description));
    if (first) {
      const time = text(first.time);
      return {
        excerpt: text(first.description),
        context: time ? `${time} · ${phase}` : phase,
      };
    }
  }
  return {
    excerpt: text(report.introduction) || text(report.conclusion) || report.title,
  };
}

async function rendererSourceDigests(): Promise<Record<EntityKind, string>> {
  const entries = await Promise.all(
    (Object.keys(rendererInputPaths) as EntityKind[]).map(async (kind) => {
      const hash = createHash("sha256").update(rendererVersions[kind]);
      for (const inputPath of [
        ...rendererInputPaths[kind],
        "src/assets/dosewiki-logo.svg",
        "public/fonts/Blinker-Regular.ttf",
        "public/fonts/Blinker-SemiBold.ttf",
      ]) {
        hash.update("\0").update(inputPath).update("\0");
        hash.update(await readFile(path.join(process.cwd(), inputPath)));
      }
      return [kind, hash.digest("hex")] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<EntityKind, string>;
}

async function assetRevision(
  source: string,
  mediaCache: MediaCache,
): Promise<string> {
  const localPath = localPublicPath(source);
  if (localPath) {
    return createHash("sha256").update(await readFile(localPath)).digest("hex");
  }
  const immutableDigest = contentAddressedSha256(source);
  if (immutableDigest) return immutableDigest;
  return createHash("sha256")
    .update(await readFile(await mediaCache.resolve(source)))
    .digest("hex");
}

async function jobDigest(
  job: RenderJob,
  sourceDigests: Record<EntityKind, string>,
  mediaCache: MediaCache,
): Promise<string> {
  const assets = await Promise.all(
    [...new Set(job.assetSources.filter(Boolean))].map((source) =>
      assetRevision(source, mediaCache),
    ),
  );
  return createHash("sha256")
    .update(
      JSON.stringify({
        rendererVersion: rendererVersions[job.kind],
        rendererSourceDigest: sourceDigests[job.kind],
        source: job.digestSource,
        assets,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

async function buildEffectJobs(
  effects: readonly EffectRow[],
  replications: readonly ReplicationRow[],
  profiles: readonly ProfileRow[],
  mediaCache: MediaCache,
): Promise<RenderJob[]> {
  const bySlug = new Map(replications.map((replication) => [replication.slug, replication]));
  const jobs: RenderJob[] = [];

  for (const effect of effects) {
    const slug = assertSlug(effect.slug, "effects");
    const ordered = orderEffectReplications(effect, replications, bySlug);
    const featured = await firstLandscape(ordered, mediaCache);
    const artworkSource = featured ? mediaSource(featured) : null;
    const creator = featured
      ? text(featured.artist) || text(featured.rightsholder) || "Original creator"
      : "";
    const creatorProfile = creator ? findProfile(profiles, creator) : null;
    const avatarSource = text(creatorProfile?.avatarUrl) || null;
    const artworkPath = await optionalMediaPath(artworkSource, mediaCache);
    const resolvedArtworkSource = artworkPath ? artworkSource : null;
    const avatarPath = await optionalMediaPath(avatarSource, mediaCache);
    const resolvedAvatarSource = avatarPath ? avatarSource : null;
    const taxonomy = strings(effect.tags).map(titleCase);
    const input: SubjectiveEffectSocialCardInput = {
      name: text(effect.name) || titleCase(slug),
      slug,
      iconName: EFFECT_ICON,
      summary: text(effect.summary) || `${text(effect.name) || titleCase(slug)} is a documented subjective effect.`,
      taxonomy: (taxonomy.length > 0 ? taxonomy : ["Subjective effect"]) as [
        string,
        ...string[],
      ],
      context:
        ordered.length > 0
          ? [
              {
                label: `${ordered.length} indexed replication${ordered.length === 1 ? "" : "s"}`,
                iconName: "hugeicons:camera-ai",
              },
            ]
          : undefined,
      landscapeReplication:
        featured && artworkPath
          ? {
              slug: featured.slug,
              title: text(featured.title) || titleCase(featured.slug),
              creatorLabel: creator,
              media: { filePath: artworkPath },
              creatorAvatar: avatarPath ? { filePath: avatarPath } : undefined,
            }
          : undefined,
    };
    jobs.push({
      kind: "effects",
      slug,
      digestSource: {
        effect,
        featuredReplicationSlug: artworkPath ? (featured?.slug ?? null) : null,
        artworkSource: resolvedArtworkSource,
        avatarSource: resolvedAvatarSource,
      },
      assetSources: [resolvedArtworkSource ?? "", resolvedAvatarSource ?? ""],
      render: () => renderSubjectiveEffectSocialCardPng(input),
    });
  }
  return jobs;
}

async function buildReplicationJobs(
  replications: readonly ReplicationRow[],
  effectsBySlug: ReadonlyMap<string, EffectRow>,
  profiles: readonly ProfileRow[],
  mediaCache: MediaCache,
): Promise<RenderJob[]> {
  const jobs: RenderJob[] = [];
  for (const replication of replications) {
    const slug = assertSlug(replication.slug, "replications");
    const artworkSource = mediaSource(replication);
    const creator =
      text(replication.artist) ||
      text(replication.rightsholder) ||
      "Original creator";
    const profile = findProfile(profiles, creator);
    const avatarSource = text(profile?.avatarUrl) || null;
    const effectSlug = text(replication.effect_slug);
    const effect = effectsBySlug.get(effectSlug);
    jobs.push({
      kind: "replications",
      slug,
      digestSource: {
        replication,
        artworkSource,
        avatarSource,
      },
      assetSources: [
        artworkSource ?? "",
        avatarSource ?? "",
      ],
      render: async () => {
        const creatorAvatarPath = await optionalMediaPath(avatarSource, mediaCache);
        const render = async (artworkPath?: string) => {
          const input: ReplicationSocialCardInput = {
            slug,
            recordId: text(replication._id) || slug,
            title: text(replication.title) || titleCase(slug),
            creator,
            effect: {
              slug: effectSlug || "effects",
              name:
                text(effect?.name) ||
                titleCase(effectSlug || "Subjective effect"),
            },
            mediaType: replication.type === "video" ? "video" : "image",
            format: text(replication.format) || undefined,
            artworkPath,
            creatorAvatarPath,
            sourceUrl:
              text(replication.source_url) ||
              artworkSource ||
              `/replications/${slug}`,
            rights: replicationRights(replication),
          };
          return await renderReplicationSocialCardPng(input);
        };
        return artworkSource
          ? await mediaCache.withEphemeral(artworkSource, render)
          : await render();
      },
    });
  }
  return jobs;
}

async function buildReportJobs(
  reports: readonly ReportRow[],
  profiles: readonly ProfileRow[],
  mediaCache: MediaCache,
): Promise<RenderJob[]> {
  const jobs: RenderJob[] = [];
  for (const report of reports) {
    const slug = assertSlug(report.slug, "reports");
    const author = text(report.subject?.name) || "Anonymous";
    const profile = findProfile(profiles, author);
    const avatarSource =
      text(report.subject?.avatar_url) || text(profile?.avatarUrl) || null;
    const avatarPath = await optionalMediaPath(avatarSource, mediaCache);
    const resolvedAvatarSource = avatarPath ? avatarSource : null;
    const excerpt = reportExcerpt(report);
    const input: TripReportSocialCardInput = {
      title: text(report.title) || titleCase(slug),
      author,
      avatar: avatarPath ? { filePath: avatarPath } : undefined,
      substances: (report.substances ?? [])
        .map((substance) => ({
          name: text(substance.name),
          dose: text(substance.dose) || undefined,
          roa: text(substance.roa) || undefined,
        }))
        .filter((substance) => substance.name.length > 0),
      excerpt: excerpt.excerpt,
      excerptContext: excerpt.context,
      date: text(report.subject?.trip_date) || undefined,
      tags: strings(report.tags),
    };
    jobs.push({
      kind: "reports",
      slug,
      digestSource: { report, avatarSource: resolvedAvatarSource },
      assetSources: [resolvedAvatarSource ?? ""],
      render: () => renderTripReportSocialCardPng(input),
    });
  }
  return jobs;
}

async function buildProfileJobs(
  profiles: readonly ProfileRow[],
  replicationsBySlug: ReadonlyMap<string, ReplicationRow>,
  mediaCache: MediaCache,
): Promise<RenderJob[]> {
  const jobs: RenderJob[] = [];
  for (const profile of profiles) {
    const slug = assertSlug(profile.key.toLowerCase(), "contributors");
    const orderedReplications = strings(profile.replicationOrder)
      .map((replicationSlug) => replicationsBySlug.get(replicationSlug))
      .filter((replication): replication is ReplicationRow => Boolean(replication));
    const featured =
      (await firstLandscape(orderedReplications, mediaCache)) ??
      (await firstAvailable(orderedReplications, mediaCache));
    const artworkSource = featured ? mediaSource(featured) : null;
    const avatarSource = text(profile.avatarUrl) || null;
    const avatarPath = await optionalMediaPath(avatarSource, mediaCache);
    const resolvedAvatarSource = avatarPath ? avatarSource : null;
    const artworkPath = await optionalMediaPath(artworkSource, mediaCache);
    const resolvedArtworkSource = artworkPath ? artworkSource : null;
    const input: UserProfileSocialCardInput = {
      displayName: text(profile.displayName) || titleCase(slug),
      bioExcerpt: text(profile.bio),
      roles: [text(profile.role) || "Contributor"],
      avatar: avatarPath ? { filePath: avatarPath } : undefined,
      featuredReplication:
        featured && artworkPath
          ? {
              slug: featured.slug,
              title: text(featured.title) || titleCase(featured.slug),
              creatorLabel:
                text(featured.artist) || text(featured.rightsholder) || profile.displayName,
              media: { filePath: artworkPath },
            }
          : undefined,
    };
    jobs.push({
      kind: "contributors",
      slug,
      digestSource: {
        profile,
        featuredReplicationSlug: artworkPath ? (featured?.slug ?? null) : null,
        artworkSource: resolvedArtworkSource,
        avatarSource: resolvedAvatarSource,
      },
      assetSources: [resolvedArtworkSource ?? "", resolvedAvatarSource ?? ""],
      render: () => renderUserProfileSocialCardPng(input),
    });
  }
  return jobs;
}

async function renderJobs(
  jobs: readonly RenderJob[],
  sourceDigests: Record<EntityKind, string>,
  generatedKinds: ReadonlySet<EntityKind>,
  mediaCache: MediaCache,
): Promise<{
  cards: Record<EntityKind, Record<string, string>>;
  renderedCards: Map<string, RenderedCard>;
}> {
  const cards: Record<EntityKind, Map<string, string>> = {
    effects: new Map(),
    replications: new Map(),
    reports: new Map(),
    contributors: new Map(),
  };
  const expectedFiles: Record<EntityKind, Set<string>> = {
    effects: new Set(),
    replications: new Set(),
    reports: new Set(),
    contributors: new Set(),
  };
  let cursor = 0;
  let rendered = 0;
  let reused = 0;
  const failures: string[] = [];
  const renderedCards = new Map<string, RenderedCard>();

  const workers = Array.from({ length: RENDER_CONCURRENCY }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const job = jobs[index];
      if (!job) return;

      try {
        const digest = await jobDigest(job, sourceDigests, mediaCache);
        const filename = `${job.slug}.${digest}.jpg`;
        const kindDirectory = path.join(OUTPUT_ROOT, job.kind);
        const outputPath = path.join(kindDirectory, filename);
        cards[job.kind].set(
          job.slug,
          `${MANIFEST_PUBLIC_PREFIX}/${job.kind}/${filename}`,
        );
        expectedFiles[job.kind].add(filename);
        if (await pathExists(outputPath)) {
          reused += 1;
        } else {
          const png = await job.render();
          const jpeg = await sharp(png)
            .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
            .toBuffer();
          await writeAtomic(outputPath, jpeg);
          rendered += 1;
        }
        const output = await readFile(outputPath);
        const metadata = await sharp(output).metadata();
        renderedCards.set(`${job.kind}/${job.slug}`, {
          path: path.posix.join(job.kind, filename),
          width: metadata.width ?? 0,
          height: metadata.height ?? 0,
          byteSize: output.byteLength,
          sha256: createHash("sha256").update(output).digest("hex"),
        });
        if ((rendered + reused) % 25 === 0) {
          console.log(
            `[entity-social-cards] ${rendered + reused}/${jobs.length} complete (${rendered} rendered, ${reused} reused)`,
          );
        }
      } catch (error) {
        failures.push(
          `${job.kind}/${job.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });
  await Promise.all(workers);
  if (failures.length > 0) {
    throw new Error(
      `Failed to generate ${failures.length} entity social card(s):\n${failures.join("\n")}`,
    );
  }

  let staleCount = 0;
  for (const kind of Object.keys(cards) as EntityKind[]) {
    if (!generatedKinds.has(kind)) continue;
    const directory = path.join(OUTPUT_ROOT, kind);
    const staleFiles = (await readdir(directory)).filter(
      (filename) =>
        /\.(?:jpe?g|png|webp)$/i.test(filename) &&
        !expectedFiles[kind].has(filename),
    );
    await Promise.all(staleFiles.map((filename) => rm(path.join(directory, filename))));
    staleCount += staleFiles.length;
  }

  console.log(
    `[entity-social-cards] Complete: ${jobs.length} cards (${rendered} rendered, ${reused} reused, ${staleCount} stale removed).`,
  );
  const renderedManifest = Object.fromEntries(
    (Object.keys(cards) as EntityKind[]).map((kind) => [
      kind,
      Object.fromEntries(
        [...cards[kind].entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    ]),
  ) as Record<EntityKind, Record<string, string>>;
  return { cards: renderedManifest, renderedCards };
}

async function main(): Promise<void> {
  if (process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex") {
    console.log(
      "[entity-social-cards] Effect Index build: dose.wiki entity cards are not referenced; skipping generation.",
    );
    return;
  }

  const { client, fingerprint: deploymentName } = createDataClient();
  const expected = getFlagValue(process.argv.slice(2), "--expected-deployment");
  if (!expected || expected !== deploymentName) {
    throw new Error(`Entity social cards require --expected-deployment=${deploymentName} for the selected Postgres source.`);
  }
  console.log(`[entity-social-cards] Reading public entities from ${deploymentName}...`);
  const [rawEffects, rawReplications, rawReports, rawProfiles] = await Promise.all([
    client.query(api.subjectiveEffects.getPublicPreviews, {}),
    client.query(api.replications.getPublicReplications, {}),
    client.query(api.tripReports.getAll, {}),
    client.query(api.contributorProfiles.getAll, {}),
  ]);
  const effects = (rawEffects as EffectRow[]).sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  const allReplications = (rawReplications as ReplicationRow[]).sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  const replications = allReplications.filter(
    (replication) => replicationExclusionReason(replication) === null,
  );
  const reports = (rawReports as ReportRow[]).sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  const profiles = (rawProfiles as ProfileRow[]).sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  for (const kind of ["effects", "replications", "reports", "contributors"] as const) {
    await mkdir(path.join(OUTPUT_ROOT, kind), { recursive: true });
  }
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "dosewiki-social-cards-"));
  const mediaCache = new MediaCache(temporaryDirectory);

  try {
    const effectsBySlug = new Map(effects.map((effect) => [effect.slug, effect]));
    const replicationsBySlug = new Map(
      replications.map((replication) => [replication.slug, replication]),
    );
    const [effectJobs, replicationJobs, reportJobs, profileJobs, sourceDigests] =
      await Promise.all([
        buildEffectJobs(effects, replications, profiles, mediaCache),
        GENERATE_REPLICATION_CARDS
          ? buildReplicationJobs(replications, effectsBySlug, profiles, mediaCache)
          : Promise.resolve([]),
        buildReportJobs(reports, profiles, mediaCache),
        buildProfileJobs(profiles, replicationsBySlug, mediaCache),
        rendererSourceDigests(),
      ]);
    if (!GENERATE_REPLICATION_CARDS) {
      console.log(
        "[entity-social-cards] Per-replication cards skipped; routes use the Replications page card. Set GENERATE_REPLICATION_SOCIAL_CARDS=1 for an offline full rebuild.",
      );
    }
    const generatedKinds = new Set<EntityKind>([
      "effects",
      "reports",
      "contributors",
      ...(GENERATE_REPLICATION_CARDS ? (["replications"] as const) : []),
    ]);
    const { cards, renderedCards } = await renderJobs(
      [...effectJobs, ...replicationJobs, ...reportJobs, ...profileJobs],
      sourceDigests,
      generatedKinds,
      mediaCache,
    );
    if (!GENERATE_REPLICATION_CARDS && (await pathExists(MANIFEST_PATH))) {
      const existingManifest = JSON.parse(
        await readFile(MANIFEST_PATH, "utf8"),
      ) as EntitySocialCardManifest;
      const eligibleSlugs = new Set(replications.map((replication) => replication.slug));
      cards.replications = Object.fromEntries(
        Object.entries(existingManifest.cards.replications).filter(([slug]) =>
          eligibleSlugs.has(slug),
        ),
      );
    }
    const manifest: EntitySocialCardManifest = {
      version: 1,
      rendererVersions,
      cards,
    };
    await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    if (COVERAGE_PATH) {
      const rows = allReplications.map((replication) => {
        const exclusionReason = replicationExclusionReason(replication);
        const output = renderedCards.get(`replications/${replication.slug}`);
        const source = mediaSource(replication);
        return {
          replicationId: text(replication._id) || null,
          slug: replication.slug,
          mediaType: replication.type ?? null,
          sourceSha256: text(replication.source_sha256) || null,
          source,
          selectedSourceKind: mediaSourceKind(replication),
          selectedSourceSha256: contentAddressedSha256(source),
          status: exclusionReason
            ? "excluded"
            : output
              ? "generated"
              : GENERATE_REPLICATION_CARDS
                ? "missing-output"
                : "generation-disabled",
          exclusionReason,
          card: output
            ? {
                path: output.path,
                width: output.width,
                height: output.height,
                byteSize: output.byteSize,
                sha256: output.sha256,
                manifestUrl: cards.replications[replication.slug],
              }
            : null,
        };
      });
      const counts = rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.status] = (totals[row.status] ?? 0) + 1;
        return totals;
      }, {});
      const coverage = {
        schemaVersion: 1,
        sourceDeployment: deploymentName,
        rendererVersion: rendererVersions.replications,
        policy: {
          eligible:
            "role=replication, not duplicate-suppressed, replication_status!=not-replication, image/video, primary media URL present",
          heldRecentRedditStaticThumbnails:
            "Excluded upstream from production import; no held item may be selected as a card source.",
        },
        counts: {
          datasetRows: rows.length,
          publicationEligible: rows.filter((row) => !row.exclusionReason).length,
          excluded: rows.filter((row) => row.exclusionReason).length,
          ...counts,
        },
        rows,
      };
      await mkdir(path.dirname(COVERAGE_PATH), { recursive: true });
      await writeAtomic(COVERAGE_PATH, `${JSON.stringify(coverage, null, 2)}\n`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
