#!/usr/bin/env node
/**
 * Import the recoverable Effect Index image rows marked missing by the
 * 2026-07-27 reconciliation report.
 *
 * Default mode is a networked dry run: it reads live replications, applies
 * duplicate guards, downloads each planned image to verify it, and reports
 * its byte size. It never uploads or writes unless both write flags are set.
 *
 * Usage:
 *   node scripts/replications/import-missing-effectindex-images.mjs
 *   node scripts/replications/import-missing-effectindex-images.mjs --skip-download
 *   node scripts/replications/import-missing-effectindex-images.mjs \
 *     --write --confirm-replication-import
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
} from "../lib/data-ops-run-context.mjs";
import { canonicalizeEffectSlug } from "./lib/reconciliation.mjs";
import {
  generateReplicationSlug,
  withDefaultReplicationRights,
} from "./lib/workspace.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const RECONCILIATION_PATH = path.join(
  REPO_ROOT,
  "notes-and-plans/reports/replications-reconciliation-2026-07-27.json",
);
const EFFECT_INDEX_DUMP_PATH =
  "/Users/josie/Documents/Utilities/EffectIndex-master/effectindex_dump/replications.json";
const RIGHTS_FIELDS = [
  "rights_status",
  "license_name",
  "license_url",
  "credit_line",
  "source_url",
  "rightsholder",
  "permission_notes",
  "removal_contact",
];

const writeRequested = process.argv.includes("--write");
const confirmed = process.argv.includes("--confirm-replication-import");
const skipDownload = process.argv.includes("--skip-download");

function normalize(value) {
  let text = String(value ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Retain malformed URI sequences as text for a stable comparison.
  }

  return text
    .toLowerCase()
    .replace(/\.(?:avif|gif|jpe?g|png|webp)$/giu, "")
    .replace(/color/giu, "colour")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function titleArtistKey(replication) {
  return `${normalize(replication.title)}\u0000${normalize(replication.artist)}`;
}

function sourceExtension(sourceUrl) {
  const pathname = new URL(sourceUrl).pathname;
  const extension = path.extname(pathname).slice(1).toLowerCase();
  if (!extension || !["gif", "jpg", "jpeg", "png", "webp"].includes(extension)) {
    throw new Error(`Unsupported or absent image extension in ${sourceUrl}`);
  }
  return extension;
}

function contentType(format) {
  return {
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  }[format];
}

function pickRightsMetadata(replication) {
  return Object.fromEntries(
    RIGHTS_FIELDS
      .map((field) => [field, replication[field]])
      .filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function objectId(value) {
  return typeof value === "string" ? value : value?.$oid;
}

function loadCandidates() {
  const report = JSON.parse(fs.readFileSync(RECONCILIATION_PATH, "utf8"));
  const dump = JSON.parse(fs.readFileSync(EFFECT_INDEX_DUMP_PATH, "utf8"));
  const dumpById = new Map(dump.map((entry) => [objectId(entry._id), entry]));
  const missingImages = report.records.filter(
    (record) => record.classification === "missing" && record.type === "image",
  );

  const unavailable = [];
  const candidates = [];
  for (const record of missingImages) {
    if (!/^https:/u.test(record.media ?? "")) {
      unavailable.push(record);
      continue;
    }

    const effectIndexEntry = dumpById.get(record.ei_id);
    if (!effectIndexEntry) {
      throw new Error(`Effect Index dump has no entry for ${record.ei_id} (${record.title}).`);
    }

    const effectSlugs = record.effect_slugs
      .map(canonicalizeEffectSlug)
      .filter(Boolean);
    if (effectSlugs.length === 0) {
      throw new Error(`No usable effect slug for ${record.title}.`);
    }

    const format = sourceExtension(record.media);
    const replication = withDefaultReplicationRights({
      title: effectIndexEntry.title,
      artist: effectIndexEntry.artist || "Unknown",
      // Artist URLs are an attribution commitment: preserve the EI value when present.
      artist_url: effectIndexEntry.artist_url || undefined,
      type: "image",
      effect_slug: effectSlugs[0],
      format,
      source_url: effectIndexEntry.resource,
    });
    candidates.push({
      ...replication,
      ei_id: record.ei_id,
      effect_slugs: effectSlugs,
      slug: generateReplicationSlug(replication.title, replication.artist),
      media: record.media,
    });
  }

  return { candidates, unavailable };
}

function indexLiveReplications(replications) {
  return {
    bySlug: new Map(replications.map((replication) => [replication.slug, replication])),
    byTitleArtist: new Map(replications.map((replication) => [titleArtistKey(replication), replication])),
  };
}

function duplicateReason(candidate, live) {
  const titleArtistMatch = live.byTitleArtist.get(titleArtistKey(candidate));
  const slugMatch = live.bySlug.get(candidate.slug);
  if (!titleArtistMatch && !slugMatch) {
    return null;
  }

  const matches = [...new Map(
    [titleArtistMatch, slugMatch].filter(Boolean).map((replication) => [replication._id, replication]),
  ).values()];
  return matches.map((replication) => `${replication.slug} (${replication._id})`).join(", ");
}

async function downloadImage(candidate, attempts = 4) {
  // Large R2 downloads intermittently fail with TLS record errors; retry with backoff.
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(candidate.media);
      if (!response.ok) {
        throw new Error(`${candidate.media} returned HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new Error(`${candidate.media} returned an empty response`);
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  }
  throw lastError;
}

async function uploadImage(client, credential, candidate, bytes) {
  const uploadUrl = await client.mutation(api.replications.generateUploadUrl, {
    apiKey: credential.token,
  });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType(candidate.format) },
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`Convex upload for ${candidate.slug} returned HTTP ${response.status}`);
  }
  const result = await response.json();
  if (!result.storageId) {
    throw new Error(`Convex upload for ${candidate.slug} returned no storageId.`);
  }
  return result.storageId;
}

async function main() {
  if (writeRequested && !confirmed) {
    throw new Error("Writes require --write --confirm-replication-import.");
  }
  if (!fs.existsSync(RECONCILIATION_PATH) || !fs.existsSync(EFFECT_INDEX_DUMP_PATH)) {
    throw new Error("The reconciliation report or Effect Index dump is unavailable.");
  }

  const argv = process.argv.slice(2);
  const runContext = createDataOpsRunContext({
    operation: "import missing Effect Index images",
    intent: "dev-convex-import",
    argv: writeRequested ? argv : [...argv, "--dry-run"],
    sourceUrlKeys: ["CONVEX_PUBLIC_READ_URL", "VITE_CONVEX_URL"],
    targetUrlKeys: ["TARGET_CONVEX_URL"],
    localArtifacts: [RECONCILIATION_PATH, EFFECT_INDEX_DUMP_PATH],
    confirmationFlag: "--confirm-replication-import",
    destructive: true,
  });
  const { candidates, unavailable } = loadCandidates();
  const targetUrl = runContext.targetUrl;
  const readUrl = targetUrl || runContext.sourceUrl;
  if (!skipDownload && !readUrl) {
    throw new Error("Set CONVEX_PUBLIC_READ_URL (dry run) or TARGET_CONVEX_URL (write).");
  }
  if (writeRequested && !targetUrl) {
    throw new Error("Writes require an explicit TARGET_CONVEX_URL.");
  }

  console.log(`Mode: ${writeRequested ? "write requested" : "dry run"}`);
  printDataOpsRunContext(runContext);
  console.log(`Download check: ${skipDownload ? "skipped" : "enabled"}`);
  console.log(`Recoverable EI image candidates: ${candidates.length}`);
  for (const record of unavailable) {
    console.log(`SKIP unavailable: ${record.title} — no recoverable HTTPS media URL (${record.media}).`);
  }

  let live = null;
  if (!skipDownload) {
    live = indexLiveReplications(await new ConvexHttpClient(readUrl).query(api.replications.getAll, {}));
    console.log(`Live duplicate guard: checked ${live.bySlug.size} unique slug(s).`);
  } else {
    console.log("Live duplicate guard: not queried in --skip-download mode (writes are blocked unless checks run).");
  }

  const planned = [];
  for (const candidate of candidates) {
    const duplicate = live ? duplicateReason(candidate, live) : null;
    if (duplicate) {
      console.log(`SKIP duplicate: ${candidate.slug} — matches ${duplicate}.`);
      continue;
    }

    const bytes = skipDownload ? null : await downloadImage(candidate);
    const extraEffects = candidate.effect_slugs.slice(1);
    console.log(
      `PLAN ${candidate.slug} | ${candidate.title} — ${candidate.artist} | ` +
      `effect=${candidate.effect_slug} | bytes=${bytes ? bytes.length : "not downloaded"}` +
      (extraEffects.length ? ` | unhandled additional effect(s)=${extraEffects.join(",")}` : ""),
    );
    planned.push({ candidate, bytes });
  }

  console.log(`Plan total: ${planned.length} record(s).`);
  if (!writeRequested) {
    return;
  }
  if (skipDownload) {
    throw new Error("--skip-download cannot be used with --write; duplicate and download checks are required.");
  }

  assertDataOpsWriteAllowed(runContext);
  const credential = requireAdminIntentToken("replicationMaintenance");
  const client = new ConvexHttpClient(targetUrl);
  for (const { candidate, bytes } of planned) {
    // Re-check immediately before each insert so this importer never updates or
    // adds a row when another writer created a matching item during the run.
    const currentLive = indexLiveReplications(await client.query(api.replications.getAll, {}));
    const duplicate = duplicateReason(candidate, currentLive);
    if (duplicate) {
      console.log(`SKIP duplicate before write: ${candidate.slug} — matches ${duplicate}.`);
      continue;
    }

    const storageId = await uploadImage(client, credential, candidate, bytes);
    await client.mutation(api.replications.insertReplication, {
      apiKey: credential.token,
      slug: candidate.slug,
      title: candidate.title,
      artist: candidate.artist,
      artist_url: candidate.artist_url,
      type: "image",
      storage_id: storageId,
      effect_slug: candidate.effect_slug,
      format: candidate.format,
      file_size: bytes.length,
      ...pickRightsMetadata(candidate),
    });
    console.log(`CREATED ${candidate.slug}.`);
  }
}

await main();
