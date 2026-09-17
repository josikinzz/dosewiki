#!/usr/bin/env node
/* global console, process */
/**
 * Read-only campaign dashboard for Pi-native citation run artifacts.
 * It never launches workers, rewrites a run, applies a draft, or contacts Postgres.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SCHEMA_VERSION = "dosewiki_pi_citation_campaign_v1";
const CITABLE_SECTIONS = new Set([
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
]);
const STATES = new Set(["pending", "running", "needs_review", "blocked", "superseded"]);

function fail(message) {
  throw new Error(message);
}

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(`Usage:
  citation-campaign.mjs init --campaign <path> --target <slug>:<section[,section]> [--target ...] --model <provider/model> --tier <tier> [--workbench <path>] (default: $DOSEWIKI_CITATION_WORKBENCH, required)
  citation-campaign.mjs status --campaign <path> [--format text|json]

The campaign file locks its approved slug/section scope plus model+tier. Status only reads existing run manifests and drafts; it never launches, retries, publishes, or applies anything.`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) usage(`unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split("=", 2);
    if (!key) usage("empty flag name");
    const value = inline ?? rest[++index];
    if (!value || value.startsWith("--")) usage(`missing value for --${key}`);
    const entries = values.get(key) ?? [];
    entries.push(value);
    values.set(key, entries);
  }
  return { command, values };
}

function one(values, key, { required = false } = {}) {
  const entries = values.get(key) ?? [];
  if (entries.length > 1) usage(`--${key} may be supplied only once`);
  const value = entries[0]?.trim();
  if (required && !value) usage(`--${key} is required`);
  return value;
}

function all(values, key) {
  return (values.get(key) ?? []).map((value) => value.trim()).filter(Boolean);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Unable to read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseTarget(value) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) fail(`Target must be <slug>:<section[,section]>: ${value}`);
  const slug = value.slice(0, separator).trim();
  const sections = [...new Set(value.slice(separator + 1).split(",").map((section) => section.trim()))].sort();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) fail(`Invalid target slug: ${slug}`);
  if (sections.length === 0 || sections.some((section) => !CITABLE_SECTIONS.has(section))) {
    fail(`Target ${slug} contains a non-citable section`);
  }
  return { slug, sections };
}

function createCampaign(values) {
  const unknown = [...values.keys()].filter((key) => !["campaign", "target", "model", "tier", "workbench"].includes(key));
  if (unknown.length) usage(`unknown init flag(s): ${unknown.map((key) => `--${key}`).join(", ")}`);
  const campaignPath = resolve(one(values, "campaign", { required: true }));
  const targets = all(values, "target").map(parseTarget);
  if (targets.length === 0) usage("at least one --target is required");
  const duplicate = new Set();
  for (const target of targets) {
    if (duplicate.has(target.slug)) fail(`Target slug may appear only once: ${target.slug}`);
    duplicate.add(target.slug);
  }
  const model = one(values, "model", { required: true });
  const tier = one(values, "tier", { required: true });
  if (!model.includes("/")) fail("--model must be an explicit provider/model identifier");
  const requestedWorkbench = one(values, "workbench") ?? process.env.DOSEWIKI_CITATION_WORKBENCH;
  if (!requestedWorkbench) fail("Set DOSEWIKI_CITATION_WORKBENCH or pass --workbench <path>");
  const workbench = resolve(requestedWorkbench);
  if (existsSync(campaignPath)) fail(`Campaign already exists and is locked: ${campaignPath}`);
  if (!existsSync(resolve(workbench, "runs"))) fail(`Workbench runs directory does not exist: ${resolve(workbench, "runs")}`);

  const campaign = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    workbench,
    model: { id: model, tier },
    policy: { localOnly: true, noApply: true, noAutomaticLaunch: true },
    targets: [...targets].sort((left, right) => left.slug.localeCompare(right.slug)),
  };
  mkdirSync(dirname(campaignPath), { recursive: true });
  const fd = openSync(campaignPath, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
  } finally {
    closeSync(fd);
  }
  console.log(JSON.stringify(campaign, null, 2));
}

function loadCampaign(path) {
  const campaign = readJson(path, "campaign manifest");
  if (campaign?.schemaVersion !== SCHEMA_VERSION) fail(`Unsupported campaign schema in ${path}`);
  if (!campaign.model?.id || !campaign.model?.tier || !Array.isArray(campaign.targets) || !campaign.workbench) {
    fail(`Campaign manifest is incomplete: ${path}`);
  }
  const targets = campaign.targets.map((target) => parseTarget(`${target.slug}:${(target.sections ?? []).join(",")}`));
  if (new Set(targets.map((target) => target.slug)).size !== targets.length) fail("Campaign contains duplicate target slugs");
  return { ...campaign, targets: targets.sort((left, right) => left.slug.localeCompare(right.slug)) };
}

function manifestSections(manifest) {
  if (manifest.inputBinding?.kind === "local_section_proposal" && CITABLE_SECTIONS.has(manifest.inputBinding.section)) {
    return [manifest.inputBinding.section];
  }
  return Object.entries(manifest.sections ?? {})
    .filter(([, record]) => Number(record?.chars ?? 0) > 0)
    .map(([section]) => section)
    .filter((section) => CITABLE_SECTIONS.has(section))
    .sort();
}

function findRuns(workbench) {
  const root = resolve(workbench, "runs");
  if (!existsSync(root)) fail(`Workbench runs directory does not exist: ${root}`);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const runPath = resolve(root, entry.name);
      const manifestPath = resolve(runPath, "pi-run-manifest.json");
      if (!existsSync(manifestPath)) return null;
      try {
        const manifest = readJson(manifestPath, "Pi run manifest");
        if (manifest?.schemaVersion !== "dosewiki_pi_citation_run_v1" || !manifest.runId || !manifest.slug) return null;
        return { runPath, manifestPath, manifest, sections: manifestSections(manifest) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.manifest.runId).localeCompare(String(right.manifest.runId)));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function countMarkers(value) {
  return (JSON.stringify(value ?? "").match(/\[cite:[^\]]+\]/g) ?? []).length;
}

function emptyCoverage(sections, { trusted, invalid, reason }) {
  return {
    trusted,
    invalid,
    reason,
    markers: 0,
    gaps: 0,
    bySection: Object.fromEntries(sections.map((section) => [section, 0])),
  };
}

function finalizedDraftIntegrity(run) {
  const manifest = run.manifest;
  if (manifest.outcome !== "needs_review" || !manifest.finalizedAt) {
    return { trusted: false, invalid: false, reason: "attempt is not finalized" };
  }
  const finalGate = manifest.gates?.final_review_surface_scan;
  const expectedDigest = finalGate?.result === "passed" ? finalGate.snapshot?.draft : null;
  if (typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    return { trusted: false, invalid: true, reason: "finalized manifest lacks a valid final-review citation-draft hash" };
  }

  const path = resolve(run.runPath, "citation-draft.json");
  if (!existsSync(path)) {
    return { trusted: false, invalid: true, reason: "citation-draft.json is missing" };
  }
  if (sha256(path) !== expectedDigest) {
    return { trusted: false, invalid: true, reason: "citation-draft.json hash does not match the finalized manifest snapshot" };
  }
  try {
    return { trusted: true, invalid: false, reason: null, draft: readJson(path, "citation draft") };
  } catch {
    return { trusted: false, invalid: true, reason: "citation-draft.json is not valid JSON" };
  }
}

function draftCoverage(sections, integrity) {
  if (!integrity.trusted) return emptyCoverage(sections, integrity);
  const markedSections = integrity.draft.markedSections ?? {};
  const bySection = Object.fromEntries(sections.map((section) => [section, countMarkers(markedSections[section])]));
  return {
    trusted: true,
    invalid: false,
    reason: null,
    markers: Object.values(bySection).reduce((total, count) => total + count, 0),
    gaps: Array.isArray(integrity.draft.gaps) ? integrity.draft.gaps.length : 0,
    bySection,
  };
}

function attemptState(run, campaign, integrity) {
  const failures = Object.values(run.manifest.gates ?? {}).filter((gate) => gate?.result === "failed").map((gate) => gate.log ?? "failed gate");
  const failedSections = Object.entries(run.manifest.sections ?? {})
    .filter(([, section]) => section?.status === "failed_preserve_original")
    .map(([section]) => section);
  const modelMismatches = run.sections
    .filter((section) => run.manifest.sections?.[section]?.status === "checked")
    .filter((section) => run.manifest.sections?.[section]?.model !== campaign.model.id);
  if (failures.length || failedSections.length || modelMismatches.length) {
    return {
      state: "blocked",
      reason: [
        failures.length ? `failed gate: ${failures.join(", ")}` : null,
        failedSections.length ? `failed section: ${failedSections.join(", ")}` : null,
        modelMismatches.length ? `model pin mismatch/missing: ${modelMismatches.join(", ")}` : null,
      ].filter(Boolean).join("; "),
    };
  }
  if (run.manifest.outcome === "needs_review") {
    if (!integrity.trusted) return { state: "blocked", reason: `invalid citation draft: ${integrity.reason}` };
    return { state: "needs_review", reason: "finalized local draft awaits human review" };
  }
  return { state: "running", reason: "prepared or incomplete local attempt" };
}

function guidance(state, runId) {
  if (state === "pending") return "No approved attempt found. Prepare or start one manually; this CLI never launches workers.";
  if (state === "running") return `Resume run ${runId} from ${runId}/pi-run-manifest.json using docs/workflows/citations.md#failure-handling and its coordinator sequence. Preserve accepted hash-matching artifacts; resume only the first incomplete manifest stage, not completed research.`;
  if (state === "needs_review") return `Review ${runId}/citation-draft.json and report. Keep local-only; no apply or publication action is available here.`;
  if (state === "blocked") return `Inspect deterministic gate logs for ${runId}. Create a linked corrective rerun with pi-run-manifest.mjs rerun; do not mutate the attempt.`;
  return `Use the latest linked successor instead of ${runId}; the superseded attempt remains immutable evidence.`;
}

function buildReport(campaign) {
  const runs = findRuns(campaign.workbench);
  const successorIds = new Set(runs.map((run) => run.manifest.supersession?.supersedesRunId).filter(Boolean));
  const targets = campaign.targets.flatMap((target) => target.sections.map((section) => {
    const attempts = runs
      .filter((run) => run.manifest.slug === target.slug && run.sections.includes(section))
      .map((run) => {
        const integrity = finalizedDraftIntegrity(run);
        const base = attemptState(run, campaign, integrity);
        const state = successorIds.has(run.manifest.runId) ? "superseded" : base.state;
        return {
          runId: run.manifest.runId,
          state,
          reason: state === "superseded" ? "linked corrective successor exists" : base.reason,
          manifest: run.manifestPath,
          coverage: draftCoverage([section], integrity),
        };
      })
      .sort((left, right) => left.runId.localeCompare(right.runId));
    const current = [...attempts].reverse().find((attempt) => attempt.state !== "superseded");
    const state = current?.state ?? "pending";
    return {
      slug: target.slug,
      section,
      state,
      currentRunId: current?.runId ?? null,
      attempts,
      guidance: guidance(state, current?.runId ?? `${target.slug}:${section}`),
    };
  }));

  const stateCounts = Object.fromEntries([...STATES].sort().map((state) => [state, targets.filter((target) => target.state === state).length]));
  const markers = targets.reduce((total, target) => {
    const coverage = target.attempts.find((attempt) => attempt.runId === target.currentRunId)?.coverage;
    return total + (coverage?.trusted ? coverage.markers : 0);
  }, 0);
  const gaps = targets.reduce((total, target) => {
    const coverage = target.attempts.find((attempt) => attempt.runId === target.currentRunId)?.coverage;
    return total + (coverage?.trusted ? coverage.gaps : 0);
  }, 0);
  return {
    schemaVersion: "dosewiki_pi_citation_campaign_report_v1",
    campaign: {
      model: campaign.model,
      workbench: campaign.workbench,
      policy: campaign.policy,
      targets: campaign.targets,
    },
    stateCounts,
    coverage: {
      approvedSections: targets.length,
      needsReview: stateCounts.needs_review,
      markers,
      gaps,
      sectionsWithoutMarkers: targets.filter((target) => target.state === "needs_review" && (target.attempts.find((attempt) => attempt.runId === target.currentRunId)?.coverage.markers ?? 0) === 0).map((target) => `${target.slug}:${target.section}`),
    },
    limitations: [
      "The campaign locks the requested model and tier. Existing Pi run manifests record resolved worker models but not the requested tier, so tier fidelity is operator-attested rather than derivable.",
      "Coverage and gaps count only drafts whose bytes match the finalized manifest's final-review snapshot; missing or mismatched drafts are blocked and contribute zero.",
      "This report is deterministic over local run manifests and drafts at read time; it does not inspect live Postgres data or publish anything.",
    ],
    targets,
  };
}

function renderText(report) {
  const lines = [
    `Citation campaign · ${report.campaign.model.id} (${report.campaign.model.tier})`,
    `Scope: ${report.coverage.approvedSections} approved section(s) · ${report.coverage.markers} marker(s) · ${report.coverage.gaps} gap(s)`,
    `States: ${Object.entries(report.stateCounts).map(([state, count]) => `${state}=${count}`).join(" · ")}`,
    "",
  ];
  for (const target of report.targets) {
    lines.push(`${target.state.padEnd(12)} ${target.slug}:${target.section}${target.currentRunId ? ` · ${target.currentRunId}` : ""}`);
    lines.push(`  ${target.guidance}`);
  }
  lines.push("", ...report.limitations.map((line) => `Limitation: ${line}`));
  return lines.join("\n");
}

function status(values) {
  const unknown = [...values.keys()].filter((key) => !["campaign", "format"].includes(key));
  if (unknown.length) usage(`unknown status flag(s): ${unknown.map((key) => `--${key}`).join(", ")}`);
  const campaignPath = resolve(one(values, "campaign", { required: true }));
  const format = one(values, "format") ?? "text";
  if (!["text", "json"].includes(format)) usage("--format must be text or json");
  const report = buildReport(loadCampaign(campaignPath));
  console.log(format === "json" ? JSON.stringify(report, null, 2) : renderText(report));
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === "init") createCampaign(values);
  else if (command === "status") status(values);
  else usage(command ? `unknown command: ${command}` : undefined);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
