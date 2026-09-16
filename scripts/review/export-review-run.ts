#!/usr/bin/env bun

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  hasHarmPotentialContent,
  hasPharmacologyContent,
} from "../../lib/article/normalization.mjs";
import {
  hasDosageDurationContent,
  routeHasDosageContent,
  routeHasDurationContent,
} from "../../src/schema/substance/dosageDurationPresence";
import { getSubstanceSectionManifestEntries } from "../../src/schema/substance/sectionCatalog";
import { substanceVisibility } from "../../src/schema/substance/substanceVisibilityPolicy";
import { getArticleSlug, stripDataMetadata } from "../batch/summary/articles.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

type Article = Record<string, any>;

export interface ReviewExportOptions {
  runId: string;
  includeHidden: boolean;
  includeLowPriority: boolean;
  articles: string[];
}

const DOSE_TIERS = ["threshold", "light", "moderate", "strong", "heavy"] as const;
const DURATION_STAGES = [
  "onset",
  "come_up",
  "peak",
  "offset",
  "after_effects",
  "total_duration",
] as const;
const CITATION_PATTERN = /\[cite:([^\]]+)\]/g;
const SINGULAR_DURATION_UNITS: Readonly<Record<string, string>> = {
  seconds: "second",
  minutes: "minute",
  hours: "hour",
  days: "day",
};

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseReviewExportOptions(
  argv: string[],
  date = currentDate(),
): ReviewExportOptions {
  const options: ReviewExportOptions = {
    runId: `article-review-${date}`,
    includeHidden: false,
    includeLowPriority: false,
    articles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-remote" || argument.startsWith("--target=") || argument.startsWith("--source-url=")) continue;
    if (argument === "--target" || argument === "--source-url") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a Postgres URL.`);
      continue;
    }
    if (argument === "--include-hidden") options.includeHidden = true;
    else if (argument === "--include-low-priority") options.includeLowPriority = true;
    else if (argument.startsWith("--run-id=")) options.runId = argument.slice(9).trim();
    else if (argument.startsWith("--article=")) options.articles.push(argument.slice(10).trim());
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (!options.runId || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.runId)) {
    throw new Error("--run-id must contain only letters, numbers, dots, underscores, and hyphens");
  }
  if (options.articles.some((slug) => !slug)) {
    throw new Error("--article requires a non-empty slug");
  }
  options.articles = [...new Set(options.articles)];
  return options;
}

export function selectReviewArticles(
  allArticles: Article[],
  options: ReviewExportOptions,
): Article[] {
  const requested = new Set(options.articles);
  return allArticles
    .filter((article) => {
      const slug = getArticleSlug(article);
      if (requested.size > 0) return requested.has(slug);
      const visibility = substanceVisibility({
        indexCategories: article.index_categories,
        priority: article.priority,
      });
      return (
        visibility === "public" ||
        (visibility === "hidden" && options.includeHidden) ||
        (visibility === "low_priority" && options.includeLowPriority)
      );
    })
    .sort((left, right) => getArticleSlug(left).localeCompare(getArticleSlug(right), "en"));
}

function present(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(present);
  if (value && typeof value === "object") return Object.values(value).some(present);
  return false;
}

function label(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeTable(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

type RangeValue = {
  min?: number | null;
  max?: number | null;
  unit?: string | null;
};

function range(
  value: RangeValue | null | undefined,
  context: "ordinary" | "threshold" | "duration" = "ordinary",
): string {
  if (!value || (value.min == null && value.max == null)) return "";
  const bounds = value.min == null
    ? `≤ ${value.max}`
    : value.max == null
      ? context === "threshold"
        ? `~${value.min}`
        : `≥ ${value.min}`
      : value.min === value.max
        ? `${value.min}`
        : `${value.min}–${value.max}`;
  const unit = context === "duration" && value.min === 1 && value.max === 1
    ? SINGULAR_DURATION_UNITS[value.unit ?? ""] ?? value.unit
    : value.unit;
  return `${bounds}${unit ? ` ${unit}` : ""}`;
}

function renderValue(value: unknown, depth = 3): string[] {
  if (!present(value)) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value).trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!present(entry)) return [];
      if (typeof entry !== "object") return [`- ${String(entry).trim()}`];
      return [`- ${Object.entries(entry).filter(([, item]) => present(item)).map(([key, item]) => `${label(key)}: ${typeof item === "object" ? JSON.stringify(item) : item}`).join("; ")}`];
    });
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (!present(entry)) return [];
    const heading = `${"#".repeat(Math.min(depth, 6))} ${label(key)}`;
    return [heading, "", ...renderValue(entry, depth + 1), ""];
  });
}

function renderDosage(article: Article): string[] {
  const routes = (article.dosage?.routes ?? []).filter(routeHasDosageContent);
  if (!routes.length && !present(article.dosage?.plateau_dosing)) return [];
  const lines = ["## Dosage", ""];
  for (const route of routes) {
    lines.push(`### ${route.route || "Unspecified route"}`, "");
    // A prose-only route is a supported state: every tier is null and the human
    // content lives in notes/bioavailability. Emitting the header first produced
    // a table with no rows, so the rows are collected before it is written.
    const tierRows: string[] = [];
    for (const tier of DOSE_TIERS) {
      const rendered = range(route.dose_ranges?.[tier], tier === "threshold" ? "threshold" : "ordinary");
      if (rendered) tierRows.push(`| ${label(tier)} | ${escapeTable(rendered)} |`);
    }
    if (tierRows.length) lines.push("| Tier | Range |", "| --- | --- |", ...tierRows);
    if (present(route.bioavailability)) lines.push("", `**Bioavailability:** ${route.bioavailability}`);
    if (present(route.bioavailability_notes)) lines.push("", String(route.bioavailability_notes));
    if (present(route.notes)) lines.push("", String(route.notes));
    lines.push("");
  }
  if (present(article.dosage?.plateau_dosing)) {
    lines.push("### Plateau Dosing", "", ...renderValue(article.dosage.plateau_dosing, 4), "");
  }
  return lines;
}

function renderDuration(article: Article): string[] {
  const routes = (article.duration?.routes ?? []).filter(routeHasDurationContent);
  if (!routes.length) return [];
  const lines = ["## Duration", ""];
  for (const route of routes) {
    lines.push(`### ${route.route || "Unspecified route"}`, "", "| Stage | Duration |", "| --- | --- |");
    for (const stage of DURATION_STAGES) {
      const rendered = range(route.stages?.[stage], "duration");
      if (rendered) lines.push(`| ${label(stage)} | ${escapeTable(rendered)} |`);
    }
    if (present(route.half_life)) lines.push("", `**Half-life:** ${route.half_life}`);
    if (present(route.half_life_notes)) lines.push("", String(route.half_life_notes));
    lines.push("");
  }
  return lines;
}

function renderNamedSection(heading: string, value: unknown): string[] {
  return present(value) ? [`## ${heading}`, "", ...renderValue(value), ""] : [];
}

function renderReferences(article: Article): string[] {
  const references = Array.isArray(article.references) ? article.references : [];
  const legacy = [...(article.source_citations ?? []), ...(article.citations ?? [])];
  if (!references.length && !legacy.length) return [];
  const lines = ["## References", ""];
  for (const reference of references) {
    const creators = reference.authors?.join(", ");
    const publication = [creators, reference.year ?? reference.date, reference.title, reference.containerTitle ?? reference.siteName ?? reference.publisher].filter(present).join(". ");
    const identifier = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
    lines.push(`- [${reference.id}] ${publication}${identifier ? `. ${identifier}` : ""}`);
  }
  for (const citation of legacy) {
    if (present(citation)) lines.push(`- ${citation.name || citation.url}${citation.name && citation.url ? ` — ${citation.url}` : ""}`);
  }
  return [...lines, ""];
}

export function renderReviewMarkdown(rawArticle: Article): string {
  const article = stripDataMetadata(rawArticle);
  const lines: string[] = [`# ${article.title}`, ""];
  if (present(article.summary)) lines.push("## Summary", "", article.summary.trim(), "");
  lines.push(...renderNamedSection("Classification", article.classification));
  if (hasDosageDurationContent(article)) {
    lines.push(...renderDosage(article), ...renderDuration(article));
  }
  lines.push(...renderNamedSection("Subjective Effects", article.subjective_effects));
  if (hasPharmacologyContent(article.pharmacology)) lines.push(...renderNamedSection("Pharmacology", article.pharmacology));
  lines.push(...renderNamedSection("Interactions", article.interactions));
  lines.push(...renderNamedSection("Tolerance", article.tolerance));
  if (hasHarmPotentialContent(article.harm_potential)) lines.push(...renderNamedSection("Harm Potential", article.harm_potential));
  lines.push(...renderNamedSection("History & Culture", article.history_culture));
  lines.push(...renderNamedSection("Legality", article.legality));
  lines.push(...renderReferences(article));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function citationCount(value: unknown): number {
  if (typeof value === "string") return [...value.matchAll(CITATION_PATTERN)].length;
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + citationCount(entry), 0);
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((sum, [key, entry]) => sum + (key === "reference_ids" && Array.isArray(entry) ? entry.filter(present).length : citationCount(entry)), 0);
  }
  return 0;
}

export function derivePresenceSidecar(rawArticle: Article): Record<string, unknown> {
  const article = stripDataMetadata(rawArticle);
  const sections = Object.fromEntries(
    getSubstanceSectionManifestEntries()
      .filter((section) => section.id !== "editorial-review" && section.id !== "citations")
      .map((section) => {
        const isPresent = section.public.isPresent
          ? section.public.isPresent(article as never)
          : section.articleFields.some((field) => present(article[field]));
        return [section.id, Boolean(isPresent)];
      }),
  );
  const dosage = Object.fromEntries((article.dosage?.routes ?? []).filter(routeHasDosageContent).map((route: any) => [route.route, DOSE_TIERS.filter((tier) => range(route.dose_ranges?.[tier]))]));
  const duration = Object.fromEntries((article.duration?.routes ?? []).filter(routeHasDurationContent).map((route: any) => [route.route, DURATION_STAGES.filter((stage) => range(route.stages?.[stage]))]));
  const citations = Object.fromEntries(
    getSubstanceSectionManifestEntries()
      .filter((section) => section.id !== "editorial-review" && section.id !== "citations")
      .map((section) => {
        const count = section.id === "sources"
          ? (article.references?.length ?? 0) + (article.source_citations?.length ?? 0) + (article.citations?.length ?? 0)
          : section.articleFields.reduce((sum, field) => sum + citationCount(article[field]), 0);
        return [section.id, { present: count > 0, count }];
      }),
  );

  return {
    slug: getArticleSlug(article),
    sections,
    dosage: { populatedTiersByRoute: dosage },
    duration: { populatedStagesByRoute: duration },
    pharmacology: {
      present: hasPharmacologyContent(article.pharmacology),
      pharmacodynamics: present(article.pharmacology?.pharmacodynamics) || present(article.pharmacology?.summary),
      pharmacokinetics: present(article.pharmacology?.pharmacokinetics) || present(article.pharmacology?.metabolism),
    },
    harmPotential: { present: hasHarmPotentialContent(article.harm_potential) },
    interactions: { present: Boolean(sections.interactions) },
    citations,
  };
}

export function writeReviewRun({
  articles,
  options,
  repoRoot,
  exportedAt = new Date().toISOString(),
}: {
  articles: Article[];
  options: ReviewExportOptions;
  repoRoot: string;
  exportedAt?: string;
}): string {
  const runDirectory = resolve(repoRoot, "runs", options.runId);
  if (existsSync(runDirectory)) throw new Error(`Review Run already exists: ${runDirectory}`);
  mkdirSync(resolve(runDirectory, "articles"), { recursive: true });
  mkdirSync(resolve(runDirectory, "presence"), { recursive: true });
  const slugs = articles.map(getArticleSlug);
  for (const article of articles) {
    const slug = getArticleSlug(article);
    writeFileSync(resolve(runDirectory, "articles", `${slug}.md`), renderReviewMarkdown(article));
    writeFileSync(resolve(runDirectory, "presence", `${slug}.json`), `${JSON.stringify(derivePresenceSidecar(article), null, 2)}\n`);
  }
  writeFileSync(resolve(runDirectory, "manifest.json"), `${JSON.stringify({ runId: options.runId, selection: { includeHidden: options.includeHidden, includeLowPriority: options.includeLowPriority, articles: options.articles }, slugs, exportedAt }, null, 2)}\n`);
  return runDirectory;
}

async function main(): Promise<void> {
  const options = parseReviewExportOptions(process.argv.slice(2));
  const runContext = createDataOpsRunContext({
    operation: "export Review Run articles",
    intent: "local-export",
    argv: process.argv.slice(2),
    sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL"],
    targetUrlKeys: [],
    selectedTables: ["substanceIndex"],
    localArtifacts: [`runs/${options.runId}`],
  });
  const sourceUrl = requireSourceUrl(runContext, "Review Run Postgres source URL");
  printDataOpsRunContext(runContext);
  const client = createDataClient({ target: sourceUrl }).client;
  const allArticles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const articles = selectReviewArticles(allArticles, options);
  const requested = new Set(options.articles);
  const found = new Set(articles.map(getArticleSlug));
  const missing = [...requested].filter((slug) => !found.has(slug));
  if (missing.length) throw new Error(`Requested article(s) not found: ${missing.join(", ")}`);
  const output = writeReviewRun({ articles, options, repoRoot: runContext.repoRoot });
  console.log(`Exported ${articles.length} article(s) to ${output}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Review Run export failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
