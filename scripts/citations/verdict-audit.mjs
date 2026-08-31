#!/usr/bin/env node
// Step 2 of the citation-pi campaign: enumerate every claim–citation pair on
// every public substance article (read-only production audit).
//
// Usage:
//   npm run citations:verdict-audit
//   npm run citations:verdict-audit -- --out=tmp/citation-verdict-audit-2026-08-31.json
//
// Environment:
//   SOURCE_CONVEX_URL / CONVEX_PUBLIC_READ_URL / VITE_CONVEX_URL ... selects the
//   deployment to read (see scripts/lib/data-ops-run-context.mjs).
//   CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW (or legacy CONVEX_ADMIN_KEY)
//   optionally enables existing-verdict lookup; without it existingVerdict is
//   null and every pair is actionable.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../lib/convex-pagination.mjs";
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
const runContext = createDataOpsRunContext({
  operation: "audit citation verdict claim-citation pairs",
  intent: "citation-verdict-audit",
  argv,
  sourceUrlKeys: [
    "SOURCE_CONVEX_URL",
    "CONVEX_PUBLIC_READ_URL",
    "VITE_CONVEX_URL",
    "CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_URL",
  ],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  localArtifacts: [output],
});

async function fetchEvidenceRows(client, slugs) {
  const resolved = resolveAdminIntentToken("citationEvidenceReview");
  if (!resolved) {
    console.warn(
      "No citationEvidenceReview token (CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW / CONVEX_ADMIN_KEY); "
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
  const sourceUrl = requireSourceUrl(runContext, "Convex audit source URL");
  const client = new ConvexHttpClient(sourceUrl);
  const [articles, layout] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.categoryLayout.get, {}),
  ]);
  if (!articles.length) throw new Error("No articles found in the source Convex deployment.");
  if (!layout) throw new Error("No category layout found in the source Convex deployment.");

  const articleBySlug = new Map(articles.map((article) => [article.slug, article]));
  const bareRows = [];
  for (const slug of publicSlugsFromLayout(layout)) {
    const article = articleBySlug.get(slug);
    if (!article) continue;
    bareRows.push(...buildAuditRowsForArticle({ slug, article }));
  }

  const markedSlugs = [...new Set(bareRows.map((row) => row.slug))];
  const evidenceRows = await fetchEvidenceRows(client, markedSlugs);
  const rows = attachExistingVerdicts(bareRows, evidenceRows);

  const audit = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      convexUrl: sourceUrl,
      publicScope: "categoryLayout",
      sections: CITABLE_SECTIONS,
      evidenceRowCount: evidenceRows.length,
    },
    rows,
    totals: buildAuditTotals(rows),
  };

  const path = resolve(runContext.repoRoot, output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`Citation verdict audit: ${path}`);
  const { perSlug, ...headline } = audit.totals;
  console.log(JSON.stringify(headline, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
