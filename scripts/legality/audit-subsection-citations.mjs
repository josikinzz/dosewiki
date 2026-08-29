#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { getAllSubstanceDocuments } from "../lib/convex-pagination.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

const argv = process.argv.slice(2);
const output = getFlagValue(argv, "--out") ?? "tmp/legality-subsection-citation-audit.json";
const runContext = createDataOpsRunContext({
  operation: "audit legality subsection citation coverage",
  intent: "legality-subsection-audit",
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

function subsection({ slug, title, kind, jurisdiction, value }) {
  const chars = textLength(value);
  const markers = markerCount(value);
  return {
    slug,
    title,
    kind,
    jurisdiction,
    path: kind === "country" ? `legality.countries.${jurisdiction}` : `legality.${kind}`,
    chars,
    markerCount: markers,
    contentHash: hash(value),
    actionable: chars >= 40 && markers === 0,
    value,
  };
}

async function main() {
  printDataOpsRunContext(runContext);
  const sourceUrl = requireSourceUrl(runContext, "Convex audit source URL");
  const client = new ConvexHttpClient(sourceUrl);
  const [articles, layout] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.categoryLayout.get, {}),
  ]);
  const articleBySlug = new Map(articles.map((article) => [article.slug, article]));
  const rows = [];
  for (const slug of publicSlugs(layout)) {
    const article = articleBySlug.get(slug);
    if (!article) continue;
    for (const [jurisdiction, value] of Object.entries(article.legality?.countries ?? {})) {
      rows.push(subsection({ slug, title: article.title ?? slug, kind: "country", jurisdiction, value }));
    }
    // International, U.S. state, territory, and city entries are intentionally out of scope.
  }
  const audit = {
    schemaVersion: "dosewiki_legality_country_subsection_citation_audit_v1",
    generatedAt: new Date().toISOString(),
    source: { convexUrl: sourceUrl, publicScope: "categoryLayout", subsectionKind: "country" },
    viabilityFloorChars: 40,
    rows,
    totals: {
      publicArticles: new Set(rows.map((row) => row.slug)).size,
      totalSubsections: rows.length,
      actionable: rows.filter((row) => row.actionable).length,
      cited: rows.filter((row) => !row.actionable && row.markerCount > 0).length,
      emptyOrShort: rows.filter((row) => !row.actionable && row.markerCount === 0).length,
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
