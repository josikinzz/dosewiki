#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { substanceVisibility } from "../../src/schema/substance/substanceVisibilityPolicy.ts";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

const SCOPES = ["all", "layout"];
const argv = process.argv.slice(2);
const output = getFlagValue(argv, "--out") ?? "tmp/legality-subsection-citation-audit.json";
const scope = getFlagValue(argv, "--scope") ?? "all";
if (!SCOPES.includes(scope)) {
  throw new Error(`--scope must be one of ${SCOPES.join(", ")} (got ${scope}).`);
}
// Keys under legality.countries shaped like "United States - Oregon" are US-state
// rows misfiled as countries; `migrate-usstate-country-rows.mjs` owns them.
const MISFILED_STATE_KEY = /^United States - /;
const runContext = createDataOpsRunContext({
  operation: "audit legality subsection citation coverage",
  intent: "legality-subsection-audit",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL"],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  localArtifacts: [output],
});

function markerCount(value) {
  return (JSON.stringify(value ?? null).match(/\[cite:[^\]]+\]/g) ?? []).length;
}

function textLength(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + textLength(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + textLength(item), 0);
  return 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function publicSlugs(layout) {
  const result = [];
  const seen = new Set();
  const add = (slug) => {
    if (typeof slug !== "string" || seen.has(slug)) return;
    seen.add(slug);
    result.push(slug);
  };
  for (const category of layout?.categories ?? []) {
    for (const section of category?.sections ?? []) for (const slug of section?.drugs ?? []) add(slug);
    for (const slug of category?.drugs ?? []) add(slug);
  }
  return result;
}

function subsection({ slug, title, visibility, kind, jurisdiction, value }) {
  const chars = textLength(value);
  const markers = markerCount(value);
  const misfiledStateRow = MISFILED_STATE_KEY.test(jurisdiction);
  return {
    slug,
    title,
    visibility,
    kind,
    jurisdiction,
    path: kind === "country" ? `legality.countries.${jurisdiction}` : `legality.${kind}`,
    chars,
    markerCount: markers,
    contentHash: hash(value),
    actionable: !misfiledStateRow && chars >= 40 && markers === 0,
    ...(misfiledStateRow ? { excludedReason: "misfiled_state_row" } : {}),
    value,
  };
}

async function main() {
  printDataOpsRunContext(runContext);
  const sourceUrl = requireSourceUrl(runContext, "Postgres audit source URL");
  const client = createDataClient({ target: sourceUrl }).client;
  const [articles, layout] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.categoryLayout.get, {}),
  ]);
  const layoutSlugs = new Set(publicSlugs(layout));
  const inScope = scope === "layout"
    ? articles.filter((article) => layoutSlugs.has(article.slug))
    : articles;
  const rows = [];
  for (const article of inScope) {
    const { slug } = article;
    const visibility = substanceVisibility({
      indexCategories: article.index_categories,
      priority: article.priority,
    });
    for (const [jurisdiction, value] of Object.entries(article.legality?.countries ?? {})) {
      rows.push(subsection({
        slug,
        title: article.title ?? slug,
        visibility,
        kind: "country",
        jurisdiction,
        value,
      }));
    }
    // International, U.S. state, territory, and city entries are intentionally out of scope.
  }
  const byVisibility = {};
  for (const row of rows) byVisibility[row.visibility] = (byVisibility[row.visibility] ?? 0) + 1;
  const audit = {
    schemaVersion: "dosewiki_legality_country_subsection_citation_audit_v2",
    generatedAt: new Date().toISOString(),
    source: { postgresIdentity: postgresFingerprintFromUrl(sourceUrl), scope, subsectionKind: "country" },
    viabilityFloorChars: 40,
    rows,
    totals: {
      articles: new Set(rows.map((row) => row.slug)).size,
      totalSubsections: rows.length,
      actionable: rows.filter((row) => row.actionable).length,
      cited: rows.filter((row) => !row.actionable && row.markerCount > 0).length,
      emptyOrShort: rows.filter((row) => !row.actionable && row.markerCount === 0 && !row.excludedReason).length,
      misfiledStateRows: rows.filter((row) => row.excludedReason === "misfiled_state_row").length,
      subsectionsByVisibility: byVisibility,
    },
  };
  const path = resolve(runContext.repoRoot, output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`Legality subsection audit: ${path}`);
  console.log(JSON.stringify(audit.totals, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
