#!/usr/bin/env node
// Export a live Postgres article into the external citation workbench task shape.
// The citable article surface is marker-stripped so Claude can cite from a clean
// draft while the apply path can still prove the underlying live prose matches.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
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
import {
  buildExportScope,
  selectedSectionsFromTracker,
} from "./subsection-rollout-lib.mjs";
import { secondPassScopeForSlug } from "./second-pass-research-lib.mjs";
import {
  CITATION_EVIDENCE_RULES,
  SECOND_PASS_RESEARCH_INSTRUCTION,
} from "./citation-evidence-policy.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";

function parseOptions(argv) {
  const help = argv.includes("--help") || argv.includes("-h");
  const workbenchDir = help ? null : resolveCitationWorkbenchRoot(getFlagValue(argv, "--workbench"));
  return {
    slug: getFlagValue(argv, "--slug") ?? "2c-b",
    workbenchDir,
    psychonautWikiCacheDir: getFlagValue(argv, "--psychonautwiki-cache"),
    sections: getFlagValue(argv, "--sections"),
    trackerScope: argv.includes("--tracker-scope"),
    trackerPath: getFlagValue(argv, "--tracker") ?? (help ? null : resolve(workbenchDir, "trackers", "subsection-rollout.json")),
    secondPassPlan: getFlagValue(argv, "--second-pass-plan"),
    secondPassMaxWave: Number(getFlagValue(argv, "--second-pass-max-wave") ?? 3),
    overwrite: argv.includes("--overwrite"),
    dryRun: argv.includes("--dry-run"),
    help,
  };
}

function printHelp() {
  console.log(`
Export a Postgres-backed article into a marker-only workbench task.

Usage:
  npm run citations:export-workbench-task -- --slug=2c-b --dry-run
  npm run citations:export-workbench-task -- --slug=2c-b --overwrite

Options:
  --slug=<slug>          Article slug (default: 2c-b)
  --workbench=<path>     External workbench path (default: DOSEWIKI_CITATION_WORKBENCH, required)
  --psychonautwiki-cache=<path>
                         Optional PsychonautWiki reference cache directory
  --overwrite            Replace an existing inputs/<slug>-full.json
  --sections=a,b         Freeze a scoped run: only these citable sections may
                         change; all others are preserved byte-for-byte
  --tracker-scope        Derive --sections from ready rows for this slug in
                         the subsection rollout tracker
  --tracker=<path>       Tracker path for --tracker-scope
                         (default: workbench trackers/subsection-rollout.json)
  --second-pass-plan=<path>
                         Derive scope and a frozen research brief from a
                         dosewiki_citation_second_pass_plan_v1 artifact
  --second-pass-max-wave=1|2|3
                         Include actionable candidates through this wave
                         (default: 3)
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

function resolveSectionScope(article, slug, options) {
  const scopeFlags = [Boolean(options.sections), options.trackerScope, Boolean(options.secondPassPlan)].filter(Boolean);
  if (scopeFlags.length > 1) {
    throw new Error("Pass exactly one scope source: --sections, --tracker-scope, or --second-pass-plan.");
  }
  if (!Number.isInteger(options.secondPassMaxWave) || options.secondPassMaxWave < 1 || options.secondPassMaxWave > 3) {
    throw new Error("--second-pass-max-wave must be 1, 2, or 3.");
  }
  let selectedSections = null;
  let source = null;
  let trackerPath = null;
  let researchBrief = null;
  if (options.sections) {
    selectedSections = options.sections.split(",").map((entry) => entry.trim()).filter(Boolean);
    source = "explicit";
  } else if (options.trackerScope) {
    if (!existsSync(options.trackerPath)) {
      throw new Error(`Subsection rollout tracker not found: ${options.trackerPath}`);
    }
    const tracker = JSON.parse(readFileSync(options.trackerPath, "utf8"));
    selectedSections = selectedSectionsFromTracker(tracker, slug);
    source = "tracker";
    trackerPath = options.trackerPath;
  } else if (options.secondPassPlan) {
    const planPath = resolve(options.secondPassPlan);
    if (!existsSync(planPath)) throw new Error(`Second-pass research plan not found: ${planPath}`);
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const scoped = secondPassScopeForSlug(plan, slug, { maxWave: options.secondPassMaxWave });
    selectedSections = scoped.selectedSections;
    researchBrief = { ...scoped.researchBrief, planPath, maxWave: options.secondPassMaxWave };
    source = "second_pass_plan";
    trackerPath = planPath;
  }
  if (!selectedSections) return null;

  const citableSections = citableSectionsFromArticle(article);
  return {
    ...buildExportScope({
      originalSections: Object.fromEntries(
        CITABLE_ARTICLE_SECTIONS.map((sectionKey) => [sectionKey, article?.[sectionKey] ?? null]),
      ),
      strippedSections: citableSections,
      selectedSections,
      referenceCount: list(article.references).length,
      source,
      trackerPath,
      frozenAt: new Date().toISOString(),
    }),
    researchBrief,
  };
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
  const sectionScope = resolveSectionScope(article, slug, options);

  return {
    schemaVersion: "dosewiki_citation_task_v1",
    taskId: slug,
    createdAt: new Date().toISOString(),
    provenance: {
      source: "live_postgres_export",
      taskMode: "apply_bound",
      exportedAt: new Date().toISOString(),
      researchPass: sectionScope?.researchBrief ? "second" : "initial",
    },
    // Top-level live-research permission read by the Pi run manifest; mirrors
    // instructions.allowLiveWebResearch so scoped rollout workers may inspect
    // non-wiki sources behind discovery candidates.
    allowLiveWebResearch: true,
    ...(sectionScope
      ? {
          selectedSections: sectionScope.selectedSections,
          sectionScope: sectionScope.sectionScope,
          ...(sectionScope.researchBrief
            ? { researchPass: "second", researchBrief: sectionScope.researchBrief }
            : {}),
        }
      : {}),
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
        "Task scaffold generated from the live Postgres article surface.",
        "Citable sections were stripped of existing [cite:*] markers before citation work.",
        ...CITATION_EVIDENCE_RULES,
        ...(sectionScope
          ? [
              `Scoped run: only add markers inside selectedSections (${sectionScope.selectedSections.join(", ")}). Every other citable section must remain byte-for-byte unchanged.`,
            ]
          : []),
        ...(sectionScope?.researchBrief
          ? [SECOND_PASS_RESEARCH_INSTRUCTION]
          : []),
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
  operation: "export Postgres article to citation workbench task",
  intent: "citation-pilot",
  argv,
  sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL"],
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

const sourceUrl = requireSourceUrl(runContext, "Postgres article source URL");
const client = createDataClient({ target: sourceUrl }).client;
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
  selectedSections: task.selectedSections ?? null,
  researchPass: task.researchPass ?? "initial",
  secondPassCandidates: task.researchBrief?.candidates?.map((entry) => `${entry.section}:${entry.priority}`) ?? [],
  sectionScope: task.sectionScope
    ? Object.fromEntries(
        Object.entries(task.sectionScope.sections).map(([key, entry]) => [
          key,
          entry.selected ? "selected" : entry.skipReason,
        ]),
      )
    : null,
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
