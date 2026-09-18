#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  DEFAULT_AUDIT_THRESHOLDS,
  DOSE_TABLE_TOLERANCE_SCOPE_FIELDS,
  OTHER_ALLOWED_SCOPE_FIELDS,
  auditArticle,
  getStatusLabel,
  slugify,
  sortAuditResults,
  summarizeAuditResults,
} from "./plagiarism-audit-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDoseMarkdownPath = path.join(repoRoot, "docs/audits/dose-table-tolerance-plagiarism-audit.md");
const defaultDoseJsonPath = path.join(repoRoot, "docs/audits/dose-table-tolerance-plagiarism-audit.json");
const defaultOtherMarkdownPath = path.join(repoRoot, "docs/audits/other-sections-plagiarism-audit.md");
const defaultOtherJsonPath = path.join(repoRoot, "docs/audits/other-sections-plagiarism-audit.json");
const sourceUrlKeys = ["SOURCE_POSTGRES_URL", "TARGET_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL"];

const scopeConfigs = {
  "dose-table-tolerance": {
    key: "dose-table-tolerance",
    coreScope: "dose_table_tolerance",
    title: "Dose Table Notes and Tolerance Plagiarism Audit",
    defaultMarkdownPath: defaultDoseMarkdownPath,
    defaultJsonPath: defaultDoseJsonPath,
    scope: DOSE_TABLE_TOLERANCE_SCOPE_FIELDS,
    excludedSections: "summary, pharmacology, harm_potential, history_culture, legality, subjective effects, interactions, identification, duration, and numeric dose ranges",
    noScopedContentNote: "Articles marked `No scoped content` had no populated dose table note or tolerance field to audit.",
  },
  "other-sections": {
    key: "other-sections",
    coreScope: "other_sections",
    title: "Other Article Sections Plagiarism Audit",
    defaultMarkdownPath: defaultOtherMarkdownPath,
    defaultJsonPath: defaultOtherJsonPath,
    scope: OTHER_ALLOWED_SCOPE_FIELDS,
    excludedSections: "dose table note fields, tolerance fields, subjective effects, identification/name/chemical-name fields, classification name fields, interactions, reagent testing, references/citation metadata, editor-only metadata, route labels, headings, status labels, and short numeric/unit-only fields",
    noScopedContentNote: "Articles marked `No scoped content` had no populated prose field in the configured other-sections audit scope.",
  },
};

const sourceDisplayNames = {
  erowid: "Erowid",
  psychonautwiki: "PsychonautWiki",
  wikipedia: "Wikipedia",
  "tripsit-factsheets": "TripSit Factsheets",
  "tripsit-wiki": "TripSit Wiki",
  drugbank: "DrugBank",
  isomerdesign: "IsomerDesign",
  saferparty: "SaferParty",
  disregardeverythingisay: "Disregard Everything I Say",
  drugusersbible: "Drug Users Bible",
  thedrugclassroom: "The Drug Classroom",
  bluelight: "Bluelight",
  protestkit: "ProtestKit",
};

const localSourcePrefixes = {
  EROWID: "erowid",
  PSYCHONAUTWIKI: "psychonautwiki",
  WIKIPEDIA: "wikipedia",
  TRIPSIT_FACTSHEETS: "tripsit-factsheets",
  TRIPSIT_WIKI: "tripsit-wiki",
  DRUGBANK: "drugbank",
  ISOMERDESIGN: "isomerdesign",
  SAFERPARTY: "saferparty",
  DISREGARDEVERYTHINGISAY: "disregardeverythingisay",
  DRUGUSERSBIBLE: "drugusersbible",
  THEDRUGCLASSROOM: "thedrugclassroom",
  BLUELIGHT: "bluelight",
  PROTESTKIT: "protestkit",
};

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const scopeConfig = resolveScopeConfig(args);
  const dataSource = args.source ?? "postgres";
  const sourceUrl = resolvePostgresUrl(args);
  const client = dataSource === "postgres" ? createPostgresClient(sourceUrl) : null;
  const articles = await loadArticles({ dataSource, client, args });
  const selectedArticles = filterArticles(articles, args);
  const localArchiveIndex = buildLocalArchiveIndex(path.join(repoRoot, "archive/drug-info-articles"));

  console.log(`Auditing ${selectedArticles.length} articles from ${dataSource}.`);
  const startedAt = Date.now();
  const results = await mapLimit(selectedArticles, Number(args.concurrency ?? 6), async (article) => {
    const sources = await loadSourcesForArticle({ article, client, dataSource, localArchiveIndex });
    return auditArticle(article, sources, DEFAULT_AUDIT_THRESHOLDS, { scope: scopeConfig.coreScope });
  });

  const sortedResults = sortAuditResults(results);
  const report = {
    generatedAt: new Date().toISOString(),
    dataSource,
    dataUrlKey: client ? sourceUrl.key : null,
    scopeKey: scopeConfig.key,
    reportTitle: scopeConfig.title,
    scope: scopeConfig.scope,
    excludedSections: scopeConfig.excludedSections,
    noScopedContentNote: scopeConfig.noScopedContentNote,
    thresholds: DEFAULT_AUDIT_THRESHOLDS,
    summary: summarizeAuditResults(sortedResults),
    concernSourceSummary: buildConcernSourceSummary(sortedResults),
    results: sortedResults,
  };

  const jsonPath = args.json ?? scopeConfig.defaultJsonPath;
  const markdownPath = args.markdown ?? scopeConfig.defaultMarkdownPath;
  writeArtifact(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeArtifact(markdownPath, renderMarkdownReport(report));

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Wrote ${path.relative(repoRoot, markdownPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, jsonPath)}`);
  console.log(`Concern articles: ${report.summary.concernArticleCount}/${report.summary.articleCount}`);
  console.log(`Finished in ${elapsedSeconds}s.`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = inlineValue ?? (argv[index + 1]?.startsWith("--") ? "true" : argv[++index] ?? "true");
    args[key] = value;
  }
  return args;
}

function resolveScopeConfig(args) {
  const scope = args.scope ?? "dose-table-tolerance";
  const config = scopeConfigs[scope];
  if (!config) {
    throw new Error(`Unknown --scope=${scope}. Expected one of: ${Object.keys(scopeConfigs).join(", ")}`);
  }
  return config;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function resolvePostgresUrl(args) {
  if (args.source === "local") return null;
  if (args.sourceUrl) return { key: "--source-url", value: args.sourceUrl };

  for (const key of sourceUrlKeys) {
    if (process.env[key]) return { key, value: process.env[key] };
  }

  throw new Error(`No Postgres read URL found. Set one of: ${sourceUrlKeys.join(", ")}, or run with --source=local.`);
}

function createPostgresClient(sourceUrl) {
  return createDataClient({ target: sourceUrl.value }).client;
}

async function loadArticles({ dataSource, client, args }) {
  if (dataSource === "local") {
    const filePath = path.resolve(repoRoot, args.articlesFile ?? "public/SubstanceIndex.json");
    return JSON.parse(readFileSync(filePath, "utf8"));
  }

  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  return articles.map(({ _id, _creationTime, ...article }) => article);
}

function filterArticles(articles, args) {
  let selected = [...articles].sort((left, right) => String(left.title).localeCompare(String(right.title)));
  if (args.slug) {
    const wanted = new Set(String(args.slug).split(",").map((slug) => slug.trim()).filter(Boolean));
    selected = selected.filter((article) => wanted.has(article.slug ?? slugify(article.title)));
  }
  if (args.limit) {
    selected = selected.slice(0, Number(args.limit));
  }
  return selected;
}

async function loadSourcesForArticle({ article, client, dataSource, localArchiveIndex }) {
  const bySourceId = new Map();
  const slug = article.slug ?? slugify(article.title);

  if (dataSource === "postgres" && client) {
    const doc = await client.query(api.articleSources.getBySlug, {
      slug,
      apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
    });
    for (const [sourceId, text] of Object.entries(doc?.contents ?? {})) {
      addSource(bySourceId, {
        sourceId,
        displayName: getDisplayName(sourceId, doc?.sources),
        text,
        origin: "data_article_sources",
      });
    }
  }

  for (const source of loadLocalArchiveSources(article, localArchiveIndex)) {
    addSource(bySourceId, source);
  }

  for (const source of loadQuoteFileSources(slug)) {
    addSource(bySourceId, source);
  }

  return [...bySourceId.values()];
}

function addSource(bySourceId, source) {
  if (!source?.sourceId || typeof source.text !== "string" || !source.text.trim()) return;
  if (bySourceId.has(source.sourceId)) return;
  bySourceId.set(source.sourceId, source);
}

function getDisplayName(sourceId, metadata = []) {
  return metadata.find((source) => source.id === sourceId)?.displayName ?? sourceDisplayNames[sourceId] ?? sourceId;
}

function buildLocalArchiveIndex(archiveRoot) {
  const index = new Map();
  if (!existsSync(archiveRoot)) return index;

  for (const dirName of readdirSync(archiveRoot)) {
    const dirPath = path.join(archiveRoot, dirName);
    const stat = safeStat(dirPath);
    if (!stat?.isDirectory()) continue;

    const entries = readdirSync(dirPath)
      .map((fileName) => {
        const sourceId = getSourceIdFromLocalFileName(fileName);
        if (!sourceId) return null;
        return {
          sourceId,
          displayName: sourceDisplayNames[sourceId] ?? sourceId,
          filePath: path.join(dirPath, fileName),
          origin: "local_archive",
        };
      })
      .filter(Boolean);

    index.set(slugify(dirName), entries);
  }

  return index;
}

function safeStat(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath) : null;
  } catch {
    return null;
  }
}

function getSourceIdFromLocalFileName(fileName) {
  const prefix = fileName.split(" - ")[0]?.replace(/\.[^.]+$/, "");
  return localSourcePrefixes[prefix] ?? null;
}

function loadLocalArchiveSources(article, localArchiveIndex) {
  const candidates = [article.slug, slugify(article.title)].filter(Boolean);
  const entries = candidates.flatMap((slug) => localArchiveIndex.get(slug) ?? []);
  const uniqueEntries = [...new Map(entries.map((entry) => [entry.sourceId, entry])).values()];

  return uniqueEntries.map((entry) => ({
    sourceId: entry.sourceId,
    displayName: entry.displayName,
    origin: entry.origin,
    text: readFileSync(entry.filePath, "utf8"),
  }));
}

function loadQuoteFileSources(slug) {
  const quoteFiles = [
    {
      sourceId: "dosewiki-dosage-duration-quotes",
      displayName: "dose.wiki extracted dosage-duration quotes",
      filePath: path.join(repoRoot, "quotes/dosage-duration-quotes", `${slug}-dosage-duration.md`),
    },
    {
      sourceId: "dosewiki-tolerance-quotes",
      displayName: "dose.wiki extracted tolerance quotes",
      filePath: path.join(repoRoot, "quotes/tolerance-quotes", `${slug}-tolerance.md`),
    },
  ];

  return quoteFiles
    .filter((entry) => existsSync(entry.filePath))
    .map((entry) => ({
      ...entry,
      origin: "local_quote_extract",
      text: readFileSync(entry.filePath, "utf8"),
    }));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, limit) }, runWorker));
  return results;
}

function writeArtifact(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function renderMarkdownReport(report) {
  const lines = [];
  lines.push(`# ${report.reportTitle ?? "Plagiarism Audit"}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Article data source: ${report.dataSource}${report.dataUrlKey ? ` (${report.dataUrlKey})` : ""}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("Compared fields only:");
  for (const field of report.scope) lines.push(`- \`${field}\``);
  lines.push("");
  lines.push(`Excluded: ${report.excludedSections}.`);
  lines.push("");
  lines.push("## Thresholds");
  lines.push("");
  lines.push(`- Likely plagiarism: ${report.thresholds.likelyWords}+ exact shared words covering at least ${Math.round(report.thresholds.likelyCoverage * 100)}% of the field, or ${report.thresholds.veryLongExactWords}+ exact shared words.`);
  lines.push(`- Needs review: ${report.thresholds.needsReviewWords}+ exact shared words covering at least ${Math.round(report.thresholds.needsReviewCoverage * 100)}% of the field, or ${report.thresholds.likelyWords}+ exact shared words.`);
  lines.push("- PsychonautWiki and Erowid are priority sources; shorter exact overlaps against them are surfaced for review.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Articles audited: ${report.summary.articleCount}`);
  lines.push(`- Articles with plagiarism concerns: ${report.summary.concernArticleCount}`);
  lines.push(`- Scoped fields found: ${report.summary.scopedFieldCount}`);
  lines.push(`- Comparable scoped fields: ${report.summary.comparableFieldCount}`);
  lines.push(`- Likely plagiarism fields: ${report.summary.likelyFieldCount}`);
  lines.push(`- Needs-review fields: ${report.summary.reviewFieldCount}`);
  lines.push(`- PsychonautWiki/Erowid concern fields: ${report.concernSourceSummary.priorityConcernFieldCount}`);
  lines.push("");
  lines.push("| Status | Articles |");
  lines.push("| --- | ---: |");
  for (const [status, count] of Object.entries(report.summary.statusCounts)) {
    lines.push(`| ${getStatusLabel(status)} | ${count} |`);
  }
  lines.push("");
  lines.push("| Concern source | Fields |");
  lines.push("| --- | ---: |");
  for (const [sourceId, count] of Object.entries(report.concernSourceSummary.bySourceId)) {
    lines.push(`| ${sourceDisplayNames[sourceId] ?? sourceId} | ${count} |`);
  }
  lines.push("");
  lines.push("## PsychonautWiki and Erowid Findings");
  lines.push("");

  const priorityFlaggedFields = flaggedFieldsForReport(report).filter(({ field }) =>
    field.bestMatch?.prioritySource,
  );

  if (priorityFlaggedFields.length === 0) {
    lines.push("No PsychonautWiki or Erowid matches crossed the configured concern thresholds.");
  } else {
    lines.push("| Article | Field | Status | Source | Exact overlap | Exact excerpt |");
    lines.push("| --- | --- | --- | --- | ---: | --- |");
    for (const { article, field } of priorityFlaggedFields) {
      lines.push(flaggedFieldRow(article, field));
    }
  }
  lines.push("");
  lines.push("## Flagged Exact Excerpts");
  lines.push("");

  const flaggedFields = flaggedFieldsForReport(report);

  if (flaggedFields.length === 0) {
    lines.push("No fields crossed the configured plagiarism concern thresholds.");
  } else {
    lines.push("| Article | Field | Status | Source | Exact overlap | Exact excerpt |");
    lines.push("| --- | --- | --- | --- | ---: | --- |");
    for (const { article, field } of flaggedFields) {
      lines.push(flaggedFieldRow(article, field));
    }
  }

  lines.push("");
  lines.push("## Article Results");
  lines.push("");
  lines.push("| Article | Status | Scoped fields | Priority sources | Strongest match |");
  lines.push("| --- | --- | ---: | --- | --- |");
  for (const article of report.results) {
    const match = article.strongestMatch;
    const strongest = match
      ? `${match.sourceDisplayName}: ${match.wordCount} exact words (${Math.round(match.exactCoverage * 100)}%)`
      : "none";
    lines.push(
      [
        articleCell(article),
        getStatusLabel(article.status),
        String(article.scopedFieldCount),
        tableCell(article.prioritySourcesAvailable.join(", ") || "none"),
        tableCell(strongest),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This is a deterministic exact-overlap audit, not a legal opinion.");
  lines.push("- Source excerpts are intentionally short. Use the JSON offsets and local source documents for deeper editorial review.");
  lines.push(`- ${report.noScopedContentNote ?? "Articles marked `No scoped content` had no populated field in the configured audit scope."}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function buildConcernSourceSummary(results) {
  const bySourceId = {};
  let priorityConcernFieldCount = 0;

  for (const article of results) {
    for (const field of article.fieldResults) {
      if (field.status !== "likely_plagiarism" && field.status !== "needs_review") continue;
      const sourceId = field.bestMatch?.sourceId ?? "unknown";
      bySourceId[sourceId] = (bySourceId[sourceId] ?? 0) + 1;
      if (field.bestMatch?.prioritySource) priorityConcernFieldCount++;
    }
  }

  return {
    bySourceId: Object.fromEntries(Object.entries(bySourceId).sort((left, right) => right[1] - left[1])),
    priorityConcernFieldCount,
  };
}

function flaggedFieldsForReport(report) {
  return report.results.flatMap((article) =>
    article.fieldResults
      .filter((field) => field.status === "likely_plagiarism" || field.status === "needs_review")
      .map((field) => ({ article, field })),
  );
}

function flaggedFieldRow(article, field) {
  const match = field.bestMatch;
  return [
    articleCell(article),
    tableCell(field.fieldPath),
    getStatusLabel(field.status),
    tableCell(match?.sourceDisplayName ?? "n/a"),
    `${match?.wordCount ?? 0} words (${Math.round((match?.exactCoverage ?? 0) * 100)}%)`,
    tableCell(match?.matchedPhrase ?? ""),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function articleCell(article) {
  return tableCell(`${article.title} (${article.slug})`);
}

function tableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
