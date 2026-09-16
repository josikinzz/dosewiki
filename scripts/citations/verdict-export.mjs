#!/usr/bin/env node
// Step 5 of the citation-pi campaign: freeze one slug+section verdict packet
// from the latest audit plus the live article (read-only production read).
//
// Usage:
//   npm run citations:verdict-export -- --slug=fentanyl --section=harm_potential
//   npm run citations:verdict-export -- --slug=fentanyl --section=summary \
//     --audit=tmp/citation-verdict-audit-2026-08-31.json --out-dir=tmp/packets --overwrite
//
// Refuses with ContentHashDriftError when the live section content no longer
// matches the audit row's contentHash — re-run citations:verdict-audit first.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
  resolveAdminIntentToken,
} from "../lib/data-ops-run-context.mjs";
import {
  AUDIT_SCHEMA_VERSION,
  CITABLE_SECTIONS,
  buildVerdictPacket,
} from "./verdict-lib.mjs";

const DEFAULT_AUDIT = "tmp/citation-verdict-audit.json";

function requireFlag(argv, name, hint) {
  const value = getFlagValue(argv, name)?.trim();
  if (!value) throw new Error(`${name}=${hint} is required.`);
  return value;
}

const argv = process.argv.slice(2);
const slug = requireFlag(argv, "--slug", "<slug>");
const section = requireFlag(argv, "--section", `<${CITABLE_SECTIONS.join("|")}>`);
if (!CITABLE_SECTIONS.includes(section)) {
  throw new Error(`--section must be one of: ${CITABLE_SECTIONS.join(", ")} (got ${section}).`);
}
const auditPath = getFlagValue(argv, "--audit") ?? DEFAULT_AUDIT;
const outDir = getFlagValue(argv, "--out-dir") ?? `runs/citation-verdicts/${slug}/packets`;
const overwrite = argv.includes("--overwrite");
const outputPath = join(outDir, `${section}.packet.json`);

const runContext = createDataOpsRunContext({
  operation: "export citation verdict section packet",
  intent: "citation-verdict-export",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL"],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  selectedTables: ["substanceIndex", "citationEvidence"],
  localArtifacts: [outputPath],
});

function loadAudit(path) {
  if (!existsSync(path)) {
    throw new Error(`Audit file not found: ${path}. Run npm run citations:verdict-audit first.`);
  }
  const audit = JSON.parse(readFileSync(path, "utf8"));
  if (audit?.schemaVersion !== AUDIT_SCHEMA_VERSION) {
    throw new Error(
      `Audit file ${path} has schemaVersion ${audit?.schemaVersion ?? "<missing>"}; expected ${AUDIT_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(audit.rows)) {
    throw new Error(`Audit file ${path} has no rows[].`);
  }
  return audit;
}

async function fetchEvidenceRows(client) {
  const resolved = resolveAdminIntentToken("citationEvidenceReview");
  if (!resolved) {
    console.warn(
      "No citationEvidenceReview token; packet evidenceRows will be empty.",
    );
    return [];
  }
  try {
    return await client.query(api.citationEvidence.getBySlug, { slug, apiKey: resolved.token });
  } catch (error) {
    console.warn(
      `Evidence query failed for ${slug} (${error instanceof Error ? error.message : String(error)}); `
        + "packet evidenceRows will be empty.",
    );
    return [];
  }
}

async function main() {
  printDataOpsRunContext(runContext);
  const sourceUrl = requireSourceUrl(runContext, "Postgres packet source URL");
  const audit = loadAudit(resolve(runContext.repoRoot, auditPath));

  const client = createDataClient({ target: sourceUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);
  const evidenceRows = await fetchEvidenceRows(client);

  const packet = buildVerdictPacket({
    slug,
    section,
    article,
    auditRows: audit.rows,
    evidenceRows,
  });

  const resolvedOutput = resolve(runContext.repoRoot, outputPath);
  if (existsSync(resolvedOutput) && !overwrite) {
    throw new Error(`${resolvedOutput} already exists. Pass --overwrite to replace it.`);
  }
  mkdirSync(resolve(runContext.repoRoot, outDir), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`Exported ${slug} ${section}: ${packet.pairs.length} pairs, `
    + `${packet.references.length} references, ${packet.evidenceRows.length} evidence rows.`);
  console.log(`Packet: ${resolvedOutput} (contentHash ${packet.contentHash.slice(0, 12)}…)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
