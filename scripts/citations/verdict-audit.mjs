#!/usr/bin/env node
// Step 2 of the citation-pi campaign: enumerate every claim–citation pair on
// every public substance article (read-only production audit).
//
// Usage:
//   npm run citations:verdict-audit
//   npm run citations:verdict-audit -- --out=tmp/citation-verdict-audit-2026-08-31.json
//   npm run citations:verdict-audit -- --campaign=<campaign-id>
//
// --campaign scopes existing-verdict lookup to that campaign id
// (provenance.campaign on citationEvidence rows): verdicts recorded under any
// other campaign stay historical records and never deactivate a pair, so a
// fresh campaign re-judges everything. Without the flag, every verdict record
// counts (legacy resume behavior).
//
// Environment:
//   DATA_BACKEND=postgres is required; --source-url / SOURCE_POSTGRES_URL selects
//   the read source, with the canonical Postgres target as fallback.
//   DATA_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW (or legacy DATA_ADMIN_KEY)
//   optionally enables existing-verdict lookup; without it existingVerdict is
//   null and every pair is actionable.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
  resolveAdminIntentToken,
} from "../lib/data-ops-run-context.mjs";
import { publicSlugsFromLayout } from "./subsection-rollout-lib.mjs";
import {
  AUDIT_SCHEMA_VERSION,
  CITABLE_SECTIONS,
  attachExistingVerdicts,
  buildAuditRowsForArticle,
  buildAuditTotals,
} from "./verdict-lib.mjs";

const argv = process.argv.slice(2);
const output = getFlagValue(argv, "--out") ?? "tmp/citation-verdict-audit.json";
const campaign = getFlagValue(argv, "--campaign")?.trim() || null;
const runContext = createDataOpsRunContext({
  operation: "audit citation verdict claim-citation pairs",
  intent: "citation-verdict-audit",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL"],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  localArtifacts: [output],
});

async function fetchEvidenceRows(client, slugs) {
  const resolved = resolveAdminIntentToken("citationEvidenceReview");
  if (!resolved) {
    console.warn(
      "No citationEvidenceReview token (DATA_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW / DATA_ADMIN_KEY); "
        + "existingVerdict will be null for every pair.",
    );
    return [];
  }
  const rows = [];
  for (const slug of slugs) {
    try {
      rows.push(...await client.query(api.citationEvidence.getBySlug, { slug, apiKey: resolved.token }));
    } catch (error) {
      console.warn(
        `Evidence query failed for ${slug} (${error instanceof Error ? error.message : String(error)}); `
          + "continuing with existingVerdict null.",
      );
      return [];
    }
  }
  return rows;
}

async function main() {
  printDataOpsRunContext(runContext);
  const sourceUrl = requireSourceUrl(runContext, "Postgres audit source URL");
  const client = createDataClient({ target: sourceUrl }).client;
  const [articles, layout] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.categoryLayout.get, {}),
  ]);
  if (!articles.length) throw new Error("No articles found in the source Postgres database.");
  if (!layout) throw new Error("No category layout found in the source Postgres database.");

  const articleBySlug = new Map(articles.map((article) => [article.slug, article]));
  const bareRows = [];
  for (const slug of publicSlugsFromLayout(layout)) {
    const article = articleBySlug.get(slug);
    if (!article) continue;
    bareRows.push(...buildAuditRowsForArticle({ slug, article }));
  }

  const markedSlugs = [...new Set(bareRows.map((row) => row.slug))];
  const evidenceRows = await fetchEvidenceRows(client, markedSlugs);
  const rows = attachExistingVerdicts(bareRows, evidenceRows, { campaign });

  const audit = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      postgresIdentity: postgresFingerprintFromUrl(sourceUrl),
      publicScope: "categoryLayout",
      sections: CITABLE_SECTIONS,
      evidenceRowCount: evidenceRows.length,
      campaign,
    },
    rows,
    totals: buildAuditTotals(rows),
  };

  const path = resolve(runContext.repoRoot, output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`Citation verdict audit: ${path}`);
  const { perSlug: _perSlug, ...headline } = audit.totals;
  console.log(JSON.stringify(headline, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
