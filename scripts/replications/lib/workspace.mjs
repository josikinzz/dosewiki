import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import {
  applyGalleryOrderMappingsToMetadata,
  buildGalleryOrderByEffect,
  canonicalizeEffectSlug,
} from "./reconciliation.mjs";

export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

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

export function parseReplicationFilename(filename) {
  const nameWithoutExt = filename.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, "");

  if (nameWithoutExt.includes(" by ")) {
    const [title, artist] = nameWithoutExt.split(" by ").map((part) => part.trim());
    return { title, artist };
  }

  return { title: nameWithoutExt, artist: "Unknown" };
}

export function generateReplicationSlug(title, artist) {
  return `${title}-${artist}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
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

      replications.push({
        slug,
        title,
        artist,
        type: "video",
        effect_slug: effectSlug,
        folder_name: folder,
        filename,
        format: ext,
        ...getFileInfo(filePath, true),
      });
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

    replications.push({
      slug,
      title,
      artist,
      type: "image",
      effect_slug: null,
      folder_name: null,
      filename,
      format: ext,
      ...getFileInfo(filePath, false),
    });
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
  const reconciled = replications.map((replication) => ({
    ...replication,
    effect_slug: canonicalizeEffectSlug(replication.effect_slug),
  }));

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

export function isPlaceholderStorageId(storageId) {
  return !storageId || storageId.startsWith("placeholder-");
}

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
    for (const field of ["title", "artist", "type", "effect_slug", "format", "width", "height", "duration"]) {
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

export function createConvexReplicationMediaAdapter({ client, api, apiKey, fetchFn = fetch }) {
  if (!client || !api || !apiKey) {
    throw new Error("createConvexReplicationMediaAdapter requires client, api, and apiKey.");
  }

  return {
    async generateUploadUrl() {
      return await client.mutation(api.replications.generateUploadUrl, { apiKey });
    },

    async uploadBuffer(uploadUrl, buffer, contentType) {
      const response = await fetchFn(uploadUrl, {
        method: "POST",
        body: buffer,
        headers: { "Content-Type": contentType },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.storageId) {
        throw new Error("No storageId in response");
      }

      return data.storageId;
    },

    async insertReplication(replication) {
      return await client.mutation(api.replications.insertReplication, {
        apiKey,
        ...replication,
      });
    },

    async updateStorageIds({ id, storage_id, thumbnail_storage_id }) {
      return await client.mutation(api.replications.updateStorageIds, {
        apiKey,
        id,
        storage_id,
        thumbnail_storage_id,
      });
    },

    async updateEffectSlug({ slug, effect_slug }) {
      return await client.mutation(api.replications.updateEffectSlug, {
        apiKey,
        slug,
        effect_slug,
      });
    },

    async updateGalleryOrder({ effect_slug, replication_slugs }) {
      return await client.mutation(api.replications.updateGalleryOrder, {
        apiKey,
        effect_slug,
        replication_slugs,
      });
    },

    async clearGalleryOrder(effectSlug) {
      return await client.mutation(api.subjectiveEffects.update, {
        apiKey,
        slug: effectSlug,
        updates: {
          gallery_order: [],
        },
      });
    },
  };
}
