#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export const OPERATION = "import-current-library-taxonomy";
export const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
export const DEFAULT_TAXONOMY_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy-reviewed.json";
export const DEFAULT_PLAN_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy-production-plan.json";
export const DEFAULT_LEDGER_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/current-library-taxonomy-production-ledger.json";

const BATCH_SIZE = 25;

function flagValue(argv, name, fallback) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
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

function chunks(values, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function equalSet(left, right) {
  return JSON.stringify(stable(left ?? [])) === JSON.stringify(stable(right ?? []));
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

function loadLedger(path, sourceDigest) {
  if (!existsSync(path)) {
    return {
      schemaVersion: 1,
      operation: OPERATION,
      target: EXPECTED_TARGET,
      taxonomySourceDigest: sourceDigest,
      taxonomyVersion: 2,
      canaryVerified: false,
      rows: {},
      artists: {},
    };
  }
  const ledger = readJson(path);
  required(ledger.operation === OPERATION, `Unexpected ledger operation in ${path}.`);
  required(ledger.target === EXPECTED_TARGET, `Unexpected ledger target in ${path}.`);
  required(
    ledger.taxonomySourceDigest === sourceDigest,
    "The taxonomy source changed; use a new ledger after explicitly reconciling the campaign.",
  );
  return ledger;
}

function loadPreviousLedger(path) {
  if (!path) return null;
  required(existsSync(path), `Previous ledger does not exist: ${path}.`);
  const ledger = readJson(path);
  required(ledger.operation === OPERATION, `Unexpected previous ledger operation in ${path}.`);
  required(ledger.target === EXPECTED_TARGET, `Unexpected previous ledger target in ${path}.`);
  required(ledger.taxonomySourceDigest, `Previous ledger has no taxonomy source digest: ${path}.`);
  return ledger;
}

export function priorLedgerOwnsRow(priorLedger, source, liveDigest) {
  if (!priorLedger || priorLedger.taxonomySourceDigest !== liveDigest) return false;
  const ledgerRow = priorLedger.rows?.[source.taxonomyRecordKey];
  return ledgerRow?.verified === true && ledgerRow.productionId === source.productionId;
}

function validateManifest(manifest) {
  required(manifest.schemaVersion === 2, "Current library taxonomy must use schemaVersion 2.");
  required(manifest.target === EXPECTED_TARGET, "Taxonomy manifest targets the wrong deployment.");
  required(Array.isArray(manifest.rows) && manifest.rows.length > 0, "Taxonomy manifest has no rows.");
  required(Array.isArray(manifest.artists) && manifest.artists.length > 0, "Taxonomy manifest has no artists.");
  const ids = new Set();
  const recordKeys = new Set();
  for (const row of manifest.rows) {
    required(row.productionId && !ids.has(row.productionId), `Duplicate or missing production id: ${row.productionId}.`);
    required(row.taxonomyRecordKey && !recordKeys.has(row.taxonomyRecordKey), `Duplicate or missing taxonomy record key: ${row.taxonomyRecordKey}.`);
    required(row.replicationStatus !== "replication" || row.viewingMode, `Confirmed replication ${row.expected.slug} has no viewing mode.`);
    ids.add(row.productionId);
    recordKeys.add(row.taxonomyRecordKey);
  }
  const artistKeys = new Set();
  for (const artist of manifest.artists) {
    required(artist.key && !artistKeys.has(artist.key), `Duplicate or missing artist key: ${artist.key}.`);
    artistKeys.add(artist.key);
  }
}

export function reconcileRows(manifest, liveRows, ledger, previousLedger, sourceDigest, importedAt) {
  const liveById = new Map(liveRows.map((row) => [row.id, row]));
  const updates = [];
  for (const source of manifest.rows) {
    const live = liveById.get(source.productionId);
    required(live, `Production row ${source.productionId} no longer exists.`);
    for (const [field, expected, actual] of [
      ["slug", source.expected.slug, live.slug],
      ["title", source.expected.title, live.title],
      ["artist", source.expected.artist, live.artist],
      ["type", source.expected.type, live.type],
      ["storage id", source.expected.storageId ?? null, live.storage_id ?? null],
      ["R2 key", source.expected.r2Key ?? null, live.r2_key ?? null],
      ["direct URL", source.expected.url ?? null, live.url ?? null],
    ]) {
      required(expected === actual, `${field} changed after snapshot for ${source.productionId}.`);
    }
    const ledgerRow = ledger.rows[source.taxonomyRecordKey];
    const expectedPreviousDigest = source.expected.taxonomySourceDigest ?? null;
    const liveDigest = live.taxonomy_source_digest ?? null;
    const alreadyVerified = ledgerRow?.verified === true && liveDigest === sourceDigest;
    const verifiedByPreviousCampaign = priorLedgerOwnsRow(previousLedger, source, liveDigest);
    required(
      alreadyVerified || verifiedByPreviousCampaign || liveDigest === expectedPreviousDigest,
      `Taxonomy changed after snapshot for ${source.expected.slug}.`,
    );
    updates.push({
      id: live.id,
      expected: {
        slug: live.slug,
        title: live.title,
        artist: live.artist,
        type: live.type,
        storage_id: live.storage_id ?? null,
        r2_key: live.r2_key ?? null,
        url: live.url ?? null,
        taxonomy_source_digest: liveDigest,
      },
      taxonomy: {
        ...(source.sourceCatalogId ? { source_catalog_id: source.sourceCatalogId } : {}),
        taxonomy_record_key: source.taxonomyRecordKey,
        replication_status: source.replicationStatus,
        replication_status_confidence: source.replicationStatusConfidence,
        replication_status_review_required: source.replicationStatusReviewRequired,
        ...(source.viewingMode
          ? {
              viewing_mode: source.viewingMode,
              viewing_mode_tags: source.viewingModeTags,
              viewing_mode_confidence: source.viewingModeConfidence,
              viewing_mode_review_required: source.viewingModeReviewRequired,
            }
          : {}),
        title_drugs: source.titleDrugs,
        title_class_mentions: source.titleClassMentions,
        drug_classes: source.drugClasses,
        content_family: source.contentFamily,
        content_tags: source.contentTags,
        content_family_confidence: source.contentFamilyConfidence,
        content_family_review_required: source.contentFamilyReviewRequired,
        taxonomy_review_required: source.taxonomyReviewRequired,
        taxonomy_version: manifest.schemaVersion,
        taxonomy_source_digest: sourceDigest,
        taxonomy_updated_at: importedAt,
      },
      evidence: {
        replication_status_rationale: source.replicationStatusRationale,
        ...(source.viewingModeRationale
          ? { viewing_mode_rationale: source.viewingModeRationale }
          : {}),
        content_family_rationale: source.contentFamilyRationale ?? source.decisionBasis,
      },
    });
  }
  required(liveRows.length === manifest.rows.length, `Live row count ${liveRows.length} differs from manifest ${manifest.rows.length}.`);
  return updates;
}

function artistUpdates(manifest, existingArtists, sourceDigest, importedAt) {
  const digestByKey = new Map(existingArtists.map((artist) => [artist.key, artist.taxonomy_source_digest]));
  return manifest.artists.map((artist) => ({
    key: artist.key,
    display_name: artist.displayName,
    primary_type: artist.primaryType,
    artist_type_tags: artist.artistTypeTags,
    confidence: artist.confidence,
    rationale: artist.rationale,
    review_required: artist.reviewRequired,
    classification_review_count: artist.classificationReviewCount,
    replication_count: artist.replicationCount,
    taxonomy_version: manifest.schemaVersion,
    taxonomy_source_digest: sourceDigest,
    imported_at: importedAt,
    expected_source_digest: digestByKey.get(artist.key) ?? null,
  }));
}

export function selectCanary(rows, artists) {
  const selectedRows = new Map();
  const takeRow = (predicate) => {
    const row = rows.find((item) => predicate(item) && !selectedRows.has(item.id));
    if (row) selectedRows.set(row.id, row);
  };
  for (const status of ["not-replication", "replication", "unclear"]) {
    takeRow((row) => row.taxonomy.replication_status === status);
  }
  for (const mode of ["open-eye", "closed-eye", "mixed"]) {
    takeRow((row) => row.taxonomy.viewing_mode === mode);
  }
  for (const family of [
    "experiential-replication",
    "explanatory-figure",
    "traditional-cultural-art",
    "dark-surrealism",
    "optical-perceptual-art",
    "visionary-psychedelic-art",
    "generative-abstract-art",
    "effect-illustration",
    "uncertain",
  ]) {
    takeRow((row) => row.taxonomy.content_family === family);
  }
  for (const drugClass of ["psychedelics", "dissociatives", "deliriants", "other"]) {
    takeRow((row) => row.taxonomy.drug_classes.includes(drugClass));
  }

  const selectedArtists = new Map();
  for (const primaryType of [
    "replicator",
    "traditional-psychedelic-artist",
    "mixed",
    "other",
    "uncertain",
  ]) {
    const artist = artists.find((item) => item.primary_type === primaryType);
    if (artist) selectedArtists.set(artist.key, artist);
  }
  return { rows: [...selectedRows.values()], artists: [...selectedArtists.values()] };
}

async function verifyRows(client, apiKey, batch, sourceDigest) {
  const result = await client.query(api.replicationTaxonomy.getByIds, {
    apiKey,
    ids: batch.map((row) => row.id),
  });
  required(result.missing.length === 0, `Read-back lost ${result.missing.length} row(s).`);
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  for (const expected of batch) {
    const actual = byId.get(expected.id);
    required(actual?.taxonomy_source_digest === sourceDigest, `Digest did not persist on ${expected.expected.slug}.`);
    required(actual.replication_status === expected.taxonomy.replication_status, `Status did not persist on ${expected.expected.slug}.`);
    required(actual.viewing_mode === (expected.taxonomy.viewing_mode ?? null), `Viewing mode did not persist on ${expected.expected.slug}.`);
    required(actual.content_family === expected.taxonomy.content_family, `Content family did not persist on ${expected.expected.slug}.`);
    required(equalSet(actual.viewing_mode_tags, expected.taxonomy.viewing_mode_tags), `Viewing tags did not persist on ${expected.expected.slug}.`);
    required(equalSet(actual.drug_classes, expected.taxonomy.drug_classes), `Drug classes did not persist on ${expected.expected.slug}.`);
    required(equalSet(actual.title_drugs, expected.taxonomy.title_drugs), `Title drugs did not persist on ${expected.expected.slug}.`);
    required(equalSet(actual.content_tags, expected.taxonomy.content_tags), `Content tags did not persist on ${expected.expected.slug}.`);
  }
}

async function verifyArtists(client, apiKey, batch, sourceDigest) {
  const rows = await client.query(api.replicationTaxonomy.getArtistsByKeys, {
    apiKey,
    keys: batch.map((artist) => artist.key),
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const expected of batch) {
    const actual = byKey.get(expected.key);
    required(actual?.taxonomy_source_digest === sourceDigest, `Artist digest did not persist on ${expected.key}.`);
    required(actual.primary_type === expected.primary_type, `Artist type did not persist on ${expected.key}.`);
    required(equalSet(actual.artist_type_tags, expected.artist_type_tags), `Artist tags did not persist on ${expected.key}.`);
  }
}

function summarize(rows, keyOf) {
  const counts = {};
  for (const row of rows) {
    const key = keyOf(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function main(argv = process.argv.slice(2)) {
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  required(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);

  const taxonomyPath = resolve(flagValue(argv, "--taxonomy-path", DEFAULT_TAXONOMY_PATH));
  const planPath = resolve(flagValue(argv, "--plan-path", DEFAULT_PLAN_PATH));
  const ledgerPath = resolve(flagValue(argv, "--ledger-path", DEFAULT_LEDGER_PATH));
  const previousLedgerValue = flagValue(argv, "--previous-ledger-path", null);
  const previousLedgerPath = previousLedgerValue ? resolve(previousLedgerValue) : null;
  const sourceDigest = sha256File(taxonomyPath);
  const manifest = readJson(taxonomyPath);
  validateManifest(manifest);
  const ledger = loadLedger(ledgerPath, sourceDigest);
  const previousLedger = loadPreviousLedger(previousLedgerPath);

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const client = new ConvexHttpClient(command.targetUrl);
  const liveRows = await fetchLiveRows(client, apiKey);
  const existingArtists = await client.query(api.replicationTaxonomy.getArtistsByKeys, {
    apiKey,
    keys: manifest.artists.map((artist) => artist.key),
  });
  const importedAt = Date.now();
  const rows = reconcileRows(manifest, liveRows, ledger, previousLedger, sourceDigest, importedAt);
  const artists = artistUpdates(manifest, existingArtists, sourceDigest, importedAt);
  const plan = {
    schemaVersion: 1,
    operation: OPERATION,
    generatedAt: new Date(importedAt).toISOString(),
    target: command.targetUrl,
    taxonomyPath,
    taxonomySourceDigest: sourceDigest,
    ...(previousLedgerPath
      ? {
          previousLedgerPath,
          previousTaxonomySourceDigest: previousLedger.taxonomySourceDigest,
        }
      : {}),
    sourceSnapshotDigest: manifest.snapshotDigest,
    taxonomyVersion: manifest.schemaVersion,
    counts: {
      rows: rows.length,
      artists: artists.length,
      replicationStatus: summarize(rows, (row) => row.taxonomy.replication_status),
      viewingMode: summarize(rows.filter((row) => row.taxonomy.viewing_mode), (row) => row.taxonomy.viewing_mode),
      contentFamily: summarize(rows, (row) => row.taxonomy.content_family),
    },
    rows: rows.map((row) => ({
      productionId: row.id,
      slug: row.expected.slug,
      taxonomyRecordKey: row.taxonomy.taxonomy_record_key,
      replicationStatus: row.taxonomy.replication_status,
      viewingMode: row.taxonomy.viewing_mode ?? null,
      contentFamily: row.taxonomy.content_family,
      drugClasses: row.taxonomy.drug_classes,
    })),
    artists: artists.map((artist) => ({ key: artist.key, primaryType: artist.primary_type })),
  };
  atomicJson(planPath, plan);

  console.log(`Live rows: ${liveRows.length}`);
  console.log(`Taxonomy rows: ${rows.length}`);
  console.log(`Artist rows: ${artists.length}`);
  console.log(`Plan: ${planPath}`);
  console.log(`Statuses: ${JSON.stringify(plan.counts.replicationStatus)}`);

  if (command.dryRun) {
    console.log("Dry run complete — no Convex writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  required(hasFlag(argv, "--confirm-taxonomy-import"), "Write requires --confirm-taxonomy-import.");
  const canary = hasFlag(argv, "--canary");
  if (!canary) required(ledger.canaryVerified === true, "Run and verify --canary first.");
  const selection = canary ? selectCanary(rows, artists) : { rows, artists };
  const pendingRows = selection.rows.filter(
    (row) => ledger.rows[row.taxonomy.taxonomy_record_key]?.verified !== true,
  );
  const pendingArtists = selection.artists.filter(
    (artist) => ledger.artists[artist.key]?.verified !== true,
  );
  const operationId = `${OPERATION}:${sourceDigest.slice(0, 16)}:${canary ? "canary" : "full"}`;

  for (const batch of chunks(pendingRows)) {
    await client.mutation(api.replicationTaxonomy.applyBatch, {
      apiKey,
      operation_id: operationId,
      replications: batch,
      artists: [],
    });
    await verifyRows(client, apiKey, batch, sourceDigest);
    for (const row of batch) {
      ledger.rows[row.taxonomy.taxonomy_record_key] = {
        productionId: row.id,
        slug: row.expected.slug,
        replicationStatus: row.taxonomy.replication_status,
        viewingMode: row.taxonomy.viewing_mode ?? null,
        contentFamily: row.taxonomy.content_family,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }
    atomicJson(ledgerPath, ledger);
    console.log(`Verified ${batch.length} taxonomy row(s).`);
  }

  for (const batch of chunks(pendingArtists)) {
    await client.mutation(api.replicationTaxonomy.applyBatch, {
      apiKey,
      operation_id: operationId,
      replications: [],
      artists: batch,
    });
    await verifyArtists(client, apiKey, batch, sourceDigest);
    for (const artist of batch) {
      ledger.artists[artist.key] = {
        displayName: artist.display_name,
        primaryType: artist.primary_type,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }
    atomicJson(ledgerPath, ledger);
    console.log(`Verified ${batch.length} artist row(s).`);
  }

  if (canary) {
    ledger.canaryVerified = true;
    ledger.canaryVerifiedAt = new Date().toISOString();
    atomicJson(ledgerPath, ledger);
  }
  console.log(`${canary ? "Canary" : "Full import"} complete: ${pendingRows.length} row(s), ${pendingArtists.length} artist(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
