#!/usr/bin/env node
/**
 * Import the reviewed 2026-08-23 channel campaign.
 *
 * Default mode is read-only. Writes require the shared production ceremony plus
 * --confirm-channel-campaign. The input plan is digest-bound to its ledger.
 * Creates and higher-quality replacements upload main, poster, and preview.
 * Replacements compare both reviewed main identities, then atomically CAS all media.
 * No source media is changed or deleted by this script.
 *
 * Supplemental replacement input (optional):
 * {"items":[{"youtubeId":"4yl4COV5FOw","title":"...","productionId":"...",
 * "expectedStorageId":"...","expectedR2Key":null,"expectedSourceUrl":null,"sourceUrl":"https://www.youtube.com/watch?v=4yl4COV5FOw",
 * "main":{"path":"/absolute/file.mp4","bytes":123,"sha256":"...","duration":30},
 * "poster":{"path":"/absolute/poster.webp","bytes":123,"sha256":"..."},
 * "preview":{"path":"/absolute/preview.mp4","bytes":123,"sha256":"..."}}]}
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireCampaignTarget, bindCampaignTarget } from "./lib/postgres-target.mjs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationFile, updateReplicationMedia, replicationImportReceipts } from "./lib/r2-upload.mjs";
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
      sourceUrl: item.sourceUrl, compareAndSwap: { expectedStorageId: item.expectedStorageId ?? null, expectedR2Key: item.expectedR2Key ?? null, expectedSourceUrl: item.expectedSourceUrl ?? null },
      rollback: { storageId: item.expectedStorageId ?? null, r2Key: item.expectedR2Key ?? null, thumbnailStorageId: item.expectedThumbnailStorageId ?? null, previewStorageId: item.expectedPreviewStorageId ?? null, thumbnailR2Key: item.expectedThumbnailR2Key ?? null, previewR2Key: item.expectedPreviewR2Key ?? null, fileSize: item.expectedFileSize ?? null },
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
      required(entry.compareAndSwap?.expectedStorageId || entry.compareAndSwap?.expectedR2Key, `${entry.id}: replacement expected media identity missing.`);
      required((entry.rollback?.storageId ?? null) === (entry.compareAndSwap.expectedStorageId ?? null) && (entry.rollback?.r2Key ?? null) === (entry.compareAndSwap.expectedR2Key ?? null), `${entry.id}: rollback/CAS media mismatch.`);
    }
    return { entry, files };
  });
}

export function loadLedger(ledgerPath, planPath, planDigest) {
  if (!existsSync(ledgerPath)) return { schemaVersion: 1, operation: OPERATION, target: EXPECTED_TARGET, planPath, planDigest, writeAuthorized: false, items: {} };
  const ledger = readJson(ledgerPath);
  required(ledger.target === EXPECTED_TARGET && ledger.planPath === planPath && ledger.planDigest === planDigest, "Ledger is not bound to this exact target, plan path, and digest.");
  required(!Object.values(ledger.items ?? {}).some((item) => Object.values(item.uploadedStorageIds ?? {}).some(Boolean)), "Legacy upload ledger requires explicit reconciliation before native R2 import.");
  return ledger;
}


function insertArgs(row, keys) {
  const allowed = ["slug", "title", "artist", "artist_url", "role", "type", "effect_slug", "width", "height", "format", "file_size", "duration", "effect_tags", "rights_status", "license_name", "license_url", "rightsholder", "credit_line", "permission_notes", "removal_contact"];
  return Object.fromEntries(allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]).concat(Object.entries(keys)));
}

async function verifyUrl(label, url, expectedBytes) { required(typeof url === "string" && url, `${label}: resolved URL missing.`); const response = await fetch(url, { method: "HEAD", cache: "no-store" }); required(response.ok, `${label}: HEAD returned ${response.status}.`); const length = Number(response.headers.get("content-length")); if (Number.isFinite(length) && length > 0) required(length === expectedBytes, `${label}: content length ${length} != ${expectedBytes}.`); }

async function verifyRow(client, apiKey, action, state) {
  const { entry, files } = action; const row = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId }); required(row, `${entry.id}: row disappeared.`);
  required(row.r2_key === state.r2Keys.main && row.thumbnail_r2_key === state.r2Keys.poster && row.preview_r2_key === state.r2Keys.preview, `${entry.id}: R2 keys did not persist.`);
  required(row.file_size === statSync(files.main).size, `${entry.id}: file_size did not persist.`);
  required(row.source_url === entry.sourceUrl, `${entry.id}: source_url did not persist.`);
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
  const postgresTarget = requireCampaignTarget(command);
  const planPath = path.resolve(getFlagValue(argv, "--plan") ?? "/Users/josie/Documents/Dose Wiki Media Review/Data/Channel Candidates 2026-08-23/channel-production-plan.json");
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? "/Users/josie/Documents/Dose Wiki Media Review/Data/Channel Candidates 2026-08-23/channel-production-ledger.json");
  const supplementalPath = getFlagValue(argv, "--supplemental-replacement-manifest");
  const limit = Number.parseInt(getFlagValue(argv, "--limit") ?? "2147483647", 10); required(limit > 0, "--limit must be positive.");
  const plan = readJson(planPath); const supplemental = supplementalPath ? readJson(path.resolve(supplementalPath)) : null;
  required(!plan.postgresTarget || plan.postgresTarget === postgresTarget, "Plan Postgres target differs from the explicit target.");
  const actions = validateCampaignPlan(plan, planPath, supplemental); const ledger = loadLedger(ledgerPath, planPath, plan.planDigest);
  bindCampaignTarget(ledger, postgresTarget);
  const client = createDataClient({ target: command.targetUrl }).client; const [liveRows, effects] = await Promise.all([client.query(api.replications.getAll, {}), client.query(api.subjectiveEffects.getPublicPreviews, {})]);
  const effectsSet = new Set(effects.map((effect) => effect.slug)); const liveById = new Map(liveRows.map((row) => [row._id, row])); const liveBySlug = new Map(liveRows.map((row) => [row.slug, row]));
  for (const { entry } of actions) {
    if (entry.proposedRow.effect_slug) required(effectsSet.has(entry.proposedRow.effect_slug), `${entry.id}: live primary effect missing.`);
    for (const tag of entry.proposedRow.effect_tags ?? []) required(effectsSet.has(tag), `${entry.id}: live effect tag missing: ${tag}`);
    if (entry.action === "create") {
      const occupied = liveBySlug.get(entry.slug);
      const state = ledger.items[entry.id];
      const owned = occupied && state?.r2Keys?.main === occupied.r2_key;
      required(!occupied || owned, `${entry.id}: live slug collision.`);
    } else {
      const live = liveById.get(entry.productionId);
      required(live, `${entry.id}: replacement row missing.`);
      const state = ledger.items[entry.id];
      const original = (live.storage_id ?? null) === (entry.compareAndSwap.expectedStorageId ?? null) && (live.r2_key ?? null) === (entry.compareAndSwap.expectedR2Key ?? null);
      const resumed = state?.r2Keys?.main && live.r2_key === state.r2Keys.main && (live.storage_id ?? null) === (entry.compareAndSwap.expectedStorageId ?? null);
      required(original || resumed, `${entry.id}: replacement CAS precondition drifted.`);
    }
  }
  const pending = actions.filter(({ entry }) => ledger.items[entry.id]?.status !== "verified"); printProductionWriteCommand(command); console.log(`Plan: ${planPath}\nPlan digest: ${plan.planDigest}\nCreates: ${actions.filter((x) => x.entry.action === "create").length}\nReplacements: ${actions.filter((x) => x.entry.action === "replacement").length}\nPending: ${pending.length}\nLimit: ${limit}`);
  if (command.dryRun) { console.log("Dry run complete: no uploads, mutations, source changes, or deletions."); return { dryRun: true, pending: pending.length }; }
  assertProductionWriteAllowed(command); required(hasFlag(argv, EXTRA_CONFIRMATION), `Refusing write without ${EXTRA_CONFIRMATION}.`); const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  for (const action of pending.slice(0, limit)) {
    const { entry, files } = action; const state = ledger.items[entry.id] ?? { id: entry.id, action: entry.action, status: "pending", productionId: entry.productionId ?? null,
      planDigest: plan.planDigest, sourceDigests: {}, r2Keys: {}, rollbackStorageIds: entry.rollback ? { main: entry.rollback.storageId, poster: entry.rollback.thumbnailStorageId, preview: entry.rollback.previewStorageId } : null,
      rollbackR2Keys: entry.rollback ? { main: entry.rollback.r2Key ?? null, poster: entry.rollback.thumbnailR2Key ?? null, preview: entry.rollback.previewR2Key ?? null } : null };
    ledger.items[entry.id] = state;
    state.planDigest = state.planDigest ?? plan.planDigest;
    required(state.planDigest === plan.planDigest, `${entry.id}: ledger item belongs to another plan digest.`);
    state.sourceDigests = state.sourceDigests ?? {};
    state.r2Keys = state.r2Keys ?? {};
    state.rollbackStorageIds = state.rollbackStorageIds ?? (state.priorStorageIds ? { main: state.priorStorageIds.main, poster: state.priorStorageIds.thumbnail, preview: state.priorStorageIds.preview } : null);
    for (const label of ["main", "poster", "preview"]) {
      const actual = await digestFile(files[label]);
      const expected = expectedHash(entry, label);
      if (expected) required(actual === expected, `${entry.id}: ${label} digest drifted.`);
      if (state.r2Keys[label]) {
        required(state.sourceDigests[label] === actual, `${entry.id}: ${label} resume digest drifted.`);
        required(state.r2Keys[label].startsWith(`media/sha256/${actual.slice(0, 2)}/${actual}.`), `${entry.id}: ${label} resume R2 digest mismatch.`);
        continue;
      }
      state.sourceDigests[label] = actual;
      state.r2Keys[label] = await uploadReplicationFile(client, apiKey, files[label], contentType(files[label]));
      required(state.r2Keys[label].startsWith(`media/sha256/${actual.slice(0, 2)}/${actual}.`), `${entry.id}: ${label} upload digest drifted.`);
      state.status = `${label}-uploaded`;
      atomicJson(ledgerPath, ledger);
    }
    const keys = { r2_key: state.r2Keys.main, thumbnail_r2_key: state.r2Keys.poster, preview_r2_key: state.r2Keys.preview };
    if (entry.action === "create" && !state.productionId) {
      const latest = await client.query(api.replications.getAll, {});
      const existing = latest.find((row) => row.slug === entry.slug);
      if (existing) {
        required(existing.r2_key === state.r2Keys.main, `${entry.id}: live slug collision.`);
        state.productionId = existing._id;
      } else {
        const result = await client.mutation(api.replications.insertMediaAsset, {
          apiKey, expected_absent: true, ...insertArgs(entry.proposedRow, keys), source_url: entry.sourceUrl,
          file_size: statSync(files.main).size, rights_status: entry.proposedRow.rights_status ?? "unknown",
          ...(await replicationImportReceipts(client, apiKey, entry.slug, keys)),
        });
        state.productionId = result.id;
      }
      state.status = "inserted";
      atomicJson(ledgerPath, ledger);
    }
    if (entry.action === "replacement") {
      const before = await client.query(api.replications.getResolvedById, { apiKey, id: entry.productionId });
      required(before, `${entry.id}: replacement row disappeared.`);
      required((before.storage_id ?? null) === (entry.compareAndSwap.expectedStorageId ?? null), `${entry.id}: historical storage identity drifted.`);
      const published = Object.entries(keys).every(([field, key]) => before[field] === key) && before.file_size === statSync(files.main).size && before.source_url === entry.sourceUrl;
      if (!published) {
        required((before.r2_key ?? null) === (entry.compareAndSwap.expectedR2Key ?? null), `${entry.id}: CAS lost to an external write.`);
        required((before.source_url ?? null) === (entry.compareAndSwap.expectedSourceUrl ?? null), `${entry.id}: source URL precondition drifted.`);
        await updateReplicationMedia(client, apiKey, before, keys, statSync(files.main).size, {
          source_url: entry.sourceUrl,
          expectedSourceUrl: entry.compareAndSwap.expectedSourceUrl ?? null,
        });
      }
      state.productionId = entry.productionId;
      state.status = "media-replaced";
      atomicJson(ledgerPath, ledger);
    }
    const verified = await verifyRow(client, apiKey, action, state); state.status = "verified"; state.verifiedAt = new Date().toISOString(); state.urls = { main: verified.url, poster: verified.thumbnail_url, preview: verified.preview_url }; atomicJson(ledgerPath, ledger);
  }
  return { dryRun: false, processed: Math.min(pending.length, limit) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
