#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export const OPERATION = "import-replication-taxonomy";
export const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
export const DEFAULT_TAXONOMY_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/artist-replication-tags.json";
export const DEFAULT_UPLOAD_PLAN_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-plan.json";
export const DEFAULT_UPLOAD_LEDGER_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-ledger.json";
export const DEFAULT_IMPORT_PLAN_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/replication-taxonomy-production-plan.json";
export const DEFAULT_IMPORT_LEDGER_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/replication-taxonomy-production-ledger.json";

const BATCH_SIZE = 25;

function flagValue(argv, name, fallback) {
  const prefix = `${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

export function normalizeIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function mediaTypeForKind(kind) {
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "image" || kind === "gif") return "image";
  return null;
}

function signatureOf({ title, artist, type }) {
  return `${normalizeIdentity(title)}\u0000${normalizeIdentity(artist)}\u0000${type}`;
}

function indexMany(rows, keyOf) {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = index.get(key) ?? [];
    bucket.push(row);
    index.set(key, bucket);
  }
  return index;
}

async function fetchLiveRows(client, apiKey) {
  const rows = [];
  let cursor;
  while (true) {
    const page = await client.query(api.replicationTaxonomy.getMigrationPage, {
      apiKey,
      cursor,
      limit: 200,
    });
    rows.push(...page.rows);
    if (page.isDone) return rows;
    required(page.cursor, "Convex pagination returned no continuation cursor.");
    cursor = page.cursor;
  }
}

function productionIdIndex(uploadPlan, uploadLedger) {
  const result = new Map();
  for (const [id, item] of Object.entries(uploadLedger.items ?? {})) {
    if (item?.productionId) {
      result.set(id, { productionId: item.productionId, method: "upload-ledger-id" });
    }
  }
  for (const entry of uploadPlan.entries ?? []) {
    if (entry?.id && entry?.productionId && !result.has(entry.id)) {
      result.set(entry.id, { productionId: entry.productionId, method: "upload-plan-id" });
    }
  }
  return result;
}

export function reconcileMedia({ taxonomy, uploadPlan, uploadLedger, liveRows }) {
  const byId = new Map(liveRows.map((row) => [row.id, row]));
  const bySlug = indexMany(liveRows, (row) => row.slug);
  const bySignature = indexMany(liveRows, signatureOf);
  const planById = new Map((uploadPlan.entries ?? []).map((entry) => [entry.id, entry]));
  const directIds = productionIdIndex(uploadPlan, uploadLedger);
  const proposals = [];
  const unmatched = [];

  for (const source of taxonomy.mediaClassification ?? []) {
    const type = mediaTypeForKind(source.kind);
    if (!type) {
      unmatched.push({ id: source.id, reason: `unsupported-kind:${source.kind}` });
      continue;
    }

    let live = null;
    let method = null;
    const direct = directIds.get(source.id);
    if (direct) {
      live = byId.get(direct.productionId) ?? null;
      method = live ? direct.method : null;
    }

    const planEntry = planById.get(source.id);
    if (!live && planEntry?.slug) {
      const candidates = bySlug.get(planEntry.slug) ?? [];
      if (candidates.length === 1) {
        live = candidates[0];
        method = "upload-plan-slug";
      }
    }

    if (!live) {
      const candidates = bySignature.get(
        signatureOf({ title: source.title, artist: source.artist, type }),
      ) ?? [];
      if (candidates.length === 1) {
        live = candidates[0];
        method = "exact-title-artist-type";
      }
    }

    if (!live) {
      unmatched.push({ id: source.id, title: source.title, artist: source.artist, reason: "no-unique-live-match" });
      continue;
    }
    if (live.type !== type) {
      unmatched.push({
        id: source.id,
        title: source.title,
        reason: `type-mismatch:${type}->${live.type}`,
        productionId: live.id,
      });
      continue;
    }
    proposals.push({ source, live, method });
  }

  const byLiveId = indexMany(proposals, (proposal) => proposal.live.id);
  const duplicateLiveMatches = [];
  const matched = [];
  for (const proposal of proposals) {
    const collisions = byLiveId.get(proposal.live.id) ?? [];
    if (collisions.length > 1) {
      if (!duplicateLiveMatches.some((item) => item.productionId === proposal.live.id)) {
        duplicateLiveMatches.push({
          productionId: proposal.live.id,
          slug: proposal.live.slug,
          catalogIds: collisions.map((item) => item.source.id),
        });
      }
      continue;
    }
    matched.push(proposal);
  }

  return { matched, unmatched, duplicateLiveMatches };
}

function taxonomyUpdate(proposal, replicationById, sourceDigest, schemaVersion, importedAt) {
  const { source, live } = proposal;
  const detail = replicationById.get(source.id);
  const hasReplicationDetail = source.replicationStatus === "replication" && detail;
  const taxonomy = {
    source_catalog_id: source.id,
    taxonomy_record_key: `catalog:${source.id}`,
    replication_status: source.replicationStatus,
    replication_status_confidence: source.confidence,
    replication_status_review_required: source.reviewRequired === true,
    ...(hasReplicationDetail
      ? {
          viewing_mode: detail.viewingMode,
          viewing_mode_tags: detail.viewingModeTags ?? [],
          viewing_mode_confidence: detail.viewingModeConfidence,
          viewing_mode_review_required: detail.viewingModeReviewRequired === true,
          title_drugs: (detail.drugs ?? []).map((drug) => ({
            slug: drug.slug,
            name: drug.name,
            class: drug.class,
            matched_title_text: drug.matchedTitleText,
          })),
          title_class_mentions: (detail.titleClassMentions ?? []).map((mention) => ({
            class: mention.class,
            matched_title_text: mention.matchedTitleText,
          })),
          drug_classes: detail.drugClasses ?? [],
        }
      : {}),
    content_family:
      source.replicationStatus === "replication"
        ? "experiential-replication"
        : source.replicationStatus === "not-replication"
          ? "explanatory-figure"
          : "uncertain",
    content_tags: [],
    content_family_confidence: source.confidence,
    content_family_review_required: source.reviewRequired === true,
    taxonomy_review_required:
      source.reviewRequired === true || detail?.reviewRequired === true,
    taxonomy_version: schemaVersion,
    taxonomy_source_digest: sourceDigest,
    taxonomy_updated_at: importedAt,
  };
  return {
    id: live.id,
    expected: {
      slug: live.slug,
      title: live.title,
      artist: live.artist,
      type: live.type,
      storage_id: live.storage_id,
      taxonomy_source_digest: live.taxonomy_source_digest,
    },
    taxonomy,
    evidence: {
      replication_status_rationale: source.rationale,
      ...(detail?.viewingModeRationale
        ? { viewing_mode_rationale: detail.viewingModeRationale }
        : {}),
      content_family_rationale:
        source.replicationStatus === "replication"
          ? "Legacy reviewed replication; the v1 importer maps it to the experiential replication family."
          : source.rationale,
    },
    mapping_method: proposal.method,
  };
}

function validateTaxonomySource(taxonomy) {
  const mediaIds = new Set();
  for (const media of taxonomy.mediaClassification ?? []) {
    required(media?.id, "Every media classification needs an id.");
    required(!mediaIds.has(media.id), `Duplicate media classification id: ${media.id}.`);
    mediaIds.add(media.id);
  }

  const replicationIds = new Set();
  for (const replication of taxonomy.replications ?? []) {
    required(replication?.id, "Every replication detail needs an id.");
    required(!replicationIds.has(replication.id), `Duplicate replication detail id: ${replication.id}.`);
    required(
      mediaIds.has(replication.id),
      `Replication detail ${replication.id} has no media classification.`,
    );
    replicationIds.add(replication.id);
  }

  const artistKeys = new Set();
  for (const artist of taxonomy.artists ?? []) {
    const key = normalizeIdentity(artist.artist);
    required(key, "Every artist taxonomy row needs a non-blank artist name.");
    required(!artistKeys.has(key), `Duplicate artist taxonomy key: ${key}.`);
    artistKeys.add(key);
  }
}

function artistUpdate(artist, existingDigest, sourceDigest, schemaVersion, importedAt) {
  return {
    key: normalizeIdentity(artist.artist),
    display_name: artist.artist,
    primary_type: artist.primaryType,
    artist_type_tags: artist.artistTypeTags ?? [],
    confidence: artist.confidence,
    rationale: artist.rationale,
    review_required: artist.reviewRequired === true,
    classification_review_count: artist.classificationReviewCount ?? 1,
    ...(typeof artist.classificationReviewAgreement === "boolean"
      ? { classification_review_agreement: artist.classificationReviewAgreement }
      : {}),
    replication_count: artist.replicationCount ?? 0,
    taxonomy_version: schemaVersion,
    taxonomy_source_digest: sourceDigest,
    imported_at: importedAt,
    expected_source_digest: existingDigest ?? null,
  };
}

export function selectCanary(replications, artists) {
  const selected = new Map();
  const take = (predicate) => {
    const found = replications.find((entry) => predicate(entry) && !selected.has(entry.id));
    if (found) selected.set(found.id, found);
  };
  take((entry) => entry.taxonomy.replication_status === "not-replication");
  take((entry) => entry.taxonomy.viewing_mode === "open-eye");
  take((entry) => entry.taxonomy.viewing_mode === "closed-eye");
  take((entry) => entry.taxonomy.viewing_mode === "mixed");
  take((entry) => (entry.taxonomy.title_drugs?.length ?? 0) > 0);
  take((entry) => entry.taxonomy.replication_status === "unreviewed");

  const artistSelected = new Map();
  for (const primaryType of [
    "replicator",
    "traditional-psychedelic-artist",
    "mixed",
    "other",
    "uncertain",
  ]) {
    const found = artists.find((entry) => entry.primary_type === primaryType);
    if (found) artistSelected.set(found.key, found);
  }
  return {
    replications: [...selected.values()],
    artists: [...artistSelected.values()],
  };
}

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function loadLedger(path, sourceDigest, schemaVersion) {
  if (!existsSync(path)) {
    return {
      schemaVersion: 1,
      operation: OPERATION,
      target: EXPECTED_TARGET,
      taxonomySourceDigest: sourceDigest,
      taxonomyVersion: schemaVersion,
      canaryVerified: false,
      replications: {},
      artists: {},
    };
  }
  const ledger = readJson(path);
  required(ledger.operation === OPERATION, `Unexpected ledger operation in ${path}.`);
  required(ledger.target === EXPECTED_TARGET, `Unexpected ledger target in ${path}.`);
  required(
    ledger.taxonomySourceDigest === sourceDigest,
    "The taxonomy source changed; use a new ledger or explicitly reconcile the old campaign.",
  );
  return ledger;
}

function summarizeBy(rows, keyOf) {
  const counts = {};
  for (const row of rows) {
    const key = keyOf(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function verifyReplicationBatch(client, apiKey, batch, sourceDigest) {
  const result = await client.query(api.replicationTaxonomy.getByIds, {
    apiKey,
    ids: batch.map((entry) => entry.id),
  });
  required(result.missing.length === 0, `Read-back lost ${result.missing.length} replication row(s).`);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  for (const entry of batch) {
    const row = byId.get(entry.id);
    required(row?.taxonomy_source_digest === sourceDigest, `Taxonomy digest did not persist on ${entry.id}.`);
    required(
      row.replication_status === entry.taxonomy.replication_status,
      `Replication status did not persist on ${row.slug}.`,
    );
  }
}

async function verifyArtistBatch(client, apiKey, batch, sourceDigest) {
  const rows = await client.query(api.replicationTaxonomy.getArtistsByKeys, {
    apiKey,
    keys: batch.map((entry) => entry.key),
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const entry of batch) {
    required(
      byKey.get(entry.key)?.taxonomy_source_digest === sourceDigest,
      `Artist taxonomy digest did not persist on ${entry.key}.`,
    );
  }
}

async function main(argv = process.argv.slice(2)) {
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  required(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);

  const taxonomyPath = resolve(flagValue(argv, "--taxonomy-path", DEFAULT_TAXONOMY_PATH));
  const uploadPlanPath = resolve(flagValue(argv, "--upload-plan", DEFAULT_UPLOAD_PLAN_PATH));
  const uploadLedgerPath = resolve(flagValue(argv, "--upload-ledger", DEFAULT_UPLOAD_LEDGER_PATH));
  const importPlanPath = resolve(flagValue(argv, "--plan-path", DEFAULT_IMPORT_PLAN_PATH));
  const importLedgerPath = resolve(flagValue(argv, "--ledger-path", DEFAULT_IMPORT_LEDGER_PATH));
  const sourceDigest = sha256File(taxonomyPath);
  const taxonomy = readJson(taxonomyPath);
  const uploadPlan = readJson(uploadPlanPath);
  const uploadLedger = readJson(uploadLedgerPath);
  const schemaVersion = taxonomy.schemaVersion;
  required(Number.isInteger(schemaVersion) && schemaVersion > 0, "Taxonomy schemaVersion must be positive.");
  validateTaxonomySource(taxonomy);

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const client = new ConvexHttpClient(command.targetUrl);
  const liveRows = await fetchLiveRows(client, apiKey);
  const reconciliation = reconcileMedia({ taxonomy, uploadPlan, uploadLedger, liveRows });
  required(
    reconciliation.duplicateLiveMatches.length === 0,
    `${reconciliation.duplicateLiveMatches.length} live row(s) matched more than one catalog ID.`,
  );

  const existingArtists = await client.query(api.replicationTaxonomy.getArtistsByKeys, {
    apiKey,
    keys: (taxonomy.artists ?? []).map((artist) => normalizeIdentity(artist.artist)),
  });
  const artistDigestByKey = new Map(
    existingArtists.map((artist) => [artist.key, artist.taxonomy_source_digest]),
  );
  const importedAt = Date.now();
  const replicationById = new Map((taxonomy.replications ?? []).map((row) => [row.id, row]));
  const replicationUpdates = reconciliation.matched.map((proposal) =>
    taxonomyUpdate(proposal, replicationById, sourceDigest, schemaVersion, importedAt),
  );
  const artistUpdates = (taxonomy.artists ?? []).map((artist) =>
    artistUpdate(
      artist,
      artistDigestByKey.get(normalizeIdentity(artist.artist)),
      sourceDigest,
      schemaVersion,
      importedAt,
    ),
  );

  const plan = {
    schemaVersion: 1,
    operation: OPERATION,
    generatedAt: new Date(importedAt).toISOString(),
    target: command.targetUrl,
    taxonomyPath,
    taxonomySourceDigest: sourceDigest,
    taxonomyVersion: schemaVersion,
    liveRows: liveRows.length,
    counts: {
      sourceMedia: taxonomy.mediaClassification?.length ?? 0,
      matchedMedia: replicationUpdates.length,
      unmatchedMedia: reconciliation.unmatched.length,
      artists: artistUpdates.length,
      mappingMethods: summarizeBy(replicationUpdates, (row) => row.mapping_method),
      replicationStatuses: summarizeBy(
        replicationUpdates,
        (row) => row.taxonomy.replication_status,
      ),
      viewingModes: summarizeBy(
        replicationUpdates.filter((row) => row.taxonomy.viewing_mode),
        (row) => row.taxonomy.viewing_mode,
      ),
    },
    unmatched: reconciliation.unmatched,
    duplicateLiveMatches: reconciliation.duplicateLiveMatches,
    replications: replicationUpdates.map((entry) => ({
      catalogId: entry.taxonomy.source_catalog_id,
      productionId: entry.id,
      slug: entry.expected.slug,
      mappingMethod: entry.mapping_method,
      replicationStatus: entry.taxonomy.replication_status,
      viewingMode: entry.taxonomy.viewing_mode ?? null,
      drugClasses: entry.taxonomy.drug_classes ?? [],
    })),
    artists: artistUpdates.map((entry) => ({
      key: entry.key,
      displayName: entry.display_name,
      primaryType: entry.primary_type,
      artistTypeTags: entry.artist_type_tags,
    })),
  };
  atomicJson(importPlanPath, plan);

  console.log(`\nLive replications: ${liveRows.length}`);
  console.log(`Matched catalog rows: ${replicationUpdates.length}`);
  console.log(`Unmatched catalog rows: ${reconciliation.unmatched.length}`);
  console.log(`Artist taxonomy rows: ${artistUpdates.length}`);
  console.log(`Plan: ${importPlanPath}`);
  console.log(`Mapping: ${JSON.stringify(plan.counts.mappingMethods)}`);
  console.log(`Statuses: ${JSON.stringify(plan.counts.replicationStatuses)}`);

  if (command.dryRun) {
    console.log("Dry run complete — no Convex writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  required(hasFlag(argv, "--confirm-taxonomy-import"), "Write requires --confirm-taxonomy-import.");
  const canary = hasFlag(argv, "--canary");
  const ledger = loadLedger(importLedgerPath, sourceDigest, schemaVersion);
  if (!canary) {
    required(ledger.canaryVerified === true, "Run and verify --canary before the full import.");
  }

  const selection = canary
    ? selectCanary(replicationUpdates, artistUpdates)
    : { replications: replicationUpdates, artists: artistUpdates };
  const pendingReplications = selection.replications.filter(
    (entry) =>
      ledger.replications[entry.taxonomy.source_catalog_id]?.verified !== true ||
      entry.expected.taxonomy_source_digest !== sourceDigest,
  );
  const pendingArtists = selection.artists.filter(
    (entry) =>
      ledger.artists[entry.key]?.verified !== true ||
      entry.expected_source_digest !== sourceDigest,
  );
  const operationId = `${OPERATION}:${sourceDigest.slice(0, 16)}:${canary ? "canary" : "full"}`;

  for (const batch of chunks(pendingReplications)) {
    await client.mutation(api.replicationTaxonomy.applyBatch, {
      apiKey,
      operation_id: operationId,
      replications: batch.map(({ mapping_method: _mappingMethod, ...entry }) => entry),
      artists: [],
    });
    await verifyReplicationBatch(client, apiKey, batch, sourceDigest);
    for (const entry of batch) {
      ledger.replications[entry.taxonomy.source_catalog_id] = {
        productionId: entry.id,
        slug: entry.expected.slug,
        replicationStatus: entry.taxonomy.replication_status,
        viewingMode: entry.taxonomy.viewing_mode ?? null,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }
    atomicJson(importLedgerPath, ledger);
    console.log(`Verified ${batch.length} replication taxonomy row(s).`);
  }

  for (const batch of chunks(pendingArtists)) {
    await client.mutation(api.replicationTaxonomy.applyBatch, {
      apiKey,
      operation_id: operationId,
      replications: [],
      artists: batch,
    });
    await verifyArtistBatch(client, apiKey, batch, sourceDigest);
    for (const entry of batch) {
      ledger.artists[entry.key] = {
        displayName: entry.display_name,
        primaryType: entry.primary_type,
        artistTypeTags: entry.artist_type_tags,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }
    atomicJson(importLedgerPath, ledger);
    console.log(`Verified ${batch.length} artist taxonomy row(s).`);
  }

  if (canary) {
    ledger.canaryVerified = true;
    ledger.canaryVerifiedAt = new Date().toISOString();
    atomicJson(importLedgerPath, ledger);
  }
  console.log(
    `${canary ? "Canary" : "Full import"} complete: ${pendingReplications.length} replication and ${pendingArtists.length} artist row(s) written and verified.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
