#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "remove-silent-auditory-tags";
const DEFAULT_WORK_DIR =
  "/Users/josie/Documents/Codex/2026-08-17/continue-this-and-it-seems-it/replication-review-app/work/audio-analysis";
const DEFAULT_AUDIT = path.join(DEFAULT_WORK_DIR, "current-convex-auditory-tag-audit.json");
const DEFAULT_PLAN = path.join(DEFAULT_WORK_DIR, "silent-auditory-removal-plan.json");
const DEFAULT_LEDGER = path.join(DEFAULT_WORK_DIR, "silent-auditory-removal-ledger.json");
const AUDITORY_EFFECTS = new Set(["auditory-distortion", "auditory-hallucination"]);

function flagValue(name, fallback = null) {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function editorialSnapshot(row) {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role ?? "replication",
    effect_slug: row.effect_slug ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: [...(row.effect_tags ?? [])].sort(),
  };
}

function withoutAuditoryEffects(row) {
  const current = editorialSnapshot(row);
  const retainedSecondary = current.effect_tags.filter((effect) => !AUDITORY_EFFECTS.has(effect));
  if (!AUDITORY_EFFECTS.has(current.effect_slug)) {
    return { ...current, effect_tags: retainedSecondary.sort() };
  }
  const nextPrimary = retainedSecondary.shift() ?? null;
  if (!nextPrimary) {
    throw new Error(`${row.slug}: removing the auditory primary would leave no primary effect.`);
  }
  return { ...current, effect_slug: nextPrimary, effect_tags: retainedSecondary.sort() };
}

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function buildPlan(audit, rows, target) {
  const candidates = audit.definitiveRemovalCandidates ?? [];
  const rowsById = new Map(rows.map((row) => [row._id, row]));
  const operations = candidates.map((candidate) => {
    const row = rowsById.get(candidate.replicationId);
    if (!row) throw new Error(`${candidate.replicationId}: production row is missing.`);
    if (row.slug !== candidate.slug) {
      throw new Error(`${candidate.replicationId}: slug changed from ${candidate.slug} to ${row.slug}.`);
    }
    if (candidate.audioStatus !== "silent") {
      throw new Error(`${candidate.slug}: audit status is ${candidate.audioStatus}, not silent.`);
    }
    const expected = editorialSnapshot(row);
    const assigned = [expected.effect_slug, ...expected.effect_tags].filter((effect) => AUDITORY_EFFECTS.has(effect));
    if (assigned.length === 0) {
      throw new Error(`${candidate.slug}: production no longer has an auditory effect to remove.`);
    }
    if (!sameJson(assigned.sort(), [...candidate.assignedAuditoryEffects].sort())) {
      throw new Error(`${candidate.slug}: production auditory tags differ from the frozen audit.`);
    }
    return {
      id: row._id,
      slug: row.slug,
      audioEvidence: { status: "silent", meanDb: candidate.meanDb, maxDb: candidate.maxDb },
      removedEffects: assigned.sort(),
      expected,
      updates: withoutAuditoryEffects(row),
    };
  });
  const payload = {
    schemaVersion: 1,
    target,
    auditGeneratedAt: audit.summary?.generatedAt ?? null,
    auditSha256: sha256(fs.readFileSync(audit.path, "utf8")),
    operations,
  };
  return { ...payload, payloadDigest: sha256(stableJson(payload)) };
}

async function verify(client, operations) {
  const rows = await client.query(api.replications.getAll, {});
  const rowsById = new Map(rows.map((row) => [row._id, row]));
  const mismatches = [];
  for (const operation of operations) {
    const row = rowsById.get(operation.id);
    if (!row || !sameJson(editorialSnapshot(row), operation.updates)) {
      mismatches.push({ id: operation.id, slug: operation.slug, live: row ? editorialSnapshot(row) : null });
    }
  }
  return { rows: rows.length, checked: operations.length, mismatches };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  const auditPath = path.resolve(flagValue("--audit", DEFAULT_AUDIT));
  const planPath = path.resolve(flagValue("--plan", DEFAULT_PLAN));
  const ledgerPath = path.resolve(flagValue("--ledger", DEFAULT_LEDGER));
  const maxWritesValue = flagValue("--max-writes");
  const maxWrites = maxWritesValue === null ? Infinity : Number(maxWritesValue);
  if (!(maxWrites === Infinity || (Number.isInteger(maxWrites) && maxWrites >= 1))) {
    throw new Error("--max-writes must be a positive integer.");
  }
  if (!command.targetUrl) throw new Error("Set TARGET_CONVEX_URL or --target-url.");
  const client = new ConvexHttpClient(command.targetUrl);

  if (command.dryRun) {
    const audit = loadJson(auditPath);
    audit.path = auditPath;
    const rows = await client.query(api.replications.getAll, {});
    const plan = buildPlan(audit, rows, command.targetUrl);
    writeJsonAtomic(planPath, { ...plan, createdAt: new Date().toISOString() });
    console.log(JSON.stringify({
      mode: "dry-run",
      productionRows: rows.length,
      operations: plan.operations.length,
      auditoryTagOccurrencesRemoved: plan.operations.reduce((sum, entry) => sum + entry.removedEffects.length, 0),
      primaryPromotions: plan.operations.filter((entry) => entry.expected.effect_slug !== entry.updates.effect_slug).map((entry) => ({ slug: entry.slug, from: entry.expected.effect_slug, to: entry.updates.effect_slug })),
      payloadDigest: plan.payloadDigest,
      planPath,
    }, null, 2));
    return;
  }

  assertProductionWriteAllowed(command);
  if (!process.argv.includes("--confirm-silent-auditory-removal")) {
    throw new Error("Write requires --confirm-silent-auditory-removal.");
  }
  const plan = loadJson(planPath);
  if (plan.target !== command.targetUrl) throw new Error("Plan target does not match the write target.");
  if (flagValue("--digest") !== plan.payloadDigest) {
    throw new Error(`Write requires --digest=${plan.payloadDigest}.`);
  }
  const payload = { ...plan };
  delete payload.createdAt;
  delete payload.payloadDigest;
  if (sha256(stableJson(payload)) !== plan.payloadDigest) throw new Error("Plan digest validation failed.");

  const liveRows = await client.query(api.replications.getAll, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  for (const operation of plan.operations) {
    const live = liveById.get(operation.id);
    if (!live) throw new Error(`${operation.slug}: production row is missing.`);
    const snapshot = editorialSnapshot(live);
    if (!sameJson(snapshot, operation.expected) && !sameJson(snapshot, operation.updates)) {
      throw new Error(`${operation.slug}: live editorial fields drifted from the frozen plan.`);
    }
  }

  const existingLedger = fs.existsSync(ledgerPath) ? loadJson(ledgerPath) : null;
  if (existingLedger && existingLedger.payloadDigest !== plan.payloadDigest) {
    throw new Error("Existing ledger belongs to a different plan.");
  }
  const ledger = existingLedger ?? {
    schemaVersion: 1,
    target: command.targetUrl,
    payloadDigest: plan.payloadDigest,
    startedAt: new Date().toISOString(),
    completed: {},
  };
  const maintenanceKey = requireProductionWriteCredential("replicationMaintenance").token;
  let writes = 0;
  for (const operation of plan.operations) {
    if (ledger.completed[operation.id]) continue;
    const live = liveById.get(operation.id);
    if (sameJson(editorialSnapshot(live), operation.updates)) {
      ledger.completed[operation.id] = { completedAt: new Date().toISOString(), status: "already-applied" };
      writeJsonAtomic(ledgerPath, ledger);
      continue;
    }
    if (writes >= maxWrites) break;
    const result = await client.mutation(api.replications.updateEditorialFields, {
      apiKey: maintenanceKey,
      id: operation.id,
      expected: operation.expected,
      updates: operation.updates,
    });
    ledger.completed[operation.id] = { completedAt: new Date().toISOString(), status: "written", result };
    writeJsonAtomic(ledgerPath, ledger);
    writes += 1;
  }

  const completed = Object.keys(ledger.completed).length;
  if (completed === plan.operations.length) {
    const verification = await verify(client, plan.operations);
    if (verification.mismatches.length > 0) {
      throw new Error(`Post-write verification failed: ${JSON.stringify(verification.mismatches, null, 2)}`);
    }
    ledger.completedAt = new Date().toISOString();
    ledger.verification = verification;
    writeJsonAtomic(ledgerPath, ledger);
  }
  console.log(JSON.stringify({ complete: completed === plan.operations.length, completed, total: plan.operations.length, writes, ledgerPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
