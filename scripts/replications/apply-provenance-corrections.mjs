#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUDIT_PATH = path.resolve(getFlagValue(process.argv.slice(2), "--audit-path") ?? path.join(homedir(), ".local/state/dosewiki-housecleaning/replication-provenance/audit-latest.json"));
const LEDGER_PATH = path.join(ROOT, "tmp/replication-provenance/application-ledger.json");
const WRITE = process.argv.includes("--write");
const CONFIRMED = process.argv.includes("--confirm-provenance-write");
const requestedDigest = process.argv.find((value) => value.startsWith("--digest="))?.slice("--digest=".length);

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function expected(record) {
  return {
    title: record.current.title,
    artist: record.current.artist,
    artist_url: record.current.artist_url,
    credit_line: record.current.credit_line,
    source_url: record.current.source_url,
    rightsholder: record.current.rightsholder,
  };
}

function updates(record) {
  return {
    title: record.proposal.title,
    artist: record.proposal.artist,
    artist_url: record.proposal.artist_url || undefined,
    credit_line: record.proposal.credit_line,
    source_url: record.proposal.source_url || undefined,
    rightsholder: record.proposal.rightsholder || undefined,
  };
}

async function main() {
  const command = createProductionWriteCommand({
    operation: "apply-replication-provenance-corrections",
    startDir: ROOT,
  });
  printProductionWriteCommand(command);
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  if (!audit.sources?.target_selected || audit.sources.postgres_target !== command.deploymentFingerprint) {
    throw new Error("Audit was not generated against the configured write target. Re-run with --target.");
  }
  const proposals = audit.records.filter((record) => record.action === "correct" && record.proposal);
  const payloadDigest = digest(proposals.map((record) => ({ id: record.live_id, expected: expected(record), updates: updates(record), evidence: record.evidence })));
  console.log(JSON.stringify({ mode: command.dryRun ? "dry-run" : "write", proposals: proposals.length, payload_digest: payloadDigest }, null, 2));
  if (command.dryRun) return;
  assertProductionWriteAllowed(command);
  if (!WRITE || !CONFIRMED || requestedDigest !== payloadDigest) {
    throw new Error(`Write requires --write --confirm-provenance-write --digest=${payloadDigest}`);
  }
  const apiKey = requireProductionWriteCredential("replicationMaintenance").token;
  const client = createDataClient({ target: command.targetUrl }).client;
  const outcomes = [];
  for (const [index, record] of proposals.entries()) {
    process.stderr.write(`\rApplying correction ${index + 1}/${proposals.length}`);
    try {
      const result = await client.mutation(api.replications.applyProvenanceCorrection, {
        apiKey,
        id: record.live_id,
        expected: expected(record),
        updates: updates(record),
      });
      outcomes.push({ audit_id: record.audit_id, live_id: record.live_id, slug: record.slug, status: "applied", result });
    } catch (error) {
      outcomes.push({ audit_id: record.audit_id, live_id: record.live_id, slug: record.slug, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  process.stderr.write("\n");
  const ledger = {
    schema_version: 1,
    applied_at: new Date().toISOString(),
    audit_generated_at: audit.generated_at,
    payload_digest: payloadDigest,
    postgres_target: command.deploymentFingerprint,
    summary: {
      proposed: proposals.length,
      applied: outcomes.filter((outcome) => outcome.status === "applied").length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    },
    outcomes,
  };
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify(ledger.summary, null, 2));
  if (ledger.summary.failed > 0) process.exitCode = 1;
}

await main();
