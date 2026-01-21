#!/usr/bin/env node
/**
 * Migrate replication media from ESEI Convex storage into DoseWiki Convex.
 *
 * Usage:
 *   node scripts/migrate-replication-media.mjs --dry-run
 *   node scripts/migrate-replication-media.mjs --execute [--limit=25] [--effect=geometry]
 *   node scripts/migrate-replication-media.mjs --execute --skip-videos
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes("--dry-run");
const execute = process.argv.includes("--execute");
const skipVideos = process.argv.includes("--skip-videos");
const skipImages = process.argv.includes("--skip-images");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const effectArg = process.argv.find((arg) => arg.startsWith("--effect="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const effectFilter = effectArg ? effectArg.split("=")[1] : null;

if (!dryRun && !execute) {
  console.error(
    "Usage: node scripts/migrate-replication-media.mjs --dry-run|--execute [--limit=25] [--effect=slug] [--skip-videos] [--skip-images]"
  );
  process.exit(1);
}

const INDEX_FILE =
  "/Users/josie/Documents/Utilities/unified osmanthus app/replications/esei-replications-index.json";
const CONVEX_URL =
  process.env.VITE_CONVEX_URL || "https://enchanted-echidna-791.convex.cloud";

const ESEI_CONVEX_HOST = "warmhearted-mosquito-204.convex.cloud";

const uploadUrlCache = {
  url: null,
  expiresAt: 0,
};

function isPlaceholderStorageId(storageId) {
  return !storageId || storageId.startsWith("placeholder-");
}

function normalizeToSlug(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function generateSlugVariations(rep) {
  const variations = new Set();

  if (rep.title && rep.artist) {
    variations.add(normalizeToSlug(`${rep.title}-${rep.artist}`));
    variations.add(normalizeToSlug(rep.title));
    if (rep.artist.toLowerCase() !== "unknown") {
      variations.add(normalizeToSlug(`${rep.title}-unknown`));
    }
  }

  if (rep.filename) {
    variations.add(normalizeToSlug(rep.filename.replace(/\.\w+$/, "")));
    const match = rep.filename.match(/(.+)\s+by\s+(.+)\.\w+$/i);
    if (match) {
      variations.add(normalizeToSlug(`${match[1]}-${match[2]}`));
    }
  }

  if (rep.urlSlug) {
    variations.add(normalizeToSlug(rep.urlSlug));
  }

  if (rep.videoId) {
    variations.add(normalizeToSlug(rep.videoId));
  }

  return variations;
}

function getFormatFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const ext = path.extname(pathname).replace(".", "").toLowerCase();
    return ext || null;
  } catch {
    return null;
  }
}

function getContentType(format, repType) {
  const ext = (format || "").toLowerCase();
  if (repType === "video") {
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
  }
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function getUploadUrl(client) {
  const now = Date.now();
  if (uploadUrlCache.url && now < uploadUrlCache.expiresAt) {
    return uploadUrlCache.url;
  }

  const url = await client.mutation(api.replications.generateUploadUrl);
  uploadUrlCache.url = url;
  uploadUrlCache.expiresAt = now + 5 * 60 * 1000;
  return url;
}

async function uploadFromUrl(client, sourceUrl, contentType) {
  const uploadUrl = await getUploadUrl(client);
  const sourceResponse = await fetch(sourceUrl);

  if (!sourceResponse.ok || !sourceResponse.body) {
    throw new Error(`Failed to download source: ${sourceResponse.status}`);
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: sourceResponse.body,
    duplex: "half",
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
  }

  const data = await uploadResponse.json();
  if (!data.storageId) {
    throw new Error("Upload response missing storageId");
  }
  return data.storageId;
}

function buildUrlMap(index) {
  const urlMap = new Map();
  const eseiEffects = index.eseiEffects || {};

  for (const data of Object.values(eseiEffects)) {
    const replications = data.replications || [];
    for (const rep of replications) {
      if (!rep.convexUrl) continue;
      const variations = generateSlugVariations(rep);
      for (const variation of variations) {
        if (variation) {
          urlMap.set(variation, rep.convexUrl);
        }
      }
    }
  }

  return urlMap;
}

function findSourceUrl(rep, urlMap) {
  if (rep.url && rep.url.includes(ESEI_CONVEX_HOST)) {
    return rep.url;
  }

  let url = urlMap.get(rep.slug);
  if (!url) {
    url = urlMap.get(rep.slug.replace(/-unknown$/, ""));
  }
  if (!url && rep.title && rep.artist) {
    url = urlMap.get(normalizeToSlug(`${rep.title}-${rep.artist}`));
  }
  if (!url && rep.title) {
    url = urlMap.get(normalizeToSlug(rep.title));
  }
  if (!url && rep.storage_id?.startsWith("placeholder-")) {
    const possibleSlug = rep.storage_id.replace("placeholder-", "");
    url = urlMap.get(possibleSlug);
  }
  if (!url && rep.title) {
    url = urlMap.get(normalizeToSlug(rep.title.replace(/_/g, " ")));
  }
  return url || null;
}

async function migrate() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("Replication Media Migration");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`Convex: ${CONVEX_URL}`);
  if (skipVideos) console.log("Skip videos: YES");
  if (skipImages) console.log("Skip images: YES");
  if (effectFilter) console.log(`Effect filter: ${effectFilter}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log(`${"=".repeat(70)}\n`);

  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Error: Index file not found: ${INDEX_FILE}`);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  const urlMap = buildUrlMap(index);
  console.log(`Loaded ${urlMap.size} URL mappings from ESEI index.`);

  const client = new ConvexHttpClient(CONVEX_URL);
  const replications = await client.query(api.replications.getAll);
  console.log(`Found ${replications.length} replications in Convex.\n`);

  const uploadCache = new Map();
  let processed = 0;
  let noMatch = 0;
  let uploaded = 0;
  let updated = 0;
  const noMatchList = [];
  const errors = [];

  const candidates = replications.filter((rep) => {
    if (!isPlaceholderStorageId(rep.storage_id)) {
      return false;
    }
    if (skipVideos && rep.type === "video") return false;
    if (skipImages && rep.type === "image") return false;
    if (effectFilter && rep.effect_slug !== effectFilter) return false;
    return true;
  });

  const skipped = replications.length - candidates.length;
  const toProcess = limit ? candidates.slice(0, limit) : candidates;
  console.log(`Candidates to migrate: ${toProcess.length}\n`);

  if (!dryRun && toProcess.length > 0) {
    try {
      await client.mutation(api.replications.updateStorageIds, {
        id: toProcess[0]._id,
        storage_id: toProcess[0].storage_id,
        thumbnail_storage_id: toProcess[0].thumbnail_storage_id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Preflight failed: replications:updateStorageIds is unavailable. ${message}`
      );
      process.exit(1);
    }
  }

  for (const rep of toProcess) {
    processed++;
    const sourceUrl = findSourceUrl(rep, urlMap);

    if (!sourceUrl) {
      noMatch++;
      noMatchList.push(`${rep.slug} (${rep.title})`);
      continue;
    }

    const format = rep.format || getFormatFromUrl(sourceUrl);
    const contentType = getContentType(format, rep.type);

    if (dryRun) {
      console.log(
        `[${processed}/${toProcess.length}] DRY RUN: ${rep.slug} → ${sourceUrl}`
      );
      continue;
    }

    try {
      let storageId = uploadCache.get(sourceUrl);
      if (!storageId) {
        storageId = await uploadFromUrl(client, sourceUrl, contentType);
        uploadCache.set(sourceUrl, storageId);
        uploaded++;
      }

      await client.mutation(api.replications.updateStorageIds, {
        id: rep._id,
        storage_id: storageId,
      });
      updated++;

      console.log(`[${processed}/${toProcess.length}] ✅ ${rep.slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${rep.slug}: ${message}`);
      console.log(`[${processed}/${toProcess.length}] ❌ ${rep.slug}: ${message}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Migration Summary");
  console.log(`${"=".repeat(70)}`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (existing storage): ${skipped}`);
  console.log(`No match: ${noMatch}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors.length}`);

  if (noMatchList.length > 0) {
    console.log(`\nUnmatched (first 10):`);
    noMatchList.slice(0, 10).forEach((item) => console.log(`  - ${item}`));
  }

  if (errors.length > 0) {
    console.log(`\nErrors (first 10):`);
    errors.slice(0, 10).forEach((item) => console.log(`  - ${item}`));
  }

  console.log(`${"=".repeat(70)}\n`);
}

migrate().catch((error) => {
  console.error("Migration error:", error);
  process.exit(1);
});
