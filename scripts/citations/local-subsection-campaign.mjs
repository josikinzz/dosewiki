#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getDataBackend, resolvePostgresSource } from "../lib/data-client.ts";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import {
  buildSecondPassCampaignTracker,
  secondPassScopeForSlug,
} from "./second-pass-research-lib.mjs";
import {
  reconcileSecondPassDerivedState,
  sha256File,
} from "./second-pass-derived-state.mjs";
import { SECOND_PASS_RESEARCH_INSTRUCTION } from "./citation-evidence-policy.mjs";

const TERMINAL_SECTION_STATUSES = new Set([
  "checked",
  "missing_preserve_original",
  "failed_preserve_original",
  "skipped_already_cited",
  "skipped_empty",
  "not_selected",
]);
const FINAL_GATES = ["article_wide_check", "assemble_draft", "validate", "validate_patches", "final_review_surface_scan"];
const FORBIDDEN_ARGUMENTS = /(?:^|:|-)apply|--write|confirm-citation-write|confirm-write/i;
const OMP_COORDINATOR_ARGS = [
  "--model", "openai-codex/gpt-5.6-terra",
  "--thinking", "high",
  "--approval-mode", "yolo",
  "--max-time", "1h",
  "-p",
];

function now() {
  return new Date().toISOString();
}

function sleepSeconds(seconds) {
  if (seconds <= 0) return;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, seconds * 1000);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const values = { slugs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const separator = entry.indexOf("=");
    const rawKey = entry.slice(2, separator < 0 ? undefined : separator);
    const inline = separator < 0 ? undefined : entry.slice(separator + 1);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (["allReady", "dryRun", "help", "allowRemote"].includes(key)) {
      values[key] = true;
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (!value || (!inline && value.startsWith("--"))) throw new Error(`Missing value for --${rawKey}`);
    if (!inline) index += 1;
    if (key === "slug") values.slugs.push(value);
    else values[key] = value;
  }
  return values;
}

export function assertLocalOnlyCampaignArguments(argv) {
  const forbidden = argv.filter((entry) => FORBIDDEN_ARGUMENTS.test(entry));
  if (forbidden.length > 0) {
    throw new Error("Local citation campaign rejects production/apply arguments.");
  }
}

export function localCampaignEnvironment(sourceUrl, inherited = process.env) {
  getDataBackend(inherited);
  const env = {
    ...inherited,
    SOURCE_POSTGRES_URL: sourceUrl,
    NODE_OPTIONS: `${inherited.NODE_OPTIONS ?? ""} --dns-result-order=ipv4first`.trim(),
  };
  delete env.TARGET_POSTGRES_URL;
  delete env.POSTGRES_POOLED_URL;
  delete env.POSTGRES_DIRECT_URL;
  return env;
}

export function inspectRunStage({ manifest = null, runFiles = {} } = {}) {
  if (!manifest) return { stage: "initialize", reason: "manifest_missing" };
  if (manifest.outcome === "needs_review" && manifest.finalizedAt) return { stage: "finalized", reason: "manifest_finalized" };
  const sections = Object.values(manifest.sections ?? {});
  if (sections.some((section) => !TERMINAL_SECTION_STATUSES.has(section?.status))) {
    return { stage: "sections", reason: "section_status_pending" };
  }
  const reconciliation = ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"];
  const firstReconciliationFailure = reconciliation.find((gate) => manifest.gates?.[gate]?.result !== "passed");
  if (firstReconciliationFailure) return { stage: "reconciliation", reason: firstReconciliationFailure };
  if (!runFiles.articleWide) return { stage: "article_wide", reason: "article_wide_missing" };
  const firstFinalFailure = FINAL_GATES.find((gate) => manifest.gates?.[gate]?.result !== "passed");
  if (firstFinalFailure === "article_wide_check") return { stage: "article_wide_repair", reason: firstFinalFailure };
  if (firstFinalFailure) return { stage: "downstream", reason: firstFinalFailure };
  return { stage: "finalize", reason: "all_gates_passed" };
}

export function buildStageAwareResumePrompt({ slug, runId, stage, researchPass = null }) {
  const common = [
    `Resume the OMP-coordinated citation workflow for ${slug} using existing run ${runId}. Follow docs/agents/pi-citation-run-contract.md and docs/agents/pi-citation-workflow.md.`,
    `Coordinate exactly this one slug and run (${slug}, ${runId}); do not select or continue to any other slug.`,
    "Act as the authenticated Oh My Pi coordinator. Use the named project agents citation-section-worker and citation-article-wide-worker directly; do not invoke /opt/homebrew/bin/pi or any standalone Pi subprocess.",
    "Execute synchronously; do not launch functions.workflow or an asynchronous/resumable wrapper.",
    "Treat pi-run-manifest.json as authoritative, preserve every accepted artifact whose recorded SHA-256 still matches, and never repeat completed research.",
    ...(researchPass === "second" ? [SECOND_PASS_RESEARCH_INSTRUCTION] : []),
    "Continue only until the manifest is finalized at needs_review or one deterministic blocker is recorded.",
    "Never apply a draft, call a production mutation, deploy, or write Postgres.",
  ];
  const stageInstruction = {
    initialize: "Initialize the manifest against the existing task before assigning workers.",
    sections: "Run only sections without terminal manifest statuses; do not replace checked section artifacts.",
    reconciliation: "Resume from the first stale or failed deterministic reconciliation gate; do not rerun section research.",
    article_wide: "All section work is terminal. Create only article-wide.json, then continue deterministic gates.",
    article_wide_repair: "Repair only article-wide.json, preserving accepted section artifacts byte-for-byte, then rerun downstream gates.",
    downstream: "Do not run workers unless a deterministic validator proves an owned artifact needs repair; resume from the first failed downstream gate.",
    finalize: "All deterministic gates passed. Verify current snapshots and finalize without modifying artifacts.",
  }[stage.stage] ?? "Resume from the first incomplete manifest stage.";
  return [...common, stageInstruction].join(" ");
}

export function buildOmpCoordinatorArgs(prompt) {
  return [...OMP_COORDINATOR_ARGS, prompt];
}

function runCommand(command, args, { cwd, env, logPath = null, check = true } = {}) {
  const options = { cwd, env, encoding: "utf8", stdin: "ignore", maxBuffer: 64 * 1024 * 1024 };
  const result = spawnSync(command, args, options);
  const transcript = [`$ ${[command, ...args].join(" ")}`, result.stdout ?? "", result.stderr ?? ""].join("\n");
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, `[${now()}]\n${transcript}\n`, { encoding: "utf8", flag: "a" });
  }
  if (check && result.status !== 0) throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
  return result;
}

function resolveSelectedRows(tracker, requestedSlugs, allReady) {
  const eligible = (tracker.items ?? []).filter((row) => (
    ["ready", "researching"].includes(row.status) && row.status !== "excluded"
  ));
  const allowed = new Set(requestedSlugs);
  const rows = allReady ? eligible : eligible.filter((row) => allowed.has(row.slug));
  const grouped = new Map();
  for (const row of rows) {
    const entries = grouped.get(row.slug) ?? [];
    entries.push(row);
    grouped.set(row.slug, entries);
  }
  return grouped;
}

export function chooseCampaignRunId({ workbench, slug, rows, preferredRunId = null }) {
  const researchingRunIds = [...new Set(
    rows.filter((row) => row.status === "researching" && row.runId).map((row) => row.runId),
  )];
  if (researchingRunIds.length > 1) {
    throw new Error(`${slug} has conflicting researching run IDs: ${researchingRunIds.join(", ")}`);
  }
  if (researchingRunIds.length === 1) return researchingRunIds[0];
  if (preferredRunId) return preferredRunId;

  const basePath = resolve(workbench, "runs", slug);
  if (!existsSync(basePath)) return slug;
  const manifestPath = resolve(basePath, "pi-run-manifest.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  if (manifest?.outcome !== "needs_review" || !manifest.finalizedAt) return slug;
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const candidate = `${slug}-local-${attempt}`;
    if (!existsSync(resolve(workbench, "runs", candidate))) return candidate;
  }
  throw new Error(`Unable to reserve a fresh local run ID for ${slug}`);
}

function manifestAndFiles(runPath) {
  const manifestPath = resolve(runPath, "pi-run-manifest.json");
  return {
    manifest: existsSync(manifestPath) ? readJson(manifestPath) : null,
    files: {
      articleWide: existsSync(resolve(runPath, "article-wide.json")),
      draft: existsSync(resolve(runPath, "citation-draft.json")),
      report: existsSync(resolve(runPath, "citation-report.md")),
    },
  };
}

function countMarkers(value) {
  return (JSON.stringify(value ?? null).match(/\[cite:[^\]]+\]/g) ?? []).length;
}

function trackerStatusCommand({ repo, trackerPath, slug, section, status, runId, reason }, options) {
  return runCommand(process.execPath, [
    "scripts/citations/update-subsection-rollout-status.mjs",
    `--tracker=${trackerPath}`,
    `--slug=${slug}`,
    `--section=${section}`,
    `--status=${status}`,
    `--run-id=${runId}`,
    `--reason=${reason}`,
  ], { ...options, cwd: repo });
}

function validateFinalizedRun({ repo, workbench, runId, slug, selectedSections, env, logPath }) {
  const runPath = resolve(workbench, "runs", runId);
  const { manifest, files } = manifestAndFiles(runPath);
  if (manifest?.outcome !== "needs_review" || !manifest.finalizedAt || !files.draft || !files.report) {
    throw new Error(`Run ${runId} is not deterministically finalized at needs_review`);
  }
  const draft = readJson(resolve(runPath, "citation-draft.json"));
  if (draft.article?.slug !== slug || JSON.stringify(draft.selectedSections) !== JSON.stringify(selectedSections)) {
    throw new Error(`Run ${runId} finalized with slug/scope drift`);
  }
  for (const script of ["validate", "validate:patches"]) {
    runCommand("npm", ["--prefix", workbench, "run", script, "--", "--run", `runs/${runId}`], { cwd: repo, env, logPath });
  }
  return draft;
}

function printHelp() {
  console.log(`Run a sequential, local-only subsection citation campaign.\n\n` +
    `Usage:\n` +
    `  DATA_BACKEND=postgres npm run citations:run-local-campaign -- --slug=<slug> --source-url=<postgres-url>\n` +
    `  DATA_BACKEND=postgres npm run citations:run-local-campaign -- --all-ready --source-url=<postgres-url>\n` +
    `  DATA_BACKEND=postgres npm run citations:run-local-campaign -- --all-ready --source-url=<postgres-url> \\\n    --tracker=<path> --run-suffix=<unique-suffix>\n\n` +
    `Remote sources also require --allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname>.\n` +
    `--run-suffix reserves fresh run IDs as <slug>-<unique-suffix>. ` +
    `The campaign invokes authenticated OMP as the coordinator and never imports or invokes the citation apply path. Existing partial runs are resumed stage-by-stage.\n`);
}

export function runLocalCampaign(argv = process.argv.slice(2)) {
  assertLocalOnlyCampaignArguments(argv);
  const options = parseArgs(argv);
  if (options.help) return printHelp();
  const sourceUrl = resolvePostgresSource({ argv }).url;
  if (!sourceUrl) throw new Error("--source-url or SOURCE_POSTGRES_URL must select a Postgres source");
  const env = localCampaignEnvironment(sourceUrl);
  if ((options.slugs.length === 0) === !options.allReady) throw new Error("Choose one or more --slug values or --all-ready");

  const repo = resolve(options.repo ?? process.cwd());
  const workbench = resolve(options.workbench ?? process.env.DOSEWIKI_CITATION_WORKBENCH ?? "/Users/josie/.codex/dosewiki-citation-workbench");
  const secondPassPlanPath = options.secondPassPlan ? resolve(repo, options.secondPassPlan) : null;
  const secondPassPlan = secondPassPlanPath ? readJson(secondPassPlanPath) : null;
  const secondPassMaxWave = Math.max(1, Math.min(3, Number(options.secondPassMaxWave ?? 3)));
  const trackerPath = options.tracker
    ? resolve(options.tracker)
    : resolve(workbench, secondPassPlan ? "trackers/second-pass-rollout.json" : "trackers/subsection-rollout.json");
  const statePath = options.state
    ? resolve(options.state)
    : resolve(workbench, secondPassPlan ? "campaigns/second-pass-campaign-state.json" : "campaigns/local-subsection-campaign-state.json");
  const logDir = options.logDir
    ? resolve(options.logDir)
    : resolve(workbench, secondPassPlan ? "campaigns/second-pass-logs" : "campaigns/local-subsection-logs");
  const omp = options.omp ?? "omp";
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 1));
  const preparationAttempts = Math.max(1, Number(options.preparationAttempts ?? 3));
  const preparationBackoffSeconds = Math.max(0, Number(options.preparationBackoffSeconds ?? 60));
  if (secondPassPlan && !existsSync(trackerPath)) {
    writeJson(trackerPath, buildSecondPassCampaignTracker(secondPassPlan));
  }
  const runContext = createDataOpsRunContext({
    operation: "run local citation campaign",
    intent: "citation-campaign-local",
    argv,
    env,
    sourceUrlKeys: ["SOURCE_POSTGRES_URL"],
    targetUrlKeys: [],
    localArtifacts: [trackerPath, statePath, logDir, ...(secondPassPlanPath ? [secondPassPlanPath] : [])],
    loadsEnvLocal: false,
  });
  printDataOpsRunContext(runContext);
  const tracker = readJson(trackerPath);
  if (secondPassPlan && tracker.researchPass !== "second") {
    throw new Error(`Second-pass campaign requires an independent researchPass=second tracker: ${trackerPath}`);
  }
  const grouped = resolveSelectedRows(tracker, options.slugs, options.allReady);
  if (grouped.size === 0) throw new Error("No ready/researching tracker rows matched the requested scope");
  let state = existsSync(statePath) ? readJson(statePath) : {
    schemaVersion: secondPassPlan ? "dosewiki_second_pass_campaign_v1" : "dosewiki_local_citation_campaign_v1",
    researchPass: secondPassPlan ? "second" : null,
    sourcePlan: secondPassPlanPath,
    productionWrites: false,
    runs: [],
  };

  for (const [slug, rows] of grouped) {
    const selectedSections = rows.map((row) => row.section);
    const secondPassScope = secondPassPlan
      ? secondPassScopeForSlug(secondPassPlan, slug, { maxWave: secondPassMaxWave })
      : null;
    if (secondPassScope && JSON.stringify(secondPassScope.selectedSections) !== JSON.stringify(selectedSections)) {
      throw new Error(`${slug} tracker scope differs from the immutable second-pass plan`);
    }
    const runId = chooseCampaignRunId({
      workbench,
      slug,
      rows,
      preferredRunId: options.runSuffix
        ? `${slug}-${options.runSuffix}`
        : secondPassScope?.researchBrief?.recommendedRunId ?? null,
    });
    const runPath = resolve(workbench, "runs", runId);
    const logPath = resolve(logDir, `${runId}.log`);
    const initial = manifestAndFiles(runPath);
    const stage = inspectRunStage({ manifest: initial.manifest, runFiles: initial.files });
    const entry = { slug, runId, selectedSections, startedAt: now(), initialStage: stage, productionWrites: false };

    if (options.dryRun) {
      entry.outcome = "planned";
      entry.prompt = buildStageAwareResumePrompt({ slug, runId, stage, researchPass: secondPassPlan ? "second" : null });
      state.runs.push(entry);
      continue;
    }

    try {
      if (!existsSync(resolve(runPath, "citation-task.json"))) {
        let prepared = false;
        let lastPreparationError = null;
        for (let attempt = 1; attempt <= preparationAttempts; attempt += 1) {
          try {
            const exportScopeArgs = secondPassPlanPath
              ? [`--second-pass-plan=${secondPassPlanPath}`, `--second-pass-max-wave=${secondPassMaxWave}`]
              : ["--tracker-scope", `--tracker=${trackerPath}`];
            runCommand("npm", ["run", "citations:export-workbench-task", "--", `--slug=${slug}`, ...exportScopeArgs, "--overwrite", ...(options.allowRemote ? ["--allow-remote"] : [])], { cwd: repo, env, logPath });
            const exportedTask = readJson(resolve(workbench, "inputs", `${slug}-full.json`));
            if (JSON.stringify(exportedTask.selectedSections) !== JSON.stringify(selectedSections)) {
              throw new Error(`${slug} exported selectedSections do not match the locked tracker scope`);
            }
            runCommand("npm", ["--prefix", workbench, "run", "fresh-run", "--", "--slug", slug, ...(runId !== slug ? ["--run-id", runId] : [])], { cwd: repo, env, logPath });
            prepared = true;
            break;
          } catch (error) {
            lastPreparationError = error;
            if (attempt < preparationAttempts) sleepSeconds(preparationBackoffSeconds);
          }
        }
        if (!prepared) throw lastPreparationError ?? new Error(`Unable to prepare ${slug}`);
      }
      const runTask = readJson(resolve(runPath, "citation-task.json"));
      if (JSON.stringify(runTask.selectedSections) !== JSON.stringify(selectedSections)) {
        throw new Error(`${runId} task selectedSections do not match the locked tracker scope`);
      }
      if (secondPassPlan && (
        runTask.researchPass !== "second" ||
        JSON.stringify(runTask.researchBrief?.candidates?.map((candidate) => candidate.section)) !== JSON.stringify(selectedSections)
      )) {
        throw new Error(`${runId} task is missing its immutable second-pass research brief`);
      }
      for (const row of rows.filter((row) => row.status === "ready")) {
        trackerStatusCommand({
          repo,
          trackerPath,
          slug,
          section: row.section,
          status: "researching",
          runId,
          reason: secondPassPlan
            ? "Local-only second-pass campaign started from immutable research brief"
            : "Local-only stage-aware citation campaign started",
        }, { env, logPath });
      }

      let finalized = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const current = manifestAndFiles(runPath);
        const currentStage = inspectRunStage({ manifest: current.manifest, runFiles: current.files });
        if (currentStage.stage === "finalized") {
          finalized = true;
          break;
        }
        const prompt = buildStageAwareResumePrompt({
          slug,
          runId,
          stage: currentStage,
          researchPass: secondPassPlan ? "second" : null,
        });
        runCommand(omp, buildOmpCoordinatorArgs(prompt), { cwd: repo, env, logPath, check: false });
        const after = manifestAndFiles(runPath);
        finalized = inspectRunStage({ manifest: after.manifest, runFiles: after.files }).stage === "finalized";
        if (finalized) break;
      }

      if (!finalized) throw new Error(`Run ${runId} stopped before deterministic finalization; partial artifacts were preserved`);
      const draft = validateFinalizedRun({ repo, workbench, runId, slug, selectedSections, env, logPath });
      const sectionStatuses = {};
      for (const section of selectedSections) {
        const markerCount = countMarkers(draft.markedSections?.[section]);
        const status = markerCount > 0 ? "needs_review" : "needs_source";
        sectionStatuses[section] = status;
        trackerStatusCommand({
          repo,
          trackerPath,
          slug,
          section,
          status,
          runId,
          reason: markerCount > 0
            ? `Validated local draft stored at runs/${runId}; ${markerCount} public marker(s); awaiting production approval`
            : secondPassPlan
              ? `All immutable second-pass research lanes completed without a defensible marker for ${section}; original preserved`
              : `Validated local run found no defensible marker for ${section}; original preserved`,
        }, { env, logPath });
      }
      Object.assign(entry, { outcome: "finalized_local", sectionStatuses, completedAt: now() });
    } catch (error) {
      Object.assign(entry, { outcome: "blocked_local", error: error instanceof Error ? error.message : String(error), completedAt: now() });
      // Keep blocked rows in researching so an incomplete process can never be
      // mistaken for a review-ready local result. A later invocation resumes
      // this exact run and immutable scope from the first incomplete stage.
    }
    state.runs.push(entry);
    if (secondPassPlan && entry.outcome === "finalized_local") {
      const refreshed = reconcileSecondPassDerivedState({
        plan: secondPassPlan,
        tracker: readJson(trackerPath),
        campaignState: state,
        workbench,
        immutablePlanSha256: sha256File(secondPassPlanPath),
      });
      writeJson(trackerPath, refreshed.tracker);
      state = refreshed.campaignState;
    }
    state.updatedAt = now();
    writeJson(statePath, state);
  }
  state.updatedAt = now();
  state.productionWrites = false;
  writeJson(statePath, state);
  console.log(JSON.stringify({ statePath, productionWrites: false, runs: state.runs.slice(-grouped.size) }, null, 2));
  return state;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runLocalCampaign();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
