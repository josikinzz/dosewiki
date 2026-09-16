#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { makeFunctionReference } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPERATION = "replication-date-backfill";
const SOURCE_ARTIFACT_NAME = "dose-wiki-item-dates-refined.json";
const DEFAULT_BATCH_SIZE = 40;
const MAX_BATCH_SIZE = 50;
const DATE_KINDS = new Set([
  "exact_date",
  "year",
  "range",
  "upper_bound",
  "inferred",
  "unknown",
]);
const CONFIDENCE_ALIASES = new Map([
  ["high", "high"],
  ["medium-high", "medium-high"],
  ["medium_high", "medium-high"],
  ["medium", "medium"],
  ["medium-low", "medium-low"],
  ["medium_low", "medium-low"],
  ["low", "low"],
  ["none", "none"],
]);

const getAllReplications = makeFunctionReference("replications:getAll");
const applyResearchBatch = makeFunctionReference("replicationDates:applyResearchBatch");
const getResearchByReplicationIds = makeFunctionReference(
  "replicationDates:getResearchByReplicationIds",
);

function flagValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableObject(entry)]),
  );
}

function digest(value) {
  return sha256(JSON.stringify(stableObject(value)));
}

function writeJsonAtomic(filename, value) {
  const resolved = path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, resolved);
}

function nonBlank(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeConfidence(value, slug) {
  const normalized = CONFIDENCE_ALIASES.get(value);
  if (!normalized) throw new Error(`${slug}: unsupported confidence ${JSON.stringify(value)}.`);
  return normalized;
}

function normalizeDateKind(value, slug) {
  if (!DATE_KINDS.has(value)) {
    throw new Error(`${slug}: unsupported date kind ${JSON.stringify(value)}.`);
  }
  return value;
}

function normalizeEvidence(entry, slug) {
  const url = nonBlank(entry?.url);
  const sourceLocator = nonBlank(
    entry?.path
      ?? entry?.localPath
      ?? (Array.isArray(entry?.paths) ? entry.paths.filter(nonBlank).join(" | ") : null)
      ?? entry?.source_locator,
  );
  const description = nonBlank(entry?.description ?? entry?.claim ?? entry?.supports);
  if (!url && !sourceLocator) {
    throw new Error(`${slug}: evidence lacks both a URL and source locator.`);
  }
  if (!description) {
    throw new Error(`${slug}: evidence lacks a description/claim.`);
  }
  return {
    ...(url ? { url } : {}),
    ...(sourceLocator ? { source_locator: sourceLocator } : {}),
    ...(nonBlank(entry?.type ?? entry?.sourceType)
      ? { source_type: nonBlank(entry?.type ?? entry?.sourceType) }
      : {}),
    description,
    ...(nonBlank(entry?.retrievedAt ?? entry?.retrievalDate)
      ? { retrieved_at: nonBlank(entry?.retrievedAt ?? entry?.retrievalDate) }
      : {}),
    ...(nonBlank(entry?.limitations) ? { limitations: nonBlank(entry.limitations) } : {}),
  };
}

function normalizeAlternativeDate(claim, slug) {
  const value = nonBlank(claim?.date ?? claim?.value);
  if (!value) throw new Error(`${slug}: alternative date lacks a value.`);
  const evidence = Array.isArray(claim.evidence)
    ? claim.evidence.map((entry) => normalizeEvidence(entry, slug))
    : [];
  return {
    value,
    kind: normalizeDateKind(claim.dateKind ?? claim.kind, slug),
    ...(nonBlank(claim.eventType) ? { event_type: nonBlank(claim.eventType) } : {}),
    confidence: normalizeConfidence(claim.confidence, slug),
    ...(nonBlank(claim.rationale) ? { rationale: nonBlank(claim.rationale) } : {}),
    ...(nonBlank(claim.limitations) ? { limitations: nonBlank(claim.limitations) } : {}),
    ...(evidence.length > 0 ? { evidence } : {}),
  };
}

function finalDetail(record) {
  return record.dateBoundResearch?.raw ?? record.raw ?? {};
}

function researchedAt(record, document) {
  const detail = finalDetail(record);
  return nonBlank(
    record.dateBoundResearch?.retrievedAt
      ?? detail.retrievedAt
      ?? detail.retrievalDate
      ?? record.raw?.retrievedAt
      ?? record.raw?.retrievalDate
      ?? document.generatedAt,
  );
}

function buildItem(record, document, sourceArtifactSha256) {
  const slug = nonBlank(record.raw?.slug);
  if (!slug) throw new Error(`${record.liveId}: canonical slug is missing.`);
  const detail = finalDetail(record);
  const kind = normalizeDateKind(record.dateKind, slug);
  const value = nonBlank(record.date);
  if (kind === "unknown" && value) {
    throw new Error(`${slug}: unknown date unexpectedly has a value.`);
  }
  if (kind !== "unknown" && !value) {
    throw new Error(`${slug}: ${kind} date lacks a value.`);
  }
  const researchDate = researchedAt(record, document);
  if (!researchDate) throw new Error(`${slug}: research timestamp is missing.`);

  const evidence = Array.isArray(detail.evidence)
    ? detail.evidence.map((entry) => normalizeEvidence(entry, slug))
    : [];
  const methods = Array.isArray(detail.methods)
    ? detail.methods.map(nonBlank).filter(Boolean)
    : [];
  const rejectedDates = Array.isArray(detail.rejectedDates)
    ? detail.rejectedDates.map((entry) => ({
        value: nonBlank(entry.value),
        reason: nonBlank(entry.reason),
      }))
    : [];
  for (const rejected of rejectedDates) {
    if (!rejected.value || !rejected.reason) {
      throw new Error(`${slug}: rejected date needs both value and reason.`);
    }
  }
  const alternativeDates = Array.isArray(record.raw?.auxiliaryDateClaims)
    ? record.raw.auxiliaryDateClaims.map((claim) => normalizeAlternativeDate(claim, slug))
    : [];
  const sourceUrls = [...new Set((record.sourceUrls ?? []).map(nonBlank).filter(Boolean))];
  const dateInfo = {
    ...(value ? { value } : {}),
    kind,
    ...(nonBlank(record.eventType) ? { event_type: nonBlank(record.eventType) } : {}),
    confidence: normalizeConfidence(record.confidence, slug),
    researched_at: researchDate,
  };
  const payload = {
    replication_id: record.liveId,
    expected: {
      slug,
      title: record.title,
      artist: record.artist,
    },
    date_info: dateInfo,
    rationale: record.rationale,
    source_urls: sourceUrls,
    evidence,
    ...(methods.length > 0 ? { methods } : {}),
    ...(rejectedDates.length > 0 ? { rejected_dates: rejectedDates } : {}),
    ...(alternativeDates.length > 0 ? { alternative_dates: alternativeDates } : {}),
    source_artifact: SOURCE_ARTIFACT_NAME,
    source_artifact_sha256: sourceArtifactSha256,
  };
  return {
    ...payload,
    source_record_sha256: digest(payload),
  };
}

function batches(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function sameJson(left, right) {
  return JSON.stringify(stableObject(left)) === JSON.stringify(stableObject(right));
}

async function verify(client, apiKey, items) {
  const liveRows = await client.query(getAllReplications, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const summaryMismatches = items.filter(
    (item) => !sameJson(liveById.get(item.replication_id)?.date_info, item.date_info),
  );

  const researchRows = [];
  for (const group of batches(items, 100)) {
    researchRows.push(
      ...(await client.query(getResearchByReplicationIds, {
        apiKey,
        replicationIds: group.map((item) => item.replication_id),
      })),
    );
  }
  const researchById = new Map(researchRows.map((row) => [row.replication_id, row]));
  const researchMismatches = items.filter((item) => {
    const row = researchById.get(item.replication_id);
    return !row?.research
      || row.research.source_record_sha256 !== item.source_record_sha256
      || row.research.source_artifact_sha256 !== item.source_artifact_sha256
      || !sameJson(row.research.date_info, item.date_info);
  });
  return {
    verified: items.length - new Set([
      ...summaryMismatches.map((item) => item.replication_id),
      ...researchMismatches.map((item) => item.replication_id),
    ]).size,
    summaryMismatches: summaryMismatches.map((item) => item.replication_id),
    researchMismatches: researchMismatches.map((item) => item.replication_id),
  };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION, startDir: ROOT });
  printProductionWriteCommand(command);
  if (!command.targetUrl) {
    throw new Error("Set TARGET_POSTGRES_URL or --target for the production comparison.");
  }

  const inputFlag = flagValue("--input");
  if (!inputFlag) throw new Error("Pass --input=/absolute/path/dose-wiki-item-dates-refined.json.");
  const inputPath = path.resolve(inputFlag);
  const inputBytes = fs.readFileSync(inputPath);
  const document = JSON.parse(inputBytes.toString("utf8"));
  if (!Array.isArray(document.records) || document.records.length !== document.recordCount) {
    throw new Error("Date research recordCount does not match records length.");
  }

  const sourceArtifactSha256 = sha256(inputBytes);
  const items = document.records.map((record) => buildItem(record, document, sourceArtifactSha256));
  const ids = items.map((item) => item.replication_id);
  if (new Set(ids).size !== ids.length) throw new Error("Date research contains duplicate live IDs.");

  const client = createDataClient({ target: command.targetUrl }).client;
  const liveRows = await client.query(getAllReplications, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const missing = [];
  const identityConflicts = [];
  const existingDateSummaries = [];
  for (const item of items) {
    const live = liveById.get(item.replication_id);
    if (!live) {
      missing.push(item.replication_id);
      continue;
    }
    if ((live.role ?? "replication") !== "replication") {
      identityConflicts.push({ id: item.replication_id, field: "role", expected: "replication", live: live.role });
    }
    for (const field of ["slug", "title", "artist"]) {
      if (live[field] !== item.expected[field]) {
        identityConflicts.push({
          id: item.replication_id,
          field,
          expected: item.expected[field],
          live: live[field],
        });
      }
    }
    if (live.date_info) existingDateSummaries.push(item.replication_id);
  }
  if (missing.length > 0 || identityConflicts.length > 0) {
    throw new Error(
      `Production reconciliation failed: ${missing.length} missing, `
        + `${identityConflicts.length} identity conflicts.\n`
        + JSON.stringify({ missing, identityConflicts }, null, 2),
    );
  }

  const payloadDigest = digest(items);
  const plannedBatches = batches(items, DEFAULT_BATCH_SIZE);
  const kindCounts = Object.fromEntries(
    [...DATE_KINDS].map((kind) => [kind, items.filter((item) => item.date_info.kind === kind).length]),
  );
  const summary = {
    mode: command.dryRun ? "dry-run" : "write",
    target: command.deploymentFingerprint,
    productionRows: liveRows.length,
    researchRows: items.length,
    matchedByStableId: items.length,
    existingDateSummaries: existingDateSummaries.length,
    sourceUrls: items.reduce((sum, item) => sum + item.source_urls.length, 0),
    evidenceRecords: items.reduce((sum, item) => sum + item.evidence.length, 0),
    rejectedDates: items.reduce((sum, item) => sum + (item.rejected_dates?.length ?? 0), 0),
    alternativeDates: items.reduce((sum, item) => sum + (item.alternative_dates?.length ?? 0), 0),
    defaultBatchSize: DEFAULT_BATCH_SIZE,
    maximumDefaultBatchPayloadBytes: Math.max(
      ...plannedBatches.map((group) => Buffer.byteLength(JSON.stringify(group))),
    ),
    kindCounts,
    sourceArtifactSha256,
    payloadDigest,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (command.dryRun) return;

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-date-backfill")) {
    throw new Error("Write requires --confirm-date-backfill.");
  }
  const requestedDigest = flagValue("--digest");
  if (requestedDigest !== payloadDigest) {
    throw new Error(`Write requires --digest=${payloadDigest}.`);
  }
  const batchSize = Number(flagValue("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  }

  const apiKey = requireProductionWriteCredential("replicationMaintenance").token;
  const ledgerPath = path.resolve(
    flagValue("--ledger") ?? path.join(path.dirname(inputPath), "production-date-backfill-ledger.json"),
  );
  let ledger = fs.existsSync(ledgerPath)
    ? JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
    : {
        schemaVersion: 1,
        operation: OPERATION,
        targetDeployment: command.deploymentFingerprint,
        sourceArtifact: inputPath,
        sourceArtifactSha256,
        payloadDigest,
        startedAt: new Date().toISOString(),
        status: "in_progress",
        completedIds: [],
        batches: [],
      };
  if (ledger.payloadDigest !== payloadDigest || ledger.targetDeployment !== command.deploymentFingerprint) {
    throw new Error("Existing ledger belongs to a different payload or deployment.");
  }

  const completed = new Set(ledger.completedIds);
  const pending = items.filter((item) => !completed.has(item.replication_id));
  for (const [index, group] of batches(pending, batchSize).entries()) {
    const result = await client.mutation(applyResearchBatch, { apiKey, items: group });
    for (const item of group) completed.add(item.replication_id);
    ledger = {
      ...ledger,
      updatedAt: new Date().toISOString(),
      completedIds: [...completed],
      batches: [
        ...ledger.batches,
        {
          index: ledger.batches.length + 1,
          ids: group.map((item) => item.replication_id),
          result,
          completedAt: new Date().toISOString(),
        },
      ],
    };
    writeJsonAtomic(ledgerPath, ledger);
    process.stderr.write(`Applied batch ${index + 1}/${Math.ceil(pending.length / batchSize)}\n`);
  }

  const verification = await verify(client, apiKey, items);
  ledger = {
    ...ledger,
    status: verification.verified === items.length ? "complete" : "verification_failed",
    completedAt: new Date().toISOString(),
    verification,
  };
  writeJsonAtomic(ledgerPath, ledger);
  console.log(JSON.stringify({ ledgerPath, verification }, null, 2));
  if (verification.verified !== items.length) {
    throw new Error("Production verification did not match every research record.");
  }
}

await main();
