#!/usr/bin/env node
/**
 * Compare-and-swap four independently corroborated replication corrections.
 *
 * Dry run is the default. This script never renames public slugs and never
 * writes replications.created_at: that column is an import timestamp, not an
 * artwork/publication date. Date findings remain in the reviewed plan.
 *
 * Dry run:
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *     node scripts/replications/apply-psychonautwiki-metadata-corrections.mjs
 *
 * Apply:
 *   TARGET_POSTGRES_URL=postgresql://<host>/<database> \
 *     node scripts/replications/apply-psychonautwiki-metadata-corrections.mjs \
 *       --write \
 *       --confirm-write=apply-psychonautwiki-metadata-corrections \
 *       --expected-deployment=<host>/<database>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireCampaignTarget } from "./lib/postgres-target.mjs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-psychonautwiki-metadata-corrections";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAN_PATH = path.join(HERE, "data/psychonautwiki-existing-metadata-corrections.json");
const CREDIT_FIELDS = [
  "title",
  "artist",
  "artist_url",
  "credit_line",
  "source_url",
  "rightsholder",
];

function snapshot(row) {
  return {
    title: row.title,
    artist: row.artist,
    artist_url: row.artist_url ?? null,
    credit_line: row.credit_line ?? null,
    source_url: row.source_url ?? null,
    rightsholder: row.rightsholder ?? null,
  };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appliedSnapshot(expected, updates) {
  const result = { ...expected };
  for (const [key, value] of Object.entries(updates)) result[key] = value;
  return result;
}

function diffSnapshot(current, expected) {
  return CREDIT_FIELDS.filter((field) => current[field] !== expected[field]).map((field) => ({
    field,
    expected: expected[field],
    current: current[field],
  }));
}

function validatePlan(plan, command) {
  if (plan.schemaVersion !== 1) throw new Error(`Unsupported plan schema ${plan.schemaVersion}.`);
  if (plan.targetDeployment !== "glad-minnow-656") {
    throw new Error(
      `Plan targets ${plan.targetDeployment}; command targets ${command.deploymentFingerprint ?? "no deployment"}.`,
    );
  }
  if (plan.corrections.length !== 4) {
    throw new Error(`Reviewed plan must contain exactly four corrections, got ${plan.corrections.length}.`);
  }
  const ids = new Set();
  const slugs = new Set();
  for (const correction of plan.corrections) {
    if (ids.has(correction.id) || slugs.has(correction.slug)) {
      throw new Error(`Duplicate target in plan: ${correction.slug}.`);
    }
    ids.add(correction.id);
    slugs.add(correction.slug);
    if (!(correction.changedFields?.length > 0)) {
      throw new Error(`Correction ${correction.key} has no reviewed changes.`);
    }
    if (correction.updates.created_at !== undefined || correction.updates.slug !== undefined) {
      throw new Error(`Correction ${correction.key} attempts a forbidden date or slug write.`);
    }
  }
}

function classify(correction, row) {
  if (!row) return { status: "missing", current: null, drift: [] };
  if (row.slug !== correction.slug) {
    return {
      status: "drifted",
      current: snapshot(row),
      drift: [{ field: "slug", expected: correction.slug, current: row.slug }],
    };
  }
  const current = snapshot(row);
  if (equal(current, correction.expected)) return { status: "pending", current, drift: [] };
  const after = appliedSnapshot(correction.expected, correction.updates);
  if (equal(current, after)) return { status: "already-applied", current, drift: [] };
  return { status: "drifted", current, drift: diffSnapshot(current, correction.expected) };
}

function printRow(correction, state) {
  console.log(`\n${correction.key} (${correction.id}, ${correction.slug})`);
  console.log(`  status: ${state.status}`);
  for (const field of correction.changedFields) {
    console.log(
      `  ${field}: ${JSON.stringify(correction.expected[field])} -> ${JSON.stringify(correction.updates[field])}`,
    );
  }
  console.log(
    `  date evidence only: ${correction.dateEvidence.value} (${correction.dateEvidence.eventType}; not stored)`,
  );
  for (const item of state.drift) {
    console.log(`  DRIFT ${item.field}: expected ${JSON.stringify(item.expected)}, current ${JSON.stringify(item.current)}`);
  }
}

async function readStates(client, plan) {
  const rows = await client.query(api.replications.getAll, {});
  const byId = new Map(rows.map((row) => [row._id, row]));
  return {
    count: rows.length,
    states: plan.corrections.map((correction) => ({
      correction,
      ...classify(correction, byId.get(correction.id)),
    })),
  };
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (!command.targetUrl) {
    throw new Error("Set TARGET_POSTGRES_URL or pass --target for the live read.");
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
  requireCampaignTarget(command);
  validatePlan(plan, command);
  const readClient = createDataClient({ target: command.targetUrl }).client;
  const before = await readStates(readClient, plan);
  console.log(`Read ${before.count} replication rows.`);
  for (const state of before.states) printRow(state.correction, state);

  const drifted = before.states.filter((state) => state.status === "drifted" || state.status === "missing");
  if (drifted.length > 0) {
    throw new Error(`${drifted.length} target row(s) are missing or drifted; no writes are safe.`);
  }

  const pending = before.states.filter((state) => state.status === "pending");
  if (command.dryRun) {
    console.log(`\nDry run complete: ${pending.length} pending, ${before.states.length - pending.length} already applied, 0 writes.`);
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;
  for (const state of pending) {
    const { correction } = state;
    await writeClient.mutation(api.replications.applyProvenanceCorrection, {
      apiKey,
      id: correction.id,
      expected: correction.expected,
      updates: correction.updates,
    });
    console.log(`Applied ${correction.key}.`);
  }

  const after = await readStates(readClient, plan);
  const failures = after.states.filter((state) => state.status !== "already-applied");
  for (const state of after.states) printRow(state.correction, state);
  if (failures.length > 0) {
    throw new Error(`Read-back verification failed for ${failures.length} row(s).`);
  }
  console.log(`\nVerified ${after.states.length} corrected rows; slugs and created_at were untouched.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
