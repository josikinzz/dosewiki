#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { immutableRowKey, sha256File } from "./second-pass-derived-state.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";

const ACTIONABLE_STATUSES = new Set(["needs_review", "needs_source"]);
const CONTEXT_STATUSES = new Set(["excluded", "verified"]);
const DATA_PLACEHOLDER = "__DOSEWIKI_REVIEW_DATA__";
const MARKER_PATTERN = /\[cite:([^\]]+)\]/g;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const [key, inline] = entry.slice(2).split("=", 2);
    if (key === "help") {
      values.help = true;
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (!value || (!inline && value.startsWith("--"))) throw new Error(`Missing value for --${key}`);
    if (!inline) index += 1;
    values[key] = value;
  }
  return values;
}

function sectionForRecord(record) {
  for (const candidate of [record?.fieldPath, record?.markerPath, record?.field, record?.section, record?.sectionKey]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    return candidate.trim().split(/[.[]/, 1)[0];
  }
  return null;
}

function markerReferenceIds(value) {
  const ids = [];
  const text = JSON.stringify(value ?? null);
  for (const match of text.matchAll(MARKER_PATTERN)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

function markerCount(value) {
  return [...JSON.stringify(value ?? null).matchAll(MARKER_PATTERN)].length;
}

function titleFromSlug(slug) {
  return slug.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

function safeReadJson(path) {
  return existsSync(path) ? readJson(path) : null;
}

function resolveRunArtifacts(workbench, trackerRow, currentRow = null) {
  const runId = currentRow?.runId ?? trackerRow.runId;
  if (!runId) throw new Error(`${trackerRow.slug}:${trackerRow.section} has no tracker runId`);
  const runPath = resolve(workbench, "runs", runId);
  const draftPath = resolve(runPath, "citation-draft.json");
  const manifestPath = resolve(runPath, "pi-run-manifest.json");
  if (!existsSync(draftPath) || !existsSync(manifestPath)) {
    throw new Error(`${trackerRow.slug}:${trackerRow.section} is bound to incomplete run ${runId}`);
  }
  const manifest = readJson(manifestPath);
  const draft = readJson(draftPath);
  if (manifest.outcome !== "needs_review" || !manifest.finalizedAt) {
    throw new Error(`${trackerRow.slug}:${trackerRow.section} run ${runId} is not finalized at needs_review`);
  }
  if (draft.article?.slug !== trackerRow.slug) {
    throw new Error(`${trackerRow.slug}:${trackerRow.section} run ${runId} has article slug drift`);
  }
  if (currentRow) {
    const finalReviewDraftSha256 = manifest.gates?.final_review_surface_scan?.snapshot?.draft;
    const draftSha256 = sha256File(draftPath);
    if (currentRow.finalizedDraftSha256 !== draftSha256 || currentRow.finalReviewDraftSha256 !== finalReviewDraftSha256) {
      throw new Error(`${trackerRow.slug}:${trackerRow.section} current campaign row does not match finalized draft hashes`);
    }
  }
  return {
    runId,
    runPath,
    draft,
    manifest,
    task: safeReadJson(resolve(runPath, "citation-task.json")),
    articleWideInput: safeReadJson(resolve(runPath, "article-wide-input.json")),
    citationReport: existsSync(resolve(runPath, "citation-report.md"))
      ? readFileSync(resolve(runPath, "citation-report.md"), "utf8")
      : "",
  };
}

function selectSectionData(artifacts, section) {
  if (Object.hasOwn(artifacts.draft.markedSections ?? {}, section)) {
    return { value: artifacts.draft.markedSections[section], source: "markedSections", warning: null };
  }
  if (Object.hasOwn(artifacts.articleWideInput?.sections ?? {}, section)) {
    return {
      value: artifacts.articleWideInput.sections[section],
      source: "articleWideInput",
      warning: "No marked section was emitted; showing preserved article-wide input.",
    };
  }
  if (Object.hasOwn(artifacts.task?.article?.citableSections ?? {}, section)) {
    return {
      value: artifacts.task.article.citableSections[section],
      source: "citationTask",
      warning: "No marked section was emitted; showing the frozen task baseline.",
    };
  }
  return { value: null, source: "missing", warning: "No section representation was found in the finalized run." };
}

function compactRun(draft, manifest, warning) {
  return {
    schemaVersion: draft.schemaVersion ?? null,
    citationMode: draft.citationMode ?? null,
    taskId: draft.taskId ?? manifest.runId ?? null,
    generatedAt: draft.generatedAt ?? manifest.finalizedAt ?? null,
    summary: draft.summary ?? "",
    validation: draft.validation ?? null,
    selectedSections: draft.selectedSections ?? manifest.selectedSections ?? null,
    failedSections: draft.failedSections ?? [],
    provenance: draft.provenance ?? null,
    researchLog: Array.isArray(draft.researchLog) ? draft.researchLog : [],
    notes: [...(Array.isArray(draft.notes) ? draft.notes : []), ...(warning ? [warning] : [])],
    manifestOutcome: manifest.outcome,
    finalizedAt: manifest.finalizedAt,
  };
}

export function buildCitationReviewData({ tracker, workbench, campaignState = null }) {
  const actionableTrackerRows = (tracker.items ?? []).filter((row) => ACTIONABLE_STATUSES.has(row.status));
  const contextTrackerRows = (tracker.items ?? []).filter((row) => CONTEXT_STATUSES.has(row.status));
  const requiresCurrentRows = tracker.researchPass === "second";
  const currentByKey = new Map();
  for (const currentRow of campaignState?.currentRows ?? []) {
    const key = currentRow.key ?? immutableRowKey(currentRow);
    if (currentByKey.has(key)) throw new Error(`duplicate current campaign row ${key}`);
    currentByKey.set(key, currentRow);
  }
  if (requiresCurrentRows && !Array.isArray(campaignState?.currentRows)) {
    throw new Error("second-pass dossier requires campaignState.currentRows");
  }
  const artifactCache = new Map();
  const rows = actionableTrackerRows.map((trackerRow, index) => {
    const key = immutableRowKey(trackerRow);
    const currentRow = currentByKey.get(key) ?? null;
    if (requiresCurrentRows && !currentRow) throw new Error(`${key} has no current campaign row`);
    const cacheKey = currentRow?.runId ?? trackerRow.runId;
    const artifacts = artifactCache.get(cacheKey) ?? resolveRunArtifacts(workbench, trackerRow, currentRow);
    artifactCache.set(cacheKey, artifacts);
    const section = trackerRow.section;
    const sectionData = selectSectionData(artifacts, section);
    if (currentRow && sectionData.source !== "markedSections") {
      throw new Error(`${key} current campaign row has no accepted marked section`);
    }
    const evidence = (artifacts.draft.evidence ?? []).filter((record) => sectionForRecord(record) === section);
    const scopedGaps = [];
    const unscopedRunGaps = [];
    for (const gap of artifacts.draft.gaps ?? []) {
      const gapSection = sectionForRecord(gap);
      if (gapSection === section) scopedGaps.push(gap);
      else if (!gapSection) unscopedRunGaps.push(gap);
    }
    const usedReferenceIds = [...new Set([
      ...markerReferenceIds(sectionData.value),
      ...evidence.flatMap((record) => Array.isArray(record.referenceIds) ? record.referenceIds : []),
      ...evidence.flatMap((record) => (record.supports ?? []).map((support) => support.referenceId)),
    ].filter(Boolean))];
    const references = (artifacts.draft.references ?? []).filter((reference) => usedReferenceIds.includes(reference.id));
    const usedSourceIds = new Set(evidence.flatMap((record) => (record.supports ?? []).map((support) => support.sourceId)).filter(Boolean));
    const sources = (artifacts.draft.sources ?? []).filter((source) => (
      usedSourceIds.has(source.id ?? source.sourceId) ||
      usedReferenceIds.includes(source.referenceId) ||
      (source.referenceIds ?? []).some((referenceId) => usedReferenceIds.includes(referenceId))
    ));
    const article = {
      slug: trackerRow.slug,
      title: artifacts.draft.article?.title ?? artifacts.task?.article?.title ?? titleFromSlug(trackerRow.slug),
    };
    const row = {
      id: `row-${index + 1}`,
      tracker: trackerRow,
      article,
      sectionData: sectionData.value,
      sectionDataSource: sectionData.source,
      markerCount: markerCount(sectionData.value),
      currentRow,
      evidence,
      gaps: scopedGaps,
      unscopedRunGaps,
      usedReferenceIds,
      references,
      allRunReferences: artifacts.draft.references ?? [],
      sources,
      run: compactRun(artifacts.draft, artifacts.manifest, sectionData.warning),
      citationReport: artifacts.citationReport,
    };
    row.searchText = JSON.stringify(row).toLowerCase();
    return row;
  });

  const context = contextTrackerRows.map((trackerRow) => {
    let title = titleFromSlug(trackerRow.slug);
    if (trackerRow.runId) {
      const task = safeReadJson(resolve(workbench, "runs", trackerRow.runId, "citation-task.json"));
      title = task?.article?.title ?? title;
    }
    return { tracker: trackerRow, title };
  });
  const actionableSlugs = new Set(rows.map((row) => row.tracker.slug));
  const eligibleSlugs = new Set((tracker.items ?? []).filter((row) => row.status !== "excluded").map((row) => row.slug));
  return {
    meta: {
      trackerUpdatedAt: tracker.updatedAt ?? null,
      campaignCompletedAt: campaignState?.completedAt ?? campaignState?.updatedAt ?? null,
      actionableRows: rows.length,
      needsReview: rows.filter((row) => row.tracker.status === "needs_review").length,
      needsSource: rows.filter((row) => row.tracker.status === "needs_source").length,
      excluded: context.filter((row) => row.tracker.status === "excluded").length,
      verified: context.filter((row) => row.tracker.status === "verified").length,
      eligibleSubstances: eligibleSlugs.size,
      actionableSubstances: actionableSlugs.size,
      localRuns: artifactCache.size,
    },
    rows,
    context,
  };
}

export function validateCitationReviewData(data) {
  const errors = [];
  if (data.rows.length !== data.meta.actionableRows) errors.push("meta.actionableRows does not match rows.length");
  if (data.rows.filter((row) => row.tracker.status === "needs_review").length !== data.meta.needsReview) errors.push("meta.needsReview is incorrect");
  if (data.rows.filter((row) => row.tracker.status === "needs_source").length !== data.meta.needsSource) errors.push("meta.needsSource is incorrect");
  const rowKeys = new Set();
  for (const row of data.rows) {
    const key = `${row.tracker.slug}:${row.tracker.section}`;
    if (rowKeys.has(key)) errors.push(`duplicate actionable row ${key}`);
    rowKeys.add(key);
    if (row.currentRow && row.markerCount !== row.currentRow.markerCount) {
      errors.push(`${key} current-row/count mismatch: ${row.currentRow.markerCount} vs ${row.markerCount}`);
    }
    if (row.currentRow && (
      row.tracker.status !== row.currentRow.status
      || row.tracker.markerCount !== row.currentRow.markerCount
      || row.tracker.runId !== row.currentRow.runId
    )) {
      errors.push(`${key} tracker does not match current campaign row`);
    }
    const allReferenceIds = new Set((row.allRunReferences ?? []).map((reference) => reference.id));
    for (const referenceId of markerReferenceIds(row.sectionData)) {
      if (!allReferenceIds.has(referenceId)) errors.push(`${key} marker references missing ${referenceId}`);
      const supported = row.evidence.some((record) => (
        record.status === "supported" &&
        record.referenceIds?.includes(referenceId) &&
        record.supports?.some((support) => support.referenceId === referenceId)
      ));
      if (!supported) errors.push(`${key} marker ${referenceId} has no scoped supported evidence`);
    }
    const sourceIds = new Set((row.sources ?? []).map((source) => source.id ?? source.sourceId));
    for (const evidence of row.evidence) {
      for (const support of evidence.supports ?? []) {
        if (!sourceIds.has(support.sourceId)) errors.push(`${key} omits inspected source ${support.sourceId}`);
      }
    }
  }
  if (errors.length > 0) throw new Error(`Citation review data validation failed: ${errors.join("; ")}`);
  return true;
}

export function renderCitationReviewDossier({ template, data }) {
  if (!template.includes(DATA_PLACEHOLDER)) throw new Error(`Dossier template is missing ${DATA_PLACEHOLDER}`);
  const serialized = JSON.stringify(data).replaceAll("<", "\\u003c");
  return template.replace(DATA_PLACEHOLDER, serialized);
}

function printHelp() {
  console.log(`Build a self-contained, offline citation review dossier from tracker-bound finalized runs.\n\n` +
    `Usage: npm run citations:review-dossier -- --output=outputs/citation-draft-review.html\n`);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return printHelp();
  const repo = resolve(options.repo ?? process.cwd());
  const workbench = resolve(options.workbench ?? process.env.DOSEWIKI_CITATION_WORKBENCH ?? "/Users/josie/.codex/dosewiki-citation-workbench");
  const trackerPath = resolve(options.tracker ?? resolve(workbench, "trackers/subsection-rollout.json"));
  const campaignPath = resolve(options.campaign ?? resolve(workbench, "campaigns/non-tolerance-subsection-rollout/campaign-final-state.json"));
  const templatePath = resolve(options.template ?? resolve(repo, "scripts/citations/citation-review-dossier.template.html"));
  const outputPath = resolve(options.output ?? resolve(repo, "outputs/citation-draft-review.html"));
  const runContext = createDataOpsRunContext({
    operation: "build citation review dossier",
    intent: "citation-review-local",
    argv,
    sourceUrlKeys: [],
    targetUrlKeys: [],
    localArtifacts: [trackerPath, campaignPath, templatePath, outputPath],
  });
  printDataOpsRunContext(runContext);
  const tracker = readJson(trackerPath);
  const campaignState = existsSync(campaignPath) ? readJson(campaignPath) : null;
  const data = buildCitationReviewData({ tracker, workbench, campaignState });
  validateCitationReviewData(data);
  const template = readFileSync(templatePath, "utf8");
  if (/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/i.test(template)) {
    throw new Error("Citation review dossier template must not load external scripts or stylesheets");
  }
  const html = renderCitationReviewDossier({ template, data });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, "utf8");
  console.log(JSON.stringify({
    output: outputPath,
    bytes: Buffer.byteLength(html),
    actionableRows: data.meta.actionableRows,
    needsReview: data.meta.needsReview,
    needsSource: data.meta.needsSource,
    excluded: data.meta.excluded,
    verified: data.meta.verified,
    localRuns: data.meta.localRuns,
    template: basename(templatePath),
  }, null, 2));
  return { outputPath, data };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
