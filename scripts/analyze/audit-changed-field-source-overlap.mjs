#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  DEFAULT_AUDIT_THRESHOLDS,
  compareFieldToSources,
  slugify,
} from "./plagiarism-audit-core.mjs";
import { getByPath } from "../data-ops/apply-dose-table-tolerance-plagiarism-rewrites.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {
    sourceUrl: null,
    proposals: null,
    output: null,
    fail: false,
  };

  for (const arg of argv) {
    if (arg === "--fail") {
      options.fail = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    options[match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = match[2];
  }

  if (!options.sourceUrl) throw new Error("Provide --source-url=<url>");
  if (!options.proposals) throw new Error("Provide --proposals=<path>");
  if (!options.output) throw new Error("Provide --output=<path>");
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function writeArtifact(filePath, value) {
  const absolutePath = path.resolve(repoRoot, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getArticleSlug(article) {
  return article.slug ?? slugify(article.title);
}

function sourceDisplayName(sourceId, metadata = []) {
  return metadata.find((source) => source.id === sourceId)?.displayName ?? sourceId;
}

async function loadSources(client, slug) {
  const doc = await client.query(api.articleSources.getBySlug, {
    slug,
    apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
  });
  return Object.entries(doc?.contents ?? {})
    .filter(([, text]) => typeof text === "string" && text.trim().length > 0)
    .map(([sourceId, text]) => ({
      sourceId,
      displayName: sourceDisplayName(sourceId, doc?.sources),
      text,
      origin: "data_article_sources",
    }));
}

function fieldSection(fieldPath) {
  return String(fieldPath ?? "").split(/[.[\]]/, 1)[0] || "article";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const proposalDoc = readJson(options.proposals);
  const proposals = proposalDoc.proposals ?? [];
  const { client, fingerprint } = createDataClient({ target: options.sourceUrl });
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const articlesBySlug = new Map(articles.map((article) => [getArticleSlug(article), article]));
  const sourceCache = new Map();
  const results = [];
  const errors = [];

  for (const proposal of proposals) {
    const article = articlesBySlug.get(proposal.slug);
    if (!article) {
      errors.push(`${proposal.slug}: live article not found`);
      continue;
    }

    const value = getByPath(article, proposal.fieldPath);
    if (typeof value !== "string") {
      errors.push(`${proposal.slug} ${proposal.fieldPath}: live value is not a string`);
      continue;
    }
    if (value.trim() !== proposal.replacementValue.trim()) {
      errors.push(`${proposal.slug} ${proposal.fieldPath}: live value does not match proposal replacement`);
      continue;
    }

    if (!sourceCache.has(proposal.slug)) {
      sourceCache.set(proposal.slug, await loadSources(client, proposal.slug));
    }

    const fieldResult = compareFieldToSources(
      {
        section: fieldSection(proposal.fieldPath),
        fieldPath: proposal.fieldPath,
        label: proposal.fieldPath,
        value,
      },
      sourceCache.get(proposal.slug),
      DEFAULT_AUDIT_THRESHOLDS,
    );

    results.push({
      id: proposal.id,
      slug: proposal.slug,
      title: proposal.title ?? null,
      fieldPath: proposal.fieldPath,
      status: fieldResult.status,
      fieldWordCount: fieldResult.fieldWordCount,
      sourceCount: fieldResult.sourceCount,
      prioritySourcesAvailable: fieldResult.prioritySourcesAvailable,
      bestMatch: fieldResult.bestMatch ?? null,
    });
  }

  const concernResults = results.filter((result) =>
    result.status === "likely_plagiarism" || result.status === "needs_review",
  );
  const report = {
    generatedAt: new Date().toISOString(),
    remediationScope: proposalDoc.remediationScope ?? null,
    deployment: proposalDoc.deployment ?? null,
    sourceDeployment: fingerprint,
    proposalPath: options.proposals,
    changedFieldCount: proposals.length,
    auditedFieldCount: results.length,
    errorCount: errors.length,
    concernCount: concernResults.length,
    statusCounts: results.reduce((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {}),
    errors,
    concernResults,
    results,
  };

  writeArtifact(options.output, report);
  console.log(JSON.stringify({
    deployment: report.deployment,
    changedFieldCount: report.changedFieldCount,
    auditedFieldCount: report.auditedFieldCount,
    errorCount: report.errorCount,
    concernCount: report.concernCount,
    output: options.output,
  }, null, 2));

  if (options.fail && (report.errorCount > 0 || report.concernCount > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
