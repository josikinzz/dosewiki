#!/usr/bin/env node

// One-off migration: legacy prepopulation minted `United States - <State>` keys
// under `legality.countries` (see scripts/prepopulate/prepopulate-legality.mjs
// normalizeCountry). This moves each such row into `legality.usStates.<State>`
// verbatim - or drops it when the state already exists there - and deletes the
// misfiled country key. Guarded exactly like apply-draft.mjs.

import { createHash } from "node:crypto";
import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const STATE_KEY = /^United States\s*[-\u2013\u2014]\s*(\S.*)$/;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function hash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) throw new Error("--slug=<slug> is required.");
  return slug;
}

function parseExpectations(argv) {
  // --expect="United States - Florida=<sha256>" (repeatable); every misfiled
  // key found live must be covered, and every expectation must be found live.
  const expectations = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--expect=")) continue;
    const body = arg.slice("--expect=".length);
    const eq = body.lastIndexOf("=");
    if (eq <= 0) throw new Error(`Malformed --expect: ${arg}`);
    expectations.set(body.slice(0, eq), body.slice(eq + 1));
  }
  if (expectations.size === 0) {
    throw new Error("At least one --expect=<country key>=<content sha256> is required.");
  }
  return expectations;
}

export async function main(argv = process.argv.slice(2)) {
  const slug = requireSlug(argv);
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  const expectations = parseExpectations(argv);

  const runContext = createDataOpsRunContext({
    operation: "migrate misfiled US-state country rows into legality.usStates",
    intent: "legality-usstate-migration",
    argv,
    sourceUrlKeys: [],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-legality-write",
    selectedTables: ["substanceIndex"],
    localArtifacts: [],
    destructive: true,
  });
  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const targetUrl = requireTargetUrl(runContext, "Postgres legality target URL");
  const client = createDataClient({ target: targetUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const legality = structuredClone(article.legality ?? {});
  const countries = { ...(legality.countries ?? {}) };
  const usStates = { ...(legality.usStates ?? {}) };

  const misfiled = Object.keys(countries).filter((key) => STATE_KEY.test(key));
  for (const key of misfiled) {
    if (!expectations.has(key)) {
      throw new Error(`Live misfiled key not covered by --expect: ${key}`);
    }
  }
  const moved = [];
  const dropped = [];
  for (const [key, expected] of expectations) {
    const entry = countries[key];
    if (!entry) throw new Error(`Expected misfiled key not found live: ${key}`);
    if (hash(entry) !== expected) {
      throw new Error(`Stale expectation for ${key}: live content hash differs.`);
    }
    const state = key.match(STATE_KEY)[1].trim();
    if (usStates[state]) {
      dropped.push({ key, state });
    } else {
      usStates[state] = entry;
      moved.push({ key, state });
    }
    delete countries[key];
  }

  for (const { key, state } of moved) console.log(`MOVE  ${key} -> legality.usStates.${state}`);
  for (const { key, state } of dropped) console.log(`DROP  ${key} (legality.usStates.${state} already present)`);
  console.log(`TOTALS: ${moved.length} moved, ${dropped.length} dropped, ${Object.keys(countries).length} countries remain, ${Object.keys(usStates).length} states.`);
  if (!write) {
    console.log("No writes performed. Re-run with --write --confirm-legality-write to update Postgres.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const adminToken = requireAdminIntentToken("editorArticleWrite");
  const { path: auditLogPath } = writeAuditLog({
    operation: "legality-usstate-migration",
    intent: "editorArticleWrite",
    slug,
    mutations: [
      ...moved.map(({ key, state }) => ({ country: key, action: "move", field: `legality.usStates.${state}` })),
      ...dropped.map(({ key }) => ({ country: key, action: "remove", field: "legality.countries" })),
    ],
    repoRoot: runContext.repoRoot,
  });

  const { path: backupPath, documentCount, reused } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getBySlug,
    queryArgs: { slug },
    label: `legality-usstate-migration-${slug}`,
    existingBackupPath: null,
    repoRoot: runContext.repoRoot,
  });

  const { _id, _creationTime, ...clean } = article;
  const writeResult = await client.mutation(api.substanceIndex.saveSubstance, {
    apiKey: adminToken.token,
    article: { ...clean, legality: { ...legality, countries, usStates } },
  });
  if (writeResult?.updated !== true || writeResult?.outcome?.action !== "updated") {
    throw new Error(`Migration write did not update ${slug}: ${JSON.stringify(writeResult)}`);
  }
  updateAuditLog(auditLogPath, { status: "completed", backupPath, result: writeResult });
  console.log(`Applied ${slug}: ${moved.length} moved, ${dropped.length} dropped.`);
  console.log(`Backup: ${backupPath} (${reused ? "reused verified snapshot" : `${documentCount} documents`}); audit: ${auditLogPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
