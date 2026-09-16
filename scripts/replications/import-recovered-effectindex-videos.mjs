#!/usr/bin/env node
/**
 * Import recovered Effect Index videos through Streamable's documented video API.
 *
 * Default mode is a networked dry run. Use --skip-download for an entirely
 * offline plan; neither mode writes. Live imports require the data-ops
 * production ceremony plus --confirm-replication-import.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationBytes, replicationImportReceipts } from "./lib/r2-upload.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
} from "../lib/data-ops-run-context.mjs";
import { canonicalizeEffectSlug } from "./lib/reconciliation.mjs";
import { generateReplicationSlug, withDefaultReplicationRights } from "./lib/workspace.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const PROBE_PATH = path.join(REPO_ROOT, "notes-and-plans/reports/media-recovery-probe-results.json");
const RECONCILIATION_PATH = path.join(REPO_ROOT, "notes-and-plans/reports/replications-reconciliation-2026-07-27.json");
const RIGHTS_FIELDS = ["rights_status", "license_name", "license_url", "credit_line", "source_url", "rightsholder", "permission_notes", "removal_contact"];
const writeRequested = process.argv.includes("--write");
const confirmed = process.argv.includes("--confirm-replication-import");
const skipDownload = process.argv.includes("--skip-download");

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}
function titleArtistKey(replication) { return `${normalize(replication.title)}\u0000${normalize(replication.artist)}`; }
function pickRightsMetadata(replication) {
  return Object.fromEntries(RIGHTS_FIELDS.map((field) => [field, replication[field]]).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}
function streamableId(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/e\/([a-z0-9]+)$/iu);
  if (parsed.hostname !== "streamable.com" || !match) throw new Error(`Invalid Streamable canonical URL: ${url}`);
  return match[1];
}
function loadCandidates() {
  const probe = JSON.parse(fs.readFileSync(PROBE_PATH, "utf8"));
  const reconciliation = JSON.parse(fs.readFileSync(RECONCILIATION_PATH, "utf8"));
  const records = new Map(reconciliation.records.filter((record) => record.type === "video").map((record) => [record.ei_id, record]));
  const skipped = [];
  const candidates = [];
  for (const asset of Object.values(probe.assets)) {
    if (asset.assetKind !== "video") continue;
    // A located URL marks a recovered asset. Its Streamable candidate remains
    // canonical even where the probe retained a Wayback page as the recovery
    // evidence (rather than the Streamable page URL itself).
    const canonicalUrl = asset.candidates?.find((candidate) => candidate.kind === "streamable")?.url;
    if (typeof asset.located_url !== "string" || typeof canonicalUrl !== "string") continue;
    const eiId = asset.id.replace(/^video:/u, "");
    const record = records.get(eiId);
    if (!record) throw new Error(`No reconciliation metadata for recovered video ${eiId}.`);
    const effectSlugs = (record.effect_slugs ?? []).map(canonicalizeEffectSlug).filter(Boolean);
    if (!effectSlugs.length) {
      skipped.push({ record, reason: "no usable effect_slug" });
      continue;
    }
    const sourceUrl = `https://streamable.com/e/${streamableId(canonicalUrl)}`;
    const replication = withDefaultReplicationRights({
      title: record.title,
      artist: record.artist || "Unknown",
      // Effect Index attribution is a licensing commitment; preserve it verbatim when present.
      artist_url: record.artist_url || undefined,
      type: "video",
      effect_slug: effectSlugs[0],
      format: "mp4",
      source_url: sourceUrl,
    });
    candidates.push({ ...replication, ei_id: eiId, gfycat_id: record.media, streamable_id: streamableId(sourceUrl), effect_slugs: effectSlugs, slug: generateReplicationSlug(replication.title, replication.artist) });
  }
  return { candidates, skipped };
}
function indexLiveReplications(replications) {
  return { bySlug: new Map(replications.map((row) => [row.slug, row])), byTitleArtist: new Map(replications.map((row) => [titleArtistKey(row), row])) };
}
function duplicateReason(candidate, live) {
  const matches = [...new Map([live.bySlug.get(candidate.slug), live.byTitleArtist.get(titleArtistKey(candidate))].filter(Boolean).map((row) => [row._id, row])).values()];
  return matches.length ? matches.map((row) => `${row.slug} (${row._id})`).join(", ") : null;
}
async function withRetries(operation, attempts = 4) {
  // Large transfers intermittently fail with TLS record errors; retry with backoff.
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  }
  throw lastError;
}

/**
 * Fetch over a connection pool used for exactly one call.
 *
 * The global fetch keeps its sockets alive between calls, so when a
 * multi-megabyte transfer dies mid-stream the damaged session is reused by
 * every request after it and the whole run fails as one cascade — retries
 * included, because they inherit the same poisoned pool. A per-call dispatcher
 * makes each attempt genuinely independent, which is what the retry loop
 * already assumed it was getting.
 */
async function fetchIsolated(url, readBody) {
  const dispatcher = new Agent({ allowH2: false, connections: 1, pipelining: 0 });
  try {
    const response = await undiciFetch(url, { dispatcher });
    // The body must be drained before the dispatcher closes: closing tears down
    // the socket the stream is still reading from, which leaves the read pending
    // forever rather than failing.
    return { ok: response.ok, status: response.status, body: response.ok ? await readBody(response) : null };
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

async function downloadVideo(candidate) {
  const metadata = await fetchIsolated(
    `https://api.streamable.com/videos/${candidate.streamable_id}`,
    (response) => response.json(),
  );
  if (!metadata.ok) throw new Error(`Streamable metadata for ${candidate.streamable_id} returned HTTP ${metadata.status}`);
  const url = metadata.body?.files?.mp4?.url;
  if (typeof url !== "string" || !url) throw new Error(`Streamable metadata for ${candidate.streamable_id} returned no files.mp4.url.`);
  const mp4Url = url.startsWith("//") ? `https:${url}` : url;
  const video = await fetchIsolated(mp4Url, async (response) => Buffer.from(await response.arrayBuffer()));
  if (!video.ok) throw new Error(`Streamable MP4 for ${candidate.streamable_id} returned HTTP ${video.status}`);
  const bytes = video.body;
  if (!bytes.length) throw new Error(`Streamable MP4 for ${candidate.streamable_id} was empty.`);
  return bytes;
}
async function main() {
  if (writeRequested && !confirmed) throw new Error("Writes require --write --confirm-replication-import.");
  if (!fs.existsSync(PROBE_PATH) || !fs.existsSync(RECONCILIATION_PATH)) throw new Error("The media-recovery probe or reconciliation report is unavailable.");
  const argv = process.argv.slice(2);
  const runContext = createDataOpsRunContext({ operation: "import recovered Effect Index videos", intent: "dev-data-import", argv: writeRequested ? argv : [...argv, "--dry-run"], sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL"], targetUrlKeys: ["TARGET_POSTGRES_URL"], localArtifacts: [PROBE_PATH, RECONCILIATION_PATH], confirmationFlag: "--confirm-replication-import", destructive: true });
  const { candidates, skipped } = loadCandidates();
  const targetUrl = runContext.targetUrl;
  const readUrl = targetUrl || runContext.sourceUrl;
  if (!skipDownload && !readUrl) throw new Error("Set SOURCE_POSTGRES_URL (dry run) or TARGET_POSTGRES_URL (write).");
  if (writeRequested && !targetUrl) throw new Error("Writes require an explicit TARGET_POSTGRES_URL.");
  console.log(`Mode: ${writeRequested ? "write requested" : "dry run"}`);
  printDataOpsRunContext(runContext);
  console.log(`Download check: ${skipDownload ? "skipped" : "enabled"}`);
  console.log(`Recovered Streamable video assets: ${candidates.length + skipped.length}`);
  for (const { record, reason } of skipped) console.log(`SKIP unavailable: ${record.title} (${record.media}) — ${reason}.`);
  let live = null;
  if (!skipDownload) { live = indexLiveReplications(await createDataClient({ target: readUrl }).client.query(api.replications.getAll, {})); console.log(`Live duplicate guard: checked ${live.bySlug.size} unique slug(s).`); }
  else console.log("Live duplicate guard: not queried in --skip-download mode (writes are blocked unless checks run).");
  const planned = [];
  const failed = [];
  for (const candidate of candidates) {
    const duplicate = live ? duplicateReason(candidate, live) : null;
    if (duplicate) { console.log(`SKIP duplicate: ${candidate.slug} — matches ${duplicate}.`); continue; }
    let bytes = null;
    // In write mode, downloads happen one at a time in the write loop so the
    // whole recovery set is never buffered in memory at once.
    if (!skipDownload && !writeRequested) {
      try {
        bytes = await withRetries(() => downloadVideo(candidate));
      } catch (error) {
        // Streamable embed pages return 200 for unknown ids, so a probe "hit"
        // is only confirmed once the metadata API serves a real mp4.
        failed.push({ candidate, reason: error.message });
        console.log(`FAILED ${candidate.slug} | ${candidate.title} — ${error.message}`);
        continue;
      }
    }
    const extraEffects = candidate.effect_slugs.slice(1);
    console.log(`PLAN ${candidate.slug} | ${candidate.title} — ${candidate.artist} | effect=${candidate.effect_slug} | streamable=${candidate.streamable_id} | gfycat=${candidate.gfycat_id} | bytes=${bytes ? bytes.length : "deferred to write loop"}${extraEffects.length ? ` | unhandled additional effect(s)=${extraEffects.join(",")}` : ""}`);
    planned.push({ candidate });
  }
  console.log(`Plan total: ${planned.length} record(s).`);
  if (failed.length) console.log(`Unconfirmed recoveries (streamable metadata failed): ${failed.length} — ${failed.map(({ candidate }) => candidate.slug).join(", ")}`);
  if (!writeRequested) return;
  if (skipDownload) throw new Error("--skip-download cannot be used with --write; duplicate and download checks are required.");
  assertDataOpsWriteAllowed(runContext);
  const credential = requireAdminIntentToken("replicationMaintenance");
  const client = createDataClient({ target: targetUrl }).client;
  const writeGuard = indexLiveReplications(await withRetries(() => client.query(api.replications.getAll, {})));
  const createdSlugs = new Set();
  for (const { candidate } of planned) {
    const duplicate = createdSlugs.has(candidate.slug)
      ? `${candidate.slug} (created earlier this run)`
      : duplicateReason(candidate, writeGuard);
    if (duplicate) { console.log(`SKIP duplicate before write: ${candidate.slug} — matches ${duplicate}.`); continue; }
    let bytes;
    try {
      bytes = await withRetries(() => downloadVideo(candidate));
    } catch (error) {
      console.log(`FAILED ${candidate.slug} | ${candidate.title} — ${error.message}`);
      continue;
    }
    // Keep transfer and publication failures scoped to the current item.
    // The live duplicate guard makes a later run safe to resume.
    try {
      const r2Key = await withRetries(() => uploadReplicationBytes(client, credential.token, bytes, "video/mp4", "mp4"));
      const receipts = await replicationImportReceipts(client, credential.token, candidate.slug, { r2_key: r2Key });
      await withRetries(() => client.mutation(api.replications.insertReplication, { apiKey: credential.token, slug: candidate.slug, title: candidate.title, artist: candidate.artist, artist_url: candidate.artist_url, type: "video", r2_key: r2Key, effect_slug: candidate.effect_slug, format: "mp4", file_size: bytes.length, ...pickRightsMetadata(candidate), ...receipts }));
      createdSlugs.add(candidate.slug);
      console.log(`CREATED ${candidate.slug}.`);
    } catch (error) {
      console.log(`FAILED ${candidate.slug} | ${candidate.title} — ${error.message}`);
    }
  }
}
await main();
