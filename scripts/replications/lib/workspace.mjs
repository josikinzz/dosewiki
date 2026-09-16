import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import {
  applyGalleryOrderMappingsToMetadata,
  buildGalleryOrderByEffect,
  canonicalizeEffectSlug,
} from "./reconciliation.mjs";

const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"]
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"]
const DEFAULT_REPLICATION_RIGHTS_STATUS = "creator-retained"
export const DEFAULT_REPLICATION_PERMISSION_NOTES =
  "Rights remain with the original creator or rightsholder unless an individual item states a different license.";
export const DEFAULT_REPLICATION_REMOVAL_CONTACT =
  "Contact dose.wiki to correct credit, update source links, or request removal.";

const REPLICATION_METADATA_COMPARE_FIELDS = [
  "title",
  "artist",
  "artist_url",
  "type",
  "effect_slug",
  "format",
  "width",
  "height",
  "duration",
  "rights_status",
  "license_name",
  "license_url",
  "credit_line",
  "source_url",
  "rightsholder",
  "permission_notes",
  "removal_contact",
];

export const DEFAULT_EFFECT_FOLDER_SLUGS = {
  breathing: "breathing",
  "closed eye visuals": "closed-eye-visuals",
  "color modulation": "color-modulation",
  "external hallucinations": "external-hallucinations",
  geometry: "visual-geometry",
  "hallucinatory entity": "hallucinatory-entities",
  "internal hallucinations": "internal-hallucinations",
  "loss of contact with reality": "loss-of-contact-with-reality",
  "open eye visuals": "open-eye-visuals",
  "symmetrical texture repetition": "symmetrical-texture-repetition",
  "visual amplifications": "visual-acuity-enhancement",
  "visual distortions": "visual-distortions",
  "visual drifting": "visual-drifting",
  "visual flowing": "melting",
  "visual recursion": "recursion",
  "visual trails": "tracers",
};

function parseReplicationFilename(filename) { const nameWithoutExt = filename.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, "");

if (nameWithoutExt.includes(" by ")) {
  const [title, artist] = nameWithoutExt.split(" by ").map((part) => part.trim());
  return { title, artist };
}

return { title: nameWithoutExt, artist: "Unknown" }; }

export function generateReplicationSlug(title, artist) {
  return `${title}-${artist}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function hasKnownReplicationCreator(artist) { const normalized = String(artist ?? "").trim().toLowerCase();
return normalized.length > 0 && normalized !== "unknown"; }

function buildReplicationCreditLine(replication) { const title = String(replication.title ?? "").trim();
const artist = String(replication.artist ?? "").trim();

if (title && hasKnownReplicationCreator(artist)) {
  return `${title} by ${artist}`;
}

if (title) {
  return `${title} (creator unknown)`;
}

if (hasKnownReplicationCreator(artist)) {
  return `Replication by ${artist}`;
}

return "Replication media (creator unknown)"; }

export function withDefaultReplicationRights(replication) {
  const artist = String(replication.artist ?? "").trim();
  const defaults = {
    rights_status: DEFAULT_REPLICATION_RIGHTS_STATUS,
    credit_line: buildReplicationCreditLine(replication),
    permission_notes: DEFAULT_REPLICATION_PERMISSION_NOTES,
    removal_contact: DEFAULT_REPLICATION_REMOVAL_CONTACT,
  };

  if (hasKnownReplicationCreator(artist)) {
    defaults.rightsholder = artist;
  }

  return {
    ...replication,
    ...Object.fromEntries(
      Object.entries(defaults).filter(([key]) => replication[key] === undefined || replication[key] === ""),
    ),
  };
}

function normalizedBasename(value) {
  if (!value) {
    return "";
  }

  const basename = String(value).split("/").pop() ?? "";
  let decoded = basename;
  try {
    decoded = decodeURIComponent(basename);
  } catch {
    decoded = basename.replace(/%20/g, " ");
  }

  return decoded
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp|gif|mp4|mov|webm|m4v|ogg|mp3)$/i, "")
    .replace(/[\s_-]+/g, "");
}

function createEffectIndexReplicationLookup(effectIndexReplications = []) { const byResourceBasename = new Map();

for (const replication of effectIndexReplications) {
  const key = normalizedBasename(replication.resource);
  if (key && !byResourceBasename.has(key)) {
    byResourceBasename.set(key, replication);
  }
}

return byResourceBasename; }

export function enrichReplicationMetadataFromEffectIndexDump(replications = [], effectIndexReplications = []) {
  const lookup = createEffectIndexReplicationLookup(effectIndexReplications);
  const stats = {
    total: replications.length,
    matched: 0,
    artistUpdated: 0,
    titleUpdated: 0,
    artistUrlAdded: 0,
    sourceUrlAdded: 0,
    defaultRightsAdded: 0,
  };

  const enriched = replications.map((replication) => {
    const match = lookup.get(normalizedBasename(replication.filename));
    const next = { ...replication };

    if (match) {
      stats.matched++;

      if (match.artist && !hasKnownReplicationCreator(next.artist)) {
        next.artist = match.artist;
        stats.artistUpdated++;
      }

      if (match.title && match.title !== next.title) {
        next.title = match.title;
        stats.titleUpdated++;
      }

      if (match.artist_url && !next.artist_url) {
        next.artist_url = match.artist_url;
        stats.artistUrlAdded++;
      }

      if (match.resource && !next.source_url) {
        next.source_url = match.resource;
        stats.sourceUrlAdded++;
      }
    }

    if (!next.rights_status) {
      stats.defaultRightsAdded++;
    }

    return withDefaultReplicationRights(next);
  });

  return { replications: enriched, stats };
}

export function getReplicationFileInfo(filePath, isVideo) {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    if (isVideo) {
      const result = spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,duration",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          filePath,
        ],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );

      if (result.status === 0 && result.stdout) {
        const [width, height, duration] = result.stdout
          .trim()
          .split("\n")[0]
          .split(",")
          .map((value) => {
            const parsed = Number.parseFloat(value);
            return Number.isNaN(parsed) ? undefined : parsed;
          });

        return {
          width: width ? Math.round(width) : undefined,
          height: height ? Math.round(height) : undefined,
          duration: duration ? Number.parseFloat(duration) : undefined,
          fileSize,
        };
      }
    } else {
      const result = spawnSync("identify", ["-format", "%wx%h", filePath], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (result.status === 0 && result.stdout) {
        const [width, height] = result.stdout
          .trim()
          .split("x")
          .map((value) => Number.parseInt(value, 10));

        return {
          width: Number.isNaN(width) ? undefined : width,
          height: Number.isNaN(height) ? undefined : height,
          fileSize,
        };
      }
    }

    return { fileSize };
  } catch {
    return {};
  }
}

export function scanSourceMedia({
  videosDir,
  imagesDir,
  effectSlugMap = DEFAULT_EFFECT_FOLDER_SLUGS,
  getFileInfo = getReplicationFileInfo,
  fsAdapter = fs,
  pathAdapter = path,
} = {}) {
  if (!videosDir || !imagesDir) {
    throw new Error("scanSourceMedia requires videosDir and imagesDir.");
  }

  const replications = [];
  const warnings = [];

  for (const folder of fsAdapter.readdirSync(videosDir)) {
    const folderPath = pathAdapter.join(videosDir, folder);
    if (!fsAdapter.statSync(folderPath).isDirectory()) {
      continue;
    }

    const effectSlug = canonicalizeEffectSlug(effectSlugMap[folder]);
    if (!effectSlug) {
      warnings.push(`No mapping found for effect folder: "${folder}"`);
      continue;
    }

    for (const filename of fsAdapter.readdirSync(folderPath)) {
      const ext = pathAdapter.extname(filename).toLowerCase().slice(1);
      if (!VIDEO_EXTENSIONS.includes(ext)) {
        continue;
      }

      const filePath = pathAdapter.join(folderPath, filename);
      const { title, artist } = parseReplicationFilename(filename);
      const slug = generateReplicationSlug(title, artist);

      replications.push(withDefaultReplicationRights({
        slug,
        title,
        artist,
        type: "video",
        effect_slug: effectSlug,
        folder_name: folder,
        filename,
        format: ext,
        ...getFileInfo(filePath, true),
      }));
    }
  }

  for (const filename of fsAdapter.readdirSync(imagesDir)) {
    const ext = pathAdapter.extname(filename).toLowerCase().slice(1);
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      continue;
    }

    const filePath = pathAdapter.join(imagesDir, filename);
    const { title, artist } = parseReplicationFilename(filename);
    const slug = generateReplicationSlug(title, artist);

    replications.push(withDefaultReplicationRights({
      slug,
      title,
      artist,
      type: "image",
      effect_slug: null,
      folder_name: null,
      filename,
      format: ext,
      ...getFileInfo(filePath, false),
    }));
  }

  const sortedReplications = replications.sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalReplications: sortedReplications.length,
      videoCount: sortedReplications.filter((replication) => replication.type === "video").length,
      imageCount: sortedReplications.filter((replication) => replication.type === "image").length,
      videosWithEffectMapping: sortedReplications.filter(
        (replication) => replication.type === "video" && replication.effect_slug,
      ).length,
      imagesNeedingManualMapping: sortedReplications.filter(
        (replication) => replication.type === "image" && !replication.effect_slug,
      ).length,
    },
    replications: sortedReplications,
    warnings,
  };
}

export function reconcileReplicationMetadata(replications, galleryOrderMapping = new Map()) {
  const reconciled = replications.map((replication) =>
    withDefaultReplicationRights({
      ...replication,
      effect_slug: canonicalizeEffectSlug(replication.effect_slug),
    }),
  );

  const assigned = applyGalleryOrderMappingsToMetadata(reconciled, galleryOrderMapping);
  return { replications: reconciled, assigned };
}

export function deriveGalleryOrderFromMetadata(replications, galleryOrderMapping = new Map()) {
  return buildGalleryOrderByEffect(replications, galleryOrderMapping);
}

export function planGalleryOrderMutations({
  replications = [],
  galleryOrderMapping = new Map(),
  currentEffects = [],
} = {}) {
  const { replications: reconciledReplications } = reconcileReplicationMetadata(replications, galleryOrderMapping);
  const galleryOrderByEffect = deriveGalleryOrderFromMetadata(reconciledReplications, galleryOrderMapping);
  const currentEffectSlugs = new Set(currentEffects.map((effect) => effect.slug));

  const effects = [...galleryOrderByEffect.entries()]
    .filter(([effectSlug, replicationSlugs]) => replicationSlugs.length > 0 && currentEffectSlugs.has(effectSlug))
    .sort(([left], [right]) => left.localeCompare(right));

  const legacyOnlyEffects = [...galleryOrderByEffect.entries()]
    .filter(([effectSlug, replicationSlugs]) => replicationSlugs.length > 0 && !currentEffectSlugs.has(effectSlug))
    .map(([effectSlug]) => effectSlug)
    .sort();

  const staleEffects = currentEffects
    .filter(
      (effect) =>
        Array.isArray(effect.gallery_order) &&
        effect.gallery_order.length > 0 &&
        !galleryOrderByEffect.has(effect.slug),
    )
    .map((effect) => effect.slug)
    .sort();

  return {
    effects,
    legacyOnlyEffects,
    staleEffects,
    galleryOrderByEffect,
    reconciledReplications,
  };
}

function isPlaceholderStorageId(storageId) { return !storageId || storageId.startsWith("placeholder-"); }

export function planReplicationMediaChanges({
  desiredReplications = [],
  currentReplications = [],
  currentEffects = [],
  galleryOrderMapping = new Map(),
} = {}) {
  const { reconciledReplications, effects, staleEffects } = planGalleryOrderMutations({
    replications: desiredReplications,
    galleryOrderMapping,
    currentEffects,
  });
  const currentBySlug = new Map(currentReplications.map((replication) => [replication.slug, replication]));

  const create = [];
  const update = [];
  const upload = [];
  const noop = [];

  for (const desired of reconciledReplications) {
    const current = currentBySlug.get(desired.slug);
    if (!current) {
      create.push(desired);
      if (isPlaceholderStorageId(desired.storage_id)) {
        upload.push({ slug: desired.slug, reason: "missing-storage" });
      }
      continue;
    }

    const changes = {};
    for (const field of REPLICATION_METADATA_COMPARE_FIELDS) {
      if (desired[field] !== undefined && desired[field] !== current[field]) {
        changes[field] = { from: current[field] ?? null, to: desired[field] };
      }
    }

    if (isPlaceholderStorageId(current.storage_id)) {
      upload.push({ slug: desired.slug, reason: "placeholder-storage" });
    }

    if (Object.keys(changes).length > 0) {
      update.push({ slug: desired.slug, id: current._id, changes });
    } else {
      noop.push(desired.slug);
    }
  }

  return {
    create,
    update,
    upload,
    staleGallery: staleEffects,
    galleryOrder: effects,
    noop,
  };
}

export function createReplicationMediaAdapter({ client, api, apiKey }) {
  if (!client || !api || !apiKey) {
    throw new Error("createReplicationMediaAdapter requires client, api, and apiKey.");
  }

  return {
    async updateEffectSlug({ slug, effect_slug }) {
      return await client.mutation(api.replications.updateEffectSlug, {
        apiKey,
        slug,
        effect_slug,
      });
    },

    async updateRightsMetadata({ slug, updates }) {
      return await client.mutation(api.replications.updateRightsMetadata, {
        apiKey,
        slug,
        updates,
      });
    },

    async updateGalleryOrder({ effect_slug, replication_slugs }) {
      const baseline = await client.query(api.replicationContextualEditing.collectionDetail, {
        apiKey, targetKind: "effect", targetKey: effect_slug,
      });
      return await client.mutation(api.replications.updateGalleryOrder, {
        apiKey,
        effect_slug,
        replication_slugs,
        expectedRevision: baseline.revision,
      });
    },

    async clearGalleryOrder(effectSlug) {
      const baseline = await client.query(api.replicationContextualEditing.collectionDetail, {
        apiKey, targetKind: "effect", targetKey: effectSlug,
      });
      return await client.mutation(api.replications.updateGalleryOrder, {
        apiKey, effect_slug: effectSlug, replication_slugs: [], expectedRevision: baseline.revision,
      });
    },
  };
}
