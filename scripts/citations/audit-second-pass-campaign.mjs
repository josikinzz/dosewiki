#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SECOND_PASS_SCHEMA_VERSION } from "./second-pass-research-lib.mjs";
import {
  sha256,
  validateStoredCurrentRows,
} from "./second-pass-derived-state.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";

const FINAL_GATES = [
  "preflight",
  "remap",
  "section_rechecks",
  "proactive_scan",
  "article_wide_packet",
  "article_wide_sanitize",
  "article_wide_residue_scan",
  "article_wide_check",
  "assemble_draft",
  "validate",
  "validate_patches",
  "final_review_surface_scan",
];
const TERMINAL_ACTIONABLE = new Set(["needs_review", "needs_source"]);
const MARKER_PATTERN = /\[cite:[^\]]+\]/g;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function markerCount(value) {
  return (JSON.stringify(value ?? null).match(MARKER_PATTERN) ?? []).length;
}

function sectionForRecord(record) {
  for (const candidate of [record?.fieldPath, record?.markerPath, record?.field, record?.section, record?.sectionKey]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().split(/[.[]/, 1)[0];
  }
  return null;
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function expectedRows(plan) {
  return (plan.substances ?? []).flatMap((substance) => (
    (substance.sections ?? []).map((candidate) => ({
      slug: substance.slug,
      title: substance.title,
      recommendedRunId: substance.recommendedRunId,
      ...candidate,
    }))
  ));
}

export function auditSecondPassCampaign({ plan, tracker, workbench, campaignState = null, planSha256 = null }) {
  const errors = [];
  const immutablePlanSha256 = planSha256 ?? sha256(JSON.stringify(plan));
  const warnings = [];
  if (plan?.schemaVersion !== SECOND_PASS_SCHEMA_VERSION) errors.push(`plan schema must be ${SECOND_PASS_SCHEMA_VERSION}`);
  if (tracker?.researchPass !== "second") errors.push("tracker must declare researchPass=second");
  if (campaignState?.productionWrites !== false) errors.push("campaign state must explicitly record productionWrites=false");

  const expected = expectedRows(plan);
  const currentState = validateStoredCurrentRows({
    plan,
    tracker,
    campaignState,
    workbench,
    immutablePlanSha256,
  });
  errors.push(...currentState.errors);
  const currentByKey = new Map(currentState.expectedRows.map((row) => [row.key, row]));
  const expectedKeys = new Set(expected.map((row) => `${row.slug}:${row.section}`));
  const trackerRows = tracker?.items ?? [];
  const trackerByKey = new Map();
  for (const row of trackerRows) {
    const key = `${row.slug}:${row.section}`;
    if (trackerByKey.has(key)) errors.push(`duplicate tracker row ${key}`);
    trackerByKey.set(key, row);
    if (!expectedKeys.has(key)) errors.push(`unplanned tracker row ${key}`);
  }

  const actionableBySlug = new Map();
  let actionableRows = 0;
  let deferredRows = 0;
  let needsReview = 0;
  let needsSource = 0;
  for (const candidate of expected) {
    const key = `${candidate.slug}:${candidate.section}`;
    const row = trackerByKey.get(key);
    if (!row) {
      errors.push(`missing tracker row ${key}`);
      continue;
    }
    if (candidate.status === "deferred_sparse") {
      deferredRows += 1;
      if (row.status !== "excluded") errors.push(`${key} must remain excluded/deferred, found ${row.status}`);
      continue;
    }
    actionableRows += 1;
    if (!TERMINAL_ACTIONABLE.has(row.status)) errors.push(`${key} is incomplete with status ${row.status}`);
    if (row.status === "needs_review") needsReview += 1;
    if (row.status === "needs_source") needsSource += 1;
    const entries = actionableBySlug.get(candidate.slug) ?? [];
    entries.push({ candidate, tracker: row });
    actionableBySlug.set(candidate.slug, entries);
  }

  const runReports = [];
  for (const [slug, entries] of actionableBySlug) {
    const expectedSections = entries.map((entry) => entry.candidate.section);
    const runIds = [...new Set(entries.map((entry) => entry.tracker.runId).filter(Boolean))];
    const entriesByRun = new Map();
    let splitBinding = null;

    if (runIds.length === 1) {
      entriesByRun.set(runIds[0], entries);
    } else {
      splitBinding = tracker.currentPlanBindings?.[slug] ?? null;
      if (!splitBinding || splitBinding.type !== "documented_recovery_split") {
        errors.push(`${slug} must bind all planned sections to one run or provide a documented recovery split; found ${runIds.join(", ") || "none"}`);
        continue;
      }
      if (splitBinding.immutablePlanSha256 !== immutablePlanSha256) {
        errors.push(`${slug} recovery split does not bind the current immutable plan hash`);
      }
      const boundSections = Object.keys(splitBinding.sections ?? {});
      if (!sameMembers(boundSections, expectedSections)) {
        errors.push(`${slug} recovery split sections differ from the immutable plan`);
      }
      for (const entry of entries) {
        const bound = splitBinding.sections?.[entry.candidate.section];
        if (!bound || bound.runId !== entry.tracker.runId) {
          errors.push(`${slug}:${entry.candidate.section} has an ambiguous recovery-split run binding`);
          continue;
        }
        const grouped = entriesByRun.get(bound.runId) ?? [];
        grouped.push(entry);
        entriesByRun.set(bound.runId, grouped);
      }
      const reconciliationPath = splitBinding.reconciliationPath ? resolve(splitBinding.reconciliationPath) : null;
      if (!reconciliationPath || !existsSync(reconciliationPath)) {
        errors.push(`${slug} recovery split is missing its reconciliation record`);
      } else {
        const reconciliation = readJson(reconciliationPath);
        const recoveredSections = entries
          .filter((entry) => splitBinding.sections?.[entry.candidate.section]?.runId === splitBinding.recoveryRunId)
          .map((entry) => entry.candidate.section);
        if (
          reconciliation.slug !== slug ||
          reconciliation.runId !== splitBinding.recoveryRunId ||
          reconciliation.preservedPriorRun !== splitBinding.originalRunId ||
          !sameArray(reconciliation.selectedSections, recoveredSections) ||
          reconciliation.sectionContentMatchesFinalizedParent !== true ||
          reconciliation.noResearchPerformed !== true
        ) {
          errors.push(`${slug} recovery split reconciliation record is incomplete or inconsistent`);
        }
      }
    }

    for (const [runId, runEntries] of entriesByRun) {
      const expectedRunSections = runEntries.map((entry) => entry.candidate.section);
      const runPath = resolve(workbench, "runs", runId);
      const paths = {
        task: resolve(runPath, "citation-task.json"),
        manifest: resolve(runPath, "pi-run-manifest.json"),
        draft: resolve(runPath, "citation-draft.json"),
        report: resolve(runPath, "citation-report.md"),
      };
      for (const [name, path] of Object.entries(paths)) {
        if (!existsSync(path)) errors.push(`${slug} run ${runId} is missing ${name}: ${path}`);
      }
      if (!existsSync(paths.task) || !existsSync(paths.manifest) || !existsSync(paths.draft)) continue;
      const task = readJson(paths.task);
      const manifest = readJson(paths.manifest);
      const draft = readJson(paths.draft);
      if (task.researchPass !== "second" || task.researchBrief?.pass !== "second") errors.push(`${runId} is not a frozen second-pass task`);
      if (task.article?.slug !== slug || draft.article?.slug !== slug) errors.push(`${runId} has article slug drift`);
      if (!sameArray(task.selectedSections, expectedRunSections)) errors.push(`${runId} task scope differs from plan: ${JSON.stringify(task.selectedSections)} vs ${JSON.stringify(expectedRunSections)}`);
      if (!sameArray(draft.selectedSections, expectedRunSections)) errors.push(`${runId} draft scope differs from plan`);
      if (!sameArray(task.researchBrief?.candidates?.map((candidate) => candidate.section), expectedRunSections)) errors.push(`${runId} researchBrief scope differs from plan`);
      if (splitBinding) {
        for (const { candidate } of runEntries) {
          const section = candidate.section;
          const recorded = splitBinding.sections?.[section];
          const sectionHash = manifest.sections?.[section]?.artifactSha256;
          const articleWideHash = manifest.gates?.article_wide_check?.snapshot?.articleWide;
          const draftHash = manifest.gates?.assemble_draft?.snapshot?.draft;
          if (
            !recorded ||
            recorded.taskSha256 !== manifest.taskSha256 ||
            recorded.sectionArtifactSha256 !== sectionHash ||
            recorded.articleWideSha256 !== articleWideHash ||
            recorded.draftSha256 !== draftHash
          ) {
            errors.push(`${slug}:${section} recovery-split hash binding does not match its finalized manifest`);
          }
        }
      }
      if (manifest.outcome !== "needs_review" || !manifest.finalizedAt) errors.push(`${runId} is not finalized at needs_review`);
      for (const gate of FINAL_GATES) {
        if (manifest.gates?.[gate]?.result !== "passed") errors.push(`${runId} gate ${gate} is not passed`);
      }
      if (!Array.isArray(draft.researchLog) || draft.researchLog.length === 0) warnings.push(`${runId} has no run-level researchLog entries; inspect section artifacts before approval`);

      let markers = 0;
      for (const { candidate, tracker: row } of runEntries) {
        const section = candidate.section;
        const current = currentByKey.get(`${slug}:${section}`);
        const count = current?.markerCount ?? markerCount(draft.markedSections?.[section]);
        markers += count;
        if (!current) errors.push(`${slug}:${section} has no resolved current campaign row`);
        if (row.status === "needs_review" && count === 0) errors.push(`${slug}:${section} is needs_review but has no markers`);
        if (row.status === "needs_source" && count !== 0) errors.push(`${slug}:${section} is needs_source but has ${count} markers`);
        if (row.status === "needs_source") {
          const hasNegativeRecord = [...(draft.evidence ?? []), ...(draft.gaps ?? [])].some((record) => (
            sectionForRecord(record) === section && ["needs_source", "needs_review", "confirmed_needs_source"].includes(record.status ?? record.outcome)
          ));
          if (!hasNegativeRecord) warnings.push(`${slug}:${section} has no scoped negative evidence/gap record`);
        }
        const taskCandidate = task.researchBrief?.candidates?.find((entry) => entry.section === section);
        if (!taskCandidate || !Array.isArray(taskCandidate.researchLanes) || taskCandidate.researchLanes.length === 0) errors.push(`${runId} lacks frozen research lanes for ${section}`);
      }
      runReports.push({
        slug,
        runId,
        sections: expectedRunSections,
        markers,
        finalizedAt: manifest.finalizedAt ?? null,
        statuses: Object.fromEntries(runEntries.map((entry) => [entry.candidate.section, entry.tracker.status])),
        currentPlanBinding: splitBinding ? "documented_recovery_split" : "single_run",
      });
    }
  }

  const summary = {
    planRows: expected.length,
    actionableRows,
    resolvedCurrentRows: currentState.expectedRows.length,
    deferredRows,
    actionableSubstances: actionableBySlug.size,
    finalizedRuns: runReports.filter((run) => run.finalizedAt).length,
    needsReview,
    needsSource,
    ready: trackerRows.filter((row) => row.status === "ready").length,
    researching: trackerRows.filter((row) => row.status === "researching").length,
    productionWrites: campaignState?.productionWrites ?? null,
  };
  return {
    schemaVersion: "dosewiki_second_pass_campaign_audit_v1",
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    summary,
    errors,
    warnings,
    runs: runReports,
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const [key, inline] = entry.slice(2).split("=", 2);
    const value = inline ?? argv[index + 1];
    if (!value || (!inline && value.startsWith("--"))) throw new Error(`Missing value for --${key}`);
    if (!inline) index += 1;
    values[key] = value;
  }
  return values;
}

function markdownReport(report) {
  const lines = [
    "# Citation Second-Pass Campaign Final Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Result: **${report.ok ? "PASS" : "INCOMPLETE"}**`,
    "",
    "## Summary",
    "",
    `- ${report.summary.actionableRows} actionable subsection rows across ${report.summary.actionableSubstances} substances (${report.summary.resolvedCurrentRows} resolved current campaign links)`, 
    `- ${report.summary.finalizedRuns} finalized local runs`,
    `- ${report.summary.needsReview} rows with markers awaiting human review`,
    `- ${report.summary.needsSource} confirmed needs-source rows`,
    `- ${report.summary.deferredRows} deferred sparse rows`,
    `- ${report.summary.ready} ready and ${report.summary.researching} researching rows remain`,
    `- Production writes: ${report.summary.productionWrites}`,
    "",
    "## Errors",
    "",
    ...(report.errors.length ? report.errors.map((entry) => `- ${entry}`) : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(report.warnings.length ? report.warnings.map((entry) => `- ${entry}`) : ["- None."]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const workbench = resolve(options.workbench ?? process.env.DOSEWIKI_CITATION_WORKBENCH ?? "/Users/josie/.codex/dosewiki-citation-workbench");
  const planPath = resolve(options.plan ?? "outputs/citation-second-pass-research-plan.json");
  const trackerPath = resolve(options.tracker ?? resolve(workbench, "trackers/second-pass-rollout.json"));
  const statePath = resolve(options.state ?? resolve(workbench, "campaigns/second-pass-campaign-state.json"));
  const outputPath = resolve(options.output ?? "outputs/citation-second-pass-campaign-final-state.json");
  const markdownPath = resolve(options.markdown ?? "outputs/citation-second-pass-campaign-summary.md");
  const runContext = createDataOpsRunContext({
    operation: "audit local second-pass citation campaign",
    intent: "citation-second-pass-audit",
    argv,
    sourceUrlKeys: [],
    targetUrlKeys: [],
    localArtifacts: [planPath, trackerPath, statePath, outputPath, markdownPath],
  });
  printDataOpsRunContext(runContext);
  const report = auditSecondPassCampaign({
    plan: readJson(planPath),
    planSha256: sha256(readFileSync(planPath)),
    tracker: readJson(trackerPath),
    workbench,
    campaignState: existsSync(statePath) ? readJson(statePath) : null,
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, markdownReport(report), "utf8");
  console.log(JSON.stringify({ outputPath, markdownPath, ok: report.ok, summary: report.summary, errors: report.errors.length, warnings: report.warnings.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
