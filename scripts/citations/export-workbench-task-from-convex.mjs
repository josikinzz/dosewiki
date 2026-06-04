#!/usr/bin/env node
// Export a live Convex article into the external citation workbench task shape.
// The citable article surface is marker-stripped so Claude can cite from a clean
// draft while the apply path can still prove the underlying live prose matches.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";
import {
  CITABLE_ARTICLE_SECTIONS,
  EXCLUDED_CITATION_SECTIONS,
  stripCitationMarkersFromValue,
} from "./citation-marker-workflow.mjs";

function parseOptions(argv) {
  return {
    slug: getFlagValue(argv, "--slug") ?? "2c-b",
    workbenchDir: getFlagValue(argv, "--workbench") ?? "/Users/josie/.codex/dosewiki-citation-workbench",
    psychonautWikiCacheDir: getFlagValue(argv, "--psychonautwiki-cache"),
    overwrite: argv.includes("--overwrite"),
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Export a Convex-backed article into a marker-only workbench task.

Usage:
  npm run citations:export-workbench-task -- --slug=2c-b --dry-run
  npm run citations:export-workbench-task -- --slug=2c-b --overwrite

Options:
  --slug=<slug>          Article slug (default: 2c-b)
  --workbench=<path>     External workbench path
  --psychonautwiki-cache=<path>
                         Optional PsychonautWiki reference cache directory
  --overwrite            Replace an existing inputs/<slug>-full.json
  --dry-run              Print the planned output path without writing
`);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeReference(reference) {
  return {
    id: reference.id,
    type: reference.type ?? "unknown",
    template: reference.template ?? null,
    title: reference.title ?? "",
    authors: list(reference.authors),
    year: reference.year ?? null,
    date: reference.date ?? null,
    containerTitle: reference.containerTitle ?? null,
    siteName: reference.siteName ?? null,
    publisher: reference.publisher ?? null,
    volume: reference.volume ?? null,
    issue: reference.issue ?? null,
    pages: reference.pages ?? null,
    articleNumber: reference.articleNumber ?? null,
    chapter: reference.chapter ?? null,
    edition: reference.edition ?? null,
    series: reference.series ?? null,
    location: reference.location ?? null,
    institution: reference.institution ?? null,
    language: reference.language ?? null,
    doi: reference.doi ?? null,
    pmid: reference.pmid ?? null,
    isbn: reference.isbn ?? null,
    url: reference.url ?? null,
    archiveUrl: reference.archiveUrl ?? null,
    archiveDate: reference.archiveDate ?? null,
    accessedAt: reference.accessedAt ?? null,
    sourceType: reference.sourceType ?? "unknown",
    quality: reference.quality ?? "unknown",
    discoverySource: reference.discoverySource ?? "existing_article_reference",
    access: reference.access ?? "unknown",
    supportStatus: reference.supportStatus ?? "unknown",
    apaText: reference.apaText ?? null,
  };
}

function readPsychonautWikiDiscoveryPacket({ workbenchDir, cacheDir, slug }) {
  const resolvedCacheDir = cacheDir
    ? resolve(cacheDir)
    : resolve(workbenchDir, "source-cache", "psychonautwiki");
  const cachePath = resolve(resolvedCacheDir, `${slug}.references.json`);
  if (!existsSync(cachePath)) return null;
  const packet = JSON.parse(readFileSync(cachePath, "utf8"));
  return {
    ...packet,
    role: "candidate_discovery_only",
    sourceName: packet.sourceName ?? "PsychonautWiki",
    sourceType: "community_wiki",
    cachePath,
    references: list(packet.references),
    notes: [
      ...(Array.isArray(packet.notes) ? packet.notes : []),
      "PsychonautWiki cache is local discovery context only; public support still requires inspected underlying sources.",
    ],
  };
}

function citableSectionsFromArticle(article) {
  return Object.fromEntries(
    CITABLE_ARTICLE_SECTIONS.map((sectionKey) => [
      sectionKey,
      stripCitationMarkersFromValue(structuredClone(article?.[sectionKey] ?? null)),
    ]),
  );
}

function buildTask(article, slug, options) {
  const existingReferences = list(article.references)
    .filter((reference) => typeof reference?.id === "string" && reference.id.trim())
    .map(normalizeReference);
  const psychonautWikiPacket = readPsychonautWikiDiscoveryPacket({
    workbenchDir: options.workbenchDir,
    cacheDir: options.psychonautWikiCacheDir,
    slug,
  });
  const discoveryPackets = {
    ...(psychonautWikiPacket ? { psychonautwiki: psychonautWikiPacket } : {}),
  };

  return {
    schemaVersion: "dosewiki_citation_task_v1",
    taskId: slug,
    createdAt: new Date().toISOString(),
    provenance: {
      source: "live_convex_export",
      taskMode: "apply_bound",
      exportedAt: new Date().toISOString(),
    },
    article: {
      slug,
      title: article.title ?? slug,
      existingReferences,
      sections: [...CITABLE_ARTICLE_SECTIONS],
      citableSections: citableSectionsFromArticle(article),
      excludedCitationSections: [...EXCLUDED_CITATION_SECTIONS],
      targets: [],
      targetsAuthoritative: false,
    },
    sourcePacket: {
      compiledSources: [],
      quoteCorpus: [],
      wikipediaCitationPacket: {
        title: article.title ?? slug,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(article.title ?? slug).replaceAll(" ", "_"))}`,
        revisionId: null,
        revisionTimestamp: null,
        fetchedAt: new Date().toISOString(),
        role: "candidate_discovery_only",
        excerpts: [],
        references: existingReferences,
      },
      allowedReferences: existingReferences,
      discoveryPackets,
    },
    instructions: {
      citationStyle: "Wikipedia-style structured references",
      markerStyle: "[cite:reference-id]",
      preferUnderlyingWikipediaReferences: true,
      allowLiveWebResearch: true,
      writeMode: "draft_only",
      workflow: "marker_only_section_workers_then_article_wide",
      entrypoint: `/cite ${slug}`,
      sectionOutputPattern: `runs/${slug}/sections/<section-key>.json`,
      articleWideInput: `runs/${slug}/article-wide-input.json`,
      articleWideOutput: `runs/${slug}/article-wide.json`,
      mergeOutputs: [`runs/${slug}/citation-draft.json`, `runs/${slug}/citation-report.md`],
      notes: [
        "Task scaffold generated from the live Convex article surface.",
        "Citable sections were stripped of existing [cite:*] markers before citation work.",
        "Only insert [cite:reference-id] markers. Do not rewrite article text outside markers.",
        "Wikipedia and other wiki pages are discovery context only. Public markers need inspected Wikipedia-grade sources.",
        "PsychonautWiki reference caches, when present, are local discovery packets only. Inspect the underlying source before using a candidate as public support.",
      ],
    },
  };
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (options.help) {
  printHelp();
  process.exit(0);
}

const runContext = createDataOpsRunContext({
  operation: "export Convex article to citation workbench task",
  intent: "citation-pilot",
  argv,
  sourceUrlKeys: ["SOURCE_CONVEX_URL", "CONVEX_PUBLIC_READ_URL", "VITE_CONVEX_URL"],
  dryRunFlag: "--dry-run",
  executeFlag: "--overwrite",
  requiresExecute: false,
  selectedTables: ["substanceIndex"],
  localArtifacts: [resolve(options.workbenchDir, "inputs", `${options.slug}-full.json`)],
  destructive: false,
});
runContext.dryRun = Boolean(options.dryRun);
runContext.writeEnabled = !options.dryRun;

printDataOpsRunContext(runContext);
console.log(`Slug: ${options.slug}`);
console.log(`Workbench: ${options.workbenchDir}`);
console.log(`PsychonautWiki cache: ${options.psychonautWikiCacheDir ?? resolve(options.workbenchDir, "source-cache", "psychonautwiki")}`);
console.log("");

const sourceUrl = requireSourceUrl(runContext, "Convex article source URL");
const client = new ConvexHttpClient(sourceUrl);
const article = await client.query(api.substanceIndex.getBySlug, { slug: options.slug });
if (!article) {
  throw new Error(`No article found for slug: ${options.slug}`);
}

const outputPath = resolve(options.workbenchDir, "inputs", `${options.slug}-full.json`);
const task = buildTask(article, options.slug, options);
const citableSummary = Object.fromEntries(
  Object.entries(task.article.citableSections).map(([sectionKey, value]) => [
    sectionKey,
    JSON.stringify(value ?? "").length,
  ]),
);

console.log("Task summary");
console.log(JSON.stringify({
  outputPath,
  title: task.article.title,
  citableSections: citableSummary,
  existingReferences: task.article.existingReferences.length,
  psychonautWikiReferenceCandidates: task.sourcePacket.discoveryPackets?.psychonautwiki?.references?.length ?? 0,
}, null, 2));
console.log("");

if (options.dryRun) {
  console.log("No local files written. Re-run without --dry-run to write the workbench task.");
  process.exit(0);
}

if (existsSync(outputPath) && !options.overwrite) {
  throw new Error(`${outputPath} already exists. Pass --overwrite to replace it.`);
}

mkdirSync(resolve(options.workbenchDir, "inputs"), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(task, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
