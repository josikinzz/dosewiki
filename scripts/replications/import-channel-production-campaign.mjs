#!/usr/bin/env node
/**
 * Import the reviewed 2026-08-23 channel campaign.
 *
 * Default mode is read-only. Writes require the shared production ceremony plus
 * --confirm-channel-campaign. The input plan is digest-bound to its ledger.
 * Creates and higher-quality replacements upload main, poster, and preview.
 * Replacements use applySourceRecovery's expectedStorageId as the atomic CAS.
 * No source media is changed or deleted by this script.
 *
 * Supplemental replacement input (optional):
 * {"items":[{"youtubeId":"4yl4COV5FOw","title":"...","productionId":"...",
 * "expectedStorageId":"...","expectedSourceUrl":null,"sourceUrl":"https://www.youtube.com/watch?v=4yl4COV5FOw",
 * "main":{"path":"/absolute/file.mp4","bytes":123,"sha256":"...","duration":30},
 * "poster":{"path":"/absolute/poster.webp","bytes":123,"sha256":"..."},
 * "preview":{"path":"/absolute/preview.mp4","bytes":123,"sha256":"..."}}]}
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";

export const OPERATION = "import-channel-production-campaign";
export const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
export const EXTRA_CONFIRMATION = "--confirm-channel-campaign";
export const SUPPLEMENTAL_ID = "4yl4COV5FOw";
const MAX_DURATION = 600;
const MAX_BYTES = 95_000_000;
const VR_PATTERN = /(?:\b(?:360|180)(?:\s*(?:°|degree|video))?\b|\bvr\b|virtual reality|equirectangular|stereoscopic)/i;

const required = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
export const digestValue = (value) => createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
export async function digestFile(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
function atomicJson(file, value) { const temporary = `${file}.${process.pid}.part`; writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`); renameSync(temporary, file); }
function contentType(file) { const found = new Map([[".mp4", "video/mp4"], [".webp", "image/webp"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"]]).get(path.extname(file).toLowerCase()); required(found, `Unsupported upload extension: ${file}`); return found; }
function absolute(base, file) { return path.isAbsolute(file) ? file : path.resolve(base, file); }

function planCore(plan) {
  return { schemaVersion: plan.schemaVersion, operation: plan.operation, target: plan.target, writeAuthorized: plan.writeAuthorized,
    sourceFilesPreserved: plan.sourceFilesPreserved, durationLimitSeconds: plan.durationLimitSeconds, liveSnapshot: plan.liveSnapshot, buckets: plan.buckets };
}

function pathsFor(entry, base) {
  const upload = entry.upload ?? {};
  const result = {
    main: absolute(base, upload.mainPath ?? entry.main?.path),
    poster: absolute(base, upload.posterPath ?? upload.thumbnailPath ?? entry.poster?.path),
    preview: absolute(base, upload.previewPath ?? entry.preview?.path),
  };
  return result;
}

function expectedHash(entry, label) {
  if (label === "main") return entry.renditionSha256 ?? entry.main?.sha256 ?? null;
  return entry[label]?.sha256 ?? entry.renditionHashes?.[label === "poster" ? "thumbnail" : label] ?? null;
}

function assertMedia(entry, files) {
  required(entry.proposedRow?.duration <= MAX_DURATION && entry.proposedRow?.duration > 0, `${entry.id}: duration must be in (0, 600].`);
  const searchable = [entry.title, entry.slug, entry.proposedRow?.title, entry.proposedRow?.format, entry.viewingMode, entry.mediaProjection].filter(Boolean).join(" ");
  required(!VR_PATTERN.test(searchable) && entry.isVr !== true && entry.is360 !== true && entry.is180 !== true, `${entry.id}: 360/180/VR media is forbidden.`);
  for (const [label, file] of Object.entries(files)) {
    required(typeof file === "string" && path.isAbsolute(file), `${entry.id}: ${label} path must be absolute.`);
    required(existsSync(file) && statSync(file).isFile(), `${entry.id}: missing ${label}: ${file}`);
    contentType(file);
  }
  required(statSync(files.main).size === entry.proposedRow.file_size, `${entry.id}: main file size drifted.`);
  required(statSync(files.main).size <= MAX_BYTES, `${entry.id}: main exceeds ${MAX_BYTES} bytes.`);
}

export function validateCampaignPlan(plan, planPath, supplemental = null) {
  required(plan.target === EXPECTED_TARGET, `Plan target must be ${EXPECTED_TARGET}.`);
  required(plan.writeAuthorized === false && plan.sourceFilesPreserved === true, "Plan must preserve sources and remain write-unapproved.");
  required(plan.planDigest === digestValue(planCore(plan)), "Plan digest mismatch.");
  required(plan.buckets && Array.isArray(plan.buckets.create) && Array.isArray(plan.buckets.replacement), "Plan lacks create/replacement buckets.");
  required(plan.counts?.create === plan.buckets.create.length && plan.counts?.replacement === plan.buckets.replacement.length, "Plan bucket counts drifted.");
  const entries = [...plan.buckets.create, ...plan.buckets.replacement];
  if (supplemental) {
    const items = supplemental.items ?? supplemental.entries;
    required(Array.isArray(items) && items.length === 1 && (items[0].youtubeId ?? items[0].id) === SUPPLEMENTAL_ID, `Supplemental manifest must contain only ${SUPPLEMENTAL_ID}.`);
    const item = items[0];
    entries.push({ id: SUPPLEMENTAL_ID, youtubeId: SUPPLEMENTAL_ID, title: item.title, slug: item.slug, action: "replacement", productionId: item.productionId,
      sourceUrl: item.sourceUrl, compareAndSwap: { expectedStorageId: item.expectedStorageId, expectedSourceUrl: item.expectedSourceUrl ?? null },
      rollback: { storageId: item.expectedStorageId, thumbnailStorageId: item.expectedThumbnailStorageId ?? null, previewStorageId: item.expectedPreviewStorageId ?? null, fileSize: item.expectedFileSize ?? null },
      proposedRow: { ...(item.proposedRow ?? {}), title: item.title, duration: item.main?.duration, file_size: item.main?.bytes }, main: item.main, poster: item.poster, preview: item.preview });
  }
  const seen = new Set();
  return entries.map((entry) => {
    required(entry.id && !seen.has(entry.id), `Missing or duplicate campaign id: ${entry.id}`); seen.add(entry.id);
    required(["create", "replacement"].includes(entry.action), `${entry.id}: unsupported action.`);
    required(entry.review?.verdict === "replication" || entry.id === SUPPLEMENTAL_ID, `${entry.id}: not an approved replication.`);
    required(entry.proposedRow?.effect_slug || entry.action === "replacement", `${entry.id}: missing primary effect.`);
    const files = pathsFor(entry, path.dirname(planPath)); assertMedia(entry, files);
    if (entry.action === "replacement") {
      required(entry.productionId, `${entry.id}: replacement productionId missing.`);
      required(entry.compareAndSwap?.expectedStorageId, `${entry.id}: replacement expectedStorageId missing.`);
      required(entry.rollback?.storageId === entry.compareAndSwap.expectedStorageId, `${entry.id}: rollback/CAS storage mismatch.`);
    }
    return { entry, files };
  });
}

export function loadLedger(ledgerPath, planPath, planDigest) {
  if (!existsSync(ledgerPath)) return { schemaVersion: 1, operation: OPERATION, target: EXPECTED_TARGET, planPath, planDigest, writeAuthorized: false, items: {} };
  const ledger = readJson(ledgerPath);
  required(ledger.target === EXPECTED_TARGET && ledger.planPath === planPath && ledger.planDigest === planDigest, "Ledger is not bound to this exact target, plan path, and digest.");
  return ledger;
}

async function postFile(uploadUrl, file) {
  return await new Promise((resolve, reject) => {
    const request = https.request(uploadUrl, { method: "POST", agent: false, headers: { "Content-Type": contentType(file), "Content-Length": String(statSync(file).size) } }, (response) => {
      const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => { const body = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Upload failed: ${response.statusCode ?? "unknown"} ${body}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(`Upload returned invalid JSON: ${error.message}`)); }
      });
    }); request.on("error", reject); const stream = createReadStream(file); stream.on("error", reject); stream.pipe(request);
  });
}
async function upload(client, apiKey, file) { let last; for (let attempt = 1; attempt <= 8; attempt += 1) { try { const url = await client.mutation(api.replications.generateUploadUrl, { apiKey }); const result = await postFile(url, file); required(result.storageId, "Upload returned no storageId."); return result.storageId; } catch (error) { last = error; if (attempt === 8 || String(error.message).startsWith("Upload failed:")) throw error; await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 30_000))); } } throw last; }

function insertArgs(row, storage) {
  const allowed = ["slug", "title", "artist", "artist_url", "role", "type", "effect_slug", "width", "height", "format", "file_size", "duration", "effect_tags", "rights_status", "license_name", "license_url", "rightsholder", "credit_line", "permission_notes", "removal_contact"];
  return Object.fromEntries(allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]).concat([["storage_id", storage.main], ["thumbnail_storage_id", storage.poster]]));
}

async function verifyUrl(label, url, expectedBytes) { required(typeof url === "string" && url, `${label}: resolved URL missing.`); const response = await fetch(url, { method: "HEAD", cache: "no-store" }); required(response.ok, `${label}: HEAD returned ${response.status}.`); const length = Number(response.headers.get("content-length")); if (Number.isFinite(length) && length > 0) required(length === expectedBytes, `${label}: content length ${length} != ${expectedBytes}.`); }

async function verifyRow(client, apiKey, action, state) {
  const { entry, files } = action; const row = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId }); required(row, `${entry.id}: row disappeared.`);
  required(row.storage_id === state.uploadedStorageIds.main && row.thumbnail_storage_id === state.uploadedStorageIds.poster && row.preview_storage_id === state.uploadedStorageIds.preview, `${entry.id}: storage IDs did not persist.`);
  required(row.file_size === statSync(files.main).size, `${entry.id}: file_size did not persist.`);
  if (entry.action === "create") for (const key of ["slug", "title", "artist", "role", "type", "effect_slug", "rights_status"]) required(row[key] === entry.proposedRow[key], `${entry.id}: ${key} mismatch.`);
  if (Array.isArray(entry.proposedRow.effect_tags)) {
    const expectedTags = [...entry.proposedRow.effect_tags].sort();
    const actualTags = [...(row.effect_tags ?? [])].sort();
    required(JSON.stringify(actualTags) === JSON.stringify(expectedTags), `${entry.id}: effect_tags mismatch.`);
  }
  await verifyUrl(`${entry.id} main`, row.url, statSync(files.main).size); await verifyUrl(`${entry.id} poster`, row.thumbnail_url, statSync(files.poster).size); await verifyUrl(`${entry.id} preview`, row.preview_url, statSync(files.preview).size);
  return row;
}

export async function main(argv = process.argv.slice(2)) {
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  required(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);
  const planPath = path.resolve(getFlagValue(argv, "--plan") ?? "/Users/josie/Documents/Dose Wiki Media Review/Data/Channel Candidates 2026-08-23/channel-production-plan.json");
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? "/Users/josie/Documents/Dose Wiki Media Review/Data/Channel Candidates 2026-08-23/channel-production-ledger.json");
  const supplementalPath = getFlagValue(argv, "--supplemental-replacement-manifest");
  const limit = Number.parseInt(getFlagValue(argv, "--limit") ?? "2147483647", 10); required(limit > 0, "--limit must be positive.");
  const plan = readJson(planPath); const supplemental = supplementalPath ? readJson(path.resolve(supplementalPath)) : null;
  const actions = validateCampaignPlan(plan, planPath, supplemental); const ledger = loadLedger(ledgerPath, planPath, plan.planDigest);
  const client = new ConvexHttpClient(command.targetUrl); const [liveRows, effects] = await Promise.all([client.query(api.replications.getAll, {}), client.query(api.subjectiveEffects.getPublicPreviews, {})]);
  const effectsSet = new Set(effects.map((effect) => effect.slug)); const liveById = new Map(liveRows.map((row) => [row._id, row])); const liveBySlug = new Map(liveRows.map((row) => [row.slug, row]));
  for (const { entry } of actions) {
    if (entry.proposedRow.effect_slug) required(effectsSet.has(entry.proposedRow.effect_slug), `${entry.id}: live primary effect missing.`);
    for (const tag of entry.proposedRow.effect_tags ?? []) required(effectsSet.has(tag), `${entry.id}: live effect tag missing: ${tag}`);
    if (entry.action === "create") { const occupied = liveBySlug.get(entry.slug); const owned = ledger.items[entry.id]?.productionId === occupied?._id; required(!occupied || owned, `${entry.id}: live slug collision.`); }
    else { const live = liveById.get(entry.productionId); required(live, `${entry.id}: replacement row missing.`); const expected = ledger.items[entry.id]?.uploadedStorageIds?.main ?? entry.compareAndSwap.expectedStorageId; required(live.storage_id === expected, `${entry.id}: replacement CAS precondition drifted.`); }
  }
  const pending = actions.filter(({ entry }) => ledger.items[entry.id]?.status !== "verified"); printProductionWriteCommand(command); console.log(`Plan: ${planPath}\nPlan digest: ${plan.planDigest}\nCreates: ${actions.filter((x) => x.entry.action === "create").length}\nReplacements: ${actions.filter((x) => x.entry.action === "replacement").length}\nPending: ${pending.length}\nLimit: ${limit}`);
  if (command.dryRun) { console.log("Dry run complete: no uploads, mutations, source changes, or deletions."); return { dryRun: true, pending: pending.length }; }
  assertProductionWriteAllowed(command); required(hasFlag(argv, EXTRA_CONFIRMATION), `Refusing write without ${EXTRA_CONFIRMATION}.`); const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  for (const action of pending.slice(0, limit)) {
    const { entry, files } = action; const state = ledger.items[entry.id] ?? { id: entry.id, action: entry.action, status: "pending", productionId: entry.productionId ?? null,
      planDigest: plan.planDigest, sourceDigests: {}, uploadedStorageIds: {}, rollbackStorageIds: entry.rollback ? { main: entry.rollback.storageId, poster: entry.rollback.thumbnailStorageId, preview: entry.rollback.previewStorageId } : null };
    ledger.items[entry.id] = state;
    state.planDigest = state.planDigest ?? plan.planDigest;
    required(state.planDigest === plan.planDigest, `${entry.id}: ledger item belongs to another plan digest.`);
    state.sourceDigests = state.sourceDigests ?? {};
    state.uploadedStorageIds = state.uploadedStorageIds ?? {};
    state.rollbackStorageIds = state.rollbackStorageIds ?? (state.priorStorageIds ? { main: state.priorStorageIds.main, poster: state.priorStorageIds.thumbnail, preview: state.priorStorageIds.preview } : null);
    for (const label of ["main", "poster", "preview"]) if (!state.uploadedStorageIds[label]) { const actual = await digestFile(files[label]); const expected = expectedHash(entry, label); if (expected) required(actual === expected, `${entry.id}: ${label} digest drifted.`); state.sourceDigests[label] = actual; state.uploadedStorageIds[label] = await upload(client, apiKey, files[label]); state.status = `${label}-uploaded`; atomicJson(ledgerPath, ledger); }
    if (entry.action === "create" && !state.productionId) {
      const result = await client.mutation(api.replications.insertMediaAsset, { apiKey, expected_absent: true, ...insertArgs(entry.proposedRow, state.uploadedStorageIds), rights_status: entry.proposedRow.rights_status ?? "unknown" }); state.productionId = result.id; state.status = "inserted"; atomicJson(ledgerPath, ledger);
      await client.mutation(api.replications.applySourceRecovery, { apiKey, id: state.productionId, expectedStorageId: state.uploadedStorageIds.main, expectedSourceUrl: null, storageId: state.uploadedStorageIds.main, sourceUrl: entry.sourceUrl });
    }
    if (entry.action === "replacement") {
      const before = await client.query(api.replications.getResolvedById, { apiKey, id: entry.productionId }); required(before, `${entry.id}: replacement row disappeared.`);
      if (before.storage_id === entry.compareAndSwap.expectedStorageId) await client.mutation(api.replications.applySourceRecovery, { apiKey, id: entry.productionId, expectedStorageId: entry.compareAndSwap.expectedStorageId, expectedSourceUrl: entry.compareAndSwap.expectedSourceUrl ?? before.source_url ?? null, storageId: state.uploadedStorageIds.main, sourceUrl: entry.sourceUrl });
      else required(before.storage_id === state.uploadedStorageIds.main, `${entry.id}: CAS lost to an external write.`); state.productionId = entry.productionId; state.status = "main-replaced"; atomicJson(ledgerPath, ledger);
    }
    const afterMain = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId }); required(afterMain?.storage_id === state.uploadedStorageIds.main, `${entry.id}: main storage changed before poster attach.`);
    if (afterMain.thumbnail_storage_id !== state.uploadedStorageIds.poster) await client.mutation(api.replications.updateStorageIds, { apiKey, id: state.productionId, storage_id: state.uploadedStorageIds.main, thumbnail_storage_id: state.uploadedStorageIds.poster });
    await client.mutation(api.replications.updatePreviewStorageIds, { apiKey, updates: [{ id: state.productionId, previewStorageId: state.uploadedStorageIds.preview, expectedStorageId: state.uploadedStorageIds.main }] });
    await client.mutation(api.replications.updateDeliveredFileSize, { apiKey, id: state.productionId, expectedStorageId: state.uploadedStorageIds.main, file_size: statSync(files.main).size });
    const verified = await verifyRow(client, apiKey, action, state); state.status = "verified"; state.verifiedAt = new Date().toISOString(); state.urls = { main: verified.url, poster: verified.thumbnail_url, preview: verified.preview_url }; atomicJson(ledgerPath, ledger);
  }
  return { dryRun: false, processed: Math.min(pending.length, limit) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
