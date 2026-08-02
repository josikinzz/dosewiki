#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUDIT_PATH = path.join(ROOT, "notes-and-plans/reports/replication-provenance/audit-latest.json");
const LEDGER_PATH = path.join(ROOT, "notes-and-plans/reports/replication-provenance/application-ledger.json");
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
  loadEnvFiles({ rootDir: ROOT });
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  if (audit.sources?.convex_url_variable !== "VITE_CONVEX_URL") {
    throw new Error("Audit was not generated against the configured write target. Re-run with --target.");
  }
  const proposals = audit.records.filter((record) => record.action === "correct" && record.proposal);
  const payloadDigest = digest(proposals.map((record) => ({ id: record.live_id, expected: expected(record), updates: updates(record), evidence: record.evidence })));
  console.log(JSON.stringify({ mode: WRITE ? "write" : "dry-run", proposals: proposals.length, payload_digest: payloadDigest }, null, 2));
  if (!WRITE) return;
  if (!CONFIRMED || requestedDigest !== payloadDigest) {
    throw new Error(`Write requires --confirm-provenance-write --digest=${payloadDigest}`);
  }
  const convexUrl = process.env.VITE_CONVEX_URL;
  const apiKey = process.env.CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE || process.env.CONVEX_ADMIN_KEY;
  if (!convexUrl || !apiKey) throw new Error("VITE_CONVEX_URL and replication maintenance credentials are required.");
  const client = new ConvexHttpClient(convexUrl);
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
    target_variable: "VITE_CONVEX_URL",
    summary: {
      proposed: proposals.length,
      applied: outcomes.filter((outcome) => outcome.status === "applied").length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    },
    outcomes,
  };
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify(ledger.summary, null, 2));
  if (ledger.summary.failed > 0) process.exitCode = 1;
}

await main();
