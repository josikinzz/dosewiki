#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import { createProductionWriteCommand, requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { buildExecutionPlan, indexProfiles, loadLedger, validatePinnedProfileSnapshot, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";
import { activeLedgerOperations, sealReport, validateCompletionEvidence } from "./completion-validator-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
const flag = (argv, name) => { const item = argv.find((value) => value.startsWith(`${name}=`)); return item ? item.slice(name.length + 1) : null; };
const flags = (argv, name) => argv.filter((value) => value.startsWith(`${name}=`)).map((value) => value.slice(name.length + 1));
const json = (filename) => JSON.parse(readFileSync(filename, "utf8"));
const sha256File = (filename) => createHash("sha256").update(readFileSync(filename)).digest("hex");

export function parseArgs(argv) {
  return {
    projection: flag(argv, "--projection") ?? `${CAMPAIGN}/identity-social-production-projection.json`,
    profiles: flag(argv, "--profiles") ?? `${CAMPAIGN}/full-production-contributor-profiles-snapshot.json`,
    receipts: flag(argv, "--delivery-receipts") ?? `${CAMPAIGN}/identity-social-delivery-receipts.json`,
    replicationIds: flag(argv, "--replication-ids") ?? `${CAMPAIGN}/full-production-replication-id-map.json`,
    ledger: flag(argv, "--ledger") ?? `${CAMPAIGN}/identity-social-production-ledger.jsonl`,
    output: flag(argv, "--output") ?? `${CAMPAIGN}/identity-social-production-completion-report.json`,
    actor: flag(argv, "--actor-email"),
    allowedLegacyItemIds: flags(argv, "--allow-legacy-profile-item"),
    maxAttempts: Number(flag(argv, "--max-attempts") ?? 4),
    argv,
  };
}

function transient(error) {
  const code = String(error?.code ?? error?.cause?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
    || /http\/2|goaway|connection (?:closed|reset)|fetch failed|network error|socket hang up|terminated/.test(message);
}

async function withRetry(action, recreate, attempts, label) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await action(); } catch (error) {
      if (!transient(error)) throw error;
      last = error; recreate();
    }
  }
  throw new Error(`${label} unavailable after ${attempts} attempts: ${last?.message ?? last}`);
}

export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv);
  if (!options.actor) throw new Error("--actor-email is required for authenticated read-only validation.");
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 10) throw new Error("--max-attempts must be 1 through 10.");
  const command = createProductionWriteCommand({ operation: "validate-identity-social-production", argv: options.argv });
  if (!command.targetUrl || command.deploymentFingerprint !== "glad-minnow-656") throw new Error("Read-only validation requires TARGET_CONVEX_URL (or --target-url) for glad-minnow-656.");
  const projection = json(options.projection);
  const profileRows = validatePinnedProfileSnapshot(json(options.profiles));
  const sidecarDocument = json(options.receipts);
  const verifiedSidecar = verifyDeliveryReceiptSidecar(projection, sidecarDocument, sidecarDocument.receiptSidecarSha256);
  const plan = buildExecutionPlan(projection, {
    profiles: indexProfiles(profileRows), receipts: verifiedSidecar.receipts,
    receiptSidecarDigest: verifiedSidecar.receiptSidecarSha256,
    replicationIds: json(options.replicationIds), expectedProjectionDigest: projection.projectionSha256,
  });
  const ledger = loadLedger(options.ledger);
  const { active } = activeLedgerOperations(ledger);
  const apiKey = adapters.apiKey ?? requireProductionWriteCredential("replicationMaintenance").token;
  let client = adapters.client ?? new ConvexHttpClient(command.targetUrl);
  const recreate = () => { client = adapters.createClient ? adapters.createClient(command.targetUrl) : new ConvexHttpClient(command.targetUrl); };
  const query = (args) => adapters.query
    ? adapters.query(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, args)
    : client.query(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, args);
  const completionReceipts = [];
  for (const [index, operation] of active.entries()) {
    const receipt = await withRetry(
      () => query({ apiKey, actor_email: options.actor, operation_id: operation.operation_id }),
      recreate, options.maxAttempts, `Completion receipt ${operation.operation_id}`,
    );
    if (!receipt) throw new Error(`Production operation ${operation.operation_id} is absent.`);
    completionReceipts.push(receipt);
    if (!adapters.quiet && (index + 1) % 25 === 0) console.error(`Validated ${index + 1}/${active.length} operation receipts.`);
  }
  const report = sealReport(validateCompletionEvidence({
    projection, plan, ledger, receipts: completionReceipts, ledgerSha256: sha256File(options.ledger),
    allowedLegacyItemIds: options.allowedLegacyItemIds,
  }));
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) throw new Error(`Completion validation failed; inspect ${options.output}.`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run()
  .then((report) => console.log(JSON.stringify({ complete: report.complete, reportSha256: report.reportSha256, output: parseArgs(process.argv.slice(2)).output }, null, 2)))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });

