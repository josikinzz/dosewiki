#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  CITABLE_SECTIONS,
  CORRECTIVE_RERUN_SCHEMA,
  GATES,
  RECONCILIATION_GATES,
  SECTION_STATUSES,
  normalizeTaskSelectedSections,
  skipStatusForReason,
} from "./pi-run-schema.mjs";
import {
  allSectionsTerminal,
  appendEvent,
  assertManifestMutable,
  equalJson,
  manifestPath,
  now,
  pathForManifest,
  readJson,
  readManifest,
  resolveWorkbench,
  runPathRelativeToWorkbench,
  sha256,
  taskPath,
  textLength,
  writeJsonAtomically,
} from "./pi-run-files.mjs";
import { assertAllFinalReviewSurfacesClean, hardenGateResult, residueScan } from "./pi-run-discovery-residue.mjs";
import { assertLocalProposalTask, assertManifestTaskIdentity, correctiveRerunLink } from "./pi-run-task-binding.mjs";
import {
  assertOnlyCheckedSectionArtifacts,
  commandForGate,
  gateIsFresh,
  invoke,
  minimumStaleReconciliationGate,
  requirePassedPrerequisites,
  runSectionCheck,
  snapshot,
  snapshotsMatch,
  writeGateLog,
} from "./pi-run-gates.mjs";
import { copyProposalInputsForRerun, reserveCorrectiveRerunDirectory, reuseAcceptedSections } from "./pi-run-rerun.mjs";

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(`Usage:
  pi-run-manifest.mjs init --run <workbench/runs/slug> [--slug <slug>]
  pi-run-manifest.mjs check-section --run <run> [--workbench <path>] --section <key> [--worker-id <id>] [--model <model>] [--artifact <path>]
  pi-run-manifest.mjs section --run <run> --section <key> --status <missing_preserve_original|failed_preserve_original> [--artifact <path>]
  pi-run-manifest.mjs run-gate --run <run> [--workbench <path>] --gate <gate>
  pi-run-manifest.mjs run-sequence --run <run> [--workbench <path>] [--from <gate> | --only <gate>]
  pi-run-manifest.mjs finalize --run <run>
  pi-run-manifest.mjs rerun --run <finalized-run> [--workbench <path>] --reason <corrective-reason> [--reuse-sections]
  pi-run-manifest.mjs show --run <run>`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) usage(`unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split("=", 2);
    if (!key) usage("empty flag name");
    if (inline !== undefined) {
      values[key] = inline;
      continue;
    }
    if (key === "reuse-sections") {
      values[key] = "true";
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return { command, values };
}

function requireValue(values, key) {
  const value = values[key];
  if (!value || !String(value).trim()) usage(`--${key} is required`);
  return String(value).trim();
}

function commandInit(values) {
  const runPath = resolve(requireValue(values, "run"));
  const packetPath = taskPath(runPath);
  if (!existsSync(packetPath)) throw new Error(`Citation task packet does not exist: ${packetPath}`);
  const task = readJson(packetPath);
  const runId = task.taskId;
  const actualSlug = task.article?.slug;
  const requestedSlug = values.slug?.trim();
  if (!runId || typeof runId !== "string") throw new Error("citation-task.json does not contain taskId");
  if (!actualSlug || typeof actualSlug !== "string") throw new Error("citation-task.json does not contain article.slug");
  if (requestedSlug && requestedSlug !== actualSlug) throw new Error(`Explicit slug ${requestedSlug} does not match task slug ${actualSlug}`);
  if (basename(runPath) !== runId) throw new Error(`Run directory name ${basename(runPath)} does not match taskId ${runId}`);
  if (existsSync(manifestPath(runPath))) throw new Error(`Pi run manifest already exists: ${manifestPath(runPath)}. Use show/check-section/section/run-gate/finalize instead.`);
  const localBinding = assertLocalProposalTask(task, runPath);
  const supersession = correctiveRerunLink(task, runPath);

  const citableSections = task.article?.citableSections;
  if (!citableSections || typeof citableSections !== "object" || Array.isArray(citableSections)) throw new Error("citation-task.json is missing article.citableSections");
  const sectionStats = Object.fromEntries(CITABLE_SECTIONS.map((section) => [section, { chars: textLength(citableSections[section]), status: null }]));
  const nonEmptySections = CITABLE_SECTIONS.filter((section) => sectionStats[section].chars > 0);
  if (nonEmptySections.length === 0) throw new Error("The citable surface is empty. Re-export/fresh-run the task before initializing Pi orchestration.");

  const selectedSections = normalizeTaskSelectedSections(task);
  if (selectedSections) {
    const scopeSections = task.sectionScope?.sections ?? {};
    for (const section of selectedSections) {
      if (sectionStats[section].chars === 0) {
        throw new Error(`Selected section ${section} is empty in the task citable surface; re-export the task or narrow selectedSections`);
      }
    }
    for (const section of CITABLE_SECTIONS) {
      if (selectedSections.includes(section)) continue;
      const skipReason = scopeSections[section]?.skipReason ?? (sectionStats[section].chars === 0 ? "empty" : "not_selected");
      sectionStats[section] = {
        ...sectionStats[section],
        status: skipStatusForReason(skipReason),
        skipReason,
        recordedAt: now(),
      };
    }
  }

  const manifest = {
    schemaVersion: "dosewiki_pi_citation_run_v1",
    runId,
    slug: actualSlug,
    taskPath: "citation-task.json",
    taskSha256: sha256(packetPath),
    taskProvenance: task.provenance ?? null,
    inputBinding: localBinding,
    supersession,
    promotionAllowed: task.promotion?.allowed !== false,
    allowLiveWebResearch: task.allowLiveWebResearch === true,
    createdAt: now(),
    updatedAt: now(),
    outcome: "prepared",
    nonEmptySections,
    selectedSections,
    sections: sectionStats,
    gates: {},
    events: [
      { at: now(), type: "initialized", runId, slug: actualSlug, nonEmptySections, selectedSections, allowLiveWebResearch: task.allowLiveWebResearch === true, promotionAllowed: task.promotion?.allowed !== false },
      ...(supersession ? [{ at: now(), type: "corrective_rerun_prepared", ...supersession }] : []),
    ],
  };
  writeJsonAtomically(manifestPath(runPath), manifest);
  if (!values.quiet) console.log(JSON.stringify(manifest, null, 2));
}

function commandCheckSection(values) {
  const runPath = resolve(requireValue(values, "run"));
  const section = requireValue(values, "section");
  if (!CITABLE_SECTIONS.includes(section)) throw new Error(`Unknown citable section: ${section}`);
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  const preflight = manifest.gates?.preflight;
  if (preflight?.result !== "passed" || !snapshotsMatch(preflight.snapshot, snapshot(runPath, "preflight"))) {
    throw new Error("Cannot check a section until the current task passes preflight");
  }
  if (manifest.sections[section].chars === 0) throw new Error(`${section} is empty; record missing_preserve_original instead of checking an output`);
  if (manifest.selectedSections && !manifest.selectedSections.includes(section)) {
    throw new Error(`${section} is not in this run's selectedSections; a worker must not return output for a non-selected section`);
  }
  const workbench = resolveWorkbench(runPath, values.workbench);
  const artifact = pathForManifest(runPath, values.artifact?.trim() || `sections/${section}.json`);
  if (!artifact || !existsSync(resolve(runPath, artifact))) throw new Error(`Section artifact does not exist: ${artifact ?? `sections/${section}.json`}`);
  const result = runSectionCheck({ workbench, runPath, section });
  const log = writeGateLog(runPath, `section-${section}-check`, result);
  if (result.exitCode !== 0) {
    appendEvent(manifest, { type: "section_check_failed", section, artifact, log });
    writeJsonAtomically(path, manifest);
    process.stderr.write(`${result.stderr || result.stdout}\n`);
    throw new Error(`Section checker failed for ${section}; archive it as failed_preserve_original before continuing`);
  }
  const workerId = values["worker-id"]?.trim() || null;
  const model = values.model?.trim() || null;
  manifest.sections[section] = { ...manifest.sections[section], status: "checked", workerId, model, artifact, artifactSha256: sha256(resolve(runPath, artifact)), checkLog: log, recordedAt: now() };
  appendEvent(manifest, { type: "section_checked", section, workerId, model, artifact, log });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify(manifest.sections[section], null, 2));
}

function commandSection(values) {
  const runPath = resolve(requireValue(values, "run"));
  const section = requireValue(values, "section");
  const status = requireValue(values, "status");
  if (!CITABLE_SECTIONS.includes(section)) throw new Error(`Unknown citable section: ${section}`);
  if (!["missing_preserve_original", "failed_preserve_original"].includes(status)) throw new Error("Use check-section for checked output; section supports only missing_preserve_original or failed_preserve_original");
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  const requestedArtifact = pathForManifest(runPath, values.artifact?.trim());
  if (status === "missing_preserve_original" && requestedArtifact) throw new Error("A missing section must not have an artifact");
  let artifact = null;
  if (requestedArtifact) {
    const source = resolve(runPath, requestedArtifact);
    if (!existsSync(source)) throw new Error(`Recorded artifact does not exist inside this run: ${requestedArtifact}`);
    const archiveDir = resolve(runPath, "failed-sections");
    mkdirSync(archiveDir, { recursive: true });
    const archive = resolve(archiveDir, `${section}-${Date.now()}.json`);
    renameSync(source, archive);
    artifact = pathForManifest(runPath, archive);
  }
  manifest.sections[section] = { ...manifest.sections[section], status, artifact, artifactSha256: artifact ? sha256(resolve(runPath, artifact)) : null, recordedAt: now() };
  appendEvent(manifest, { type: "section_preserved", section, status, artifact });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify(manifest.sections[section], null, 2));
}

function commandRunGate(values) {
  const runPath = resolve(requireValue(values, "run"));
  const gate = requireValue(values, "gate");
  if (!GATES.includes(gate)) throw new Error(`Unknown deterministic gate: ${gate}`);
  const { path, manifest } = readManifest(runPath);
  assertManifestMutable(manifest);
  if (gate === "preflight") assertManifestTaskIdentity(manifest, runPath);
  requirePassedPrerequisites(manifest, runPath, gate);
  if (gate !== "preflight") assertManifestTaskIdentity(manifest, runPath);
  if (gate === "remap" || gate === "article_wide_packet") {
    assertOnlyCheckedSectionArtifacts(manifest, runPath);
  }
  const workbench = resolveWorkbench(runPath, values.workbench);

  let result;
  if (gate === "section_rechecks") {
    const checked = CITABLE_SECTIONS.filter((section) => manifest.sections?.[section]?.status === "checked");
    const results = checked.map((section) => ({ section, ...runSectionCheck({ workbench, runPath, section }) }));
    for (const entry of results) {
      if (entry.exitCode === 0) manifest.sections[entry.section] = { ...manifest.sections[entry.section], artifactSha256: sha256(resolve(runPath, manifest.sections[entry.section].artifact)), recheckedAt: now() };
    }
    result = {
      command: ["section-rechecks", ...checked],
      cwd: workbench,
      exitCode: results.every((entry) => entry.exitCode === 0) ? 0 : 1,
      stdout: results.map((entry) => `# ${entry.section}\n${entry.stdout}`).join("\n"),
      stderr: results.map((entry) => `# ${entry.section}\n${entry.stderr}`).join("\n"),
      error: null,
    };
  } else if (gate === "article_wide_residue_scan") {
    result = residueScan(runPath);
  } else if (gate === "final_review_surface_scan") {
    result = {
      command: ["final-review-surface-scan", "article-wide.json", "citation-draft.json", "citation-report.md"],
      cwd: workbench,
      exitCode: 0,
      stdout: "Scanning final local review surfaces for forbidden discovery/wiki residue.\n",
      stderr: "",
      error: null,
    };
  } else if (gate === "article_wide_check") {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const run = runPathRelativeToWorkbench(workbench, runPath);
    const normalization = invoke({
      workbench,
      executable: npm,
      args: ["run", "normalize:discovery-provenance", "--", "--run", run],
    });
    const check = normalization.exitCode === 0
      ? invoke({
          workbench,
          executable: npm,
          args: ["run", "check:worker-output", "--", "--run", run, "--article-wide"],
        })
      : { command: [], cwd: workbench, exitCode: 1, stdout: "", stderr: "Article-wide check skipped because provenance normalization failed.", error: null };
    result = {
      command: ["article-wide-normalize-and-check", ...normalization.command, "&&", ...check.command],
      cwd: workbench,
      exitCode: normalization.exitCode === 0 && check.exitCode === 0 ? 0 : 1,
      stdout: `# provenance normalization\n${normalization.stdout}\n# worker output check\n${check.stdout}`,
      stderr: `# provenance normalization\n${normalization.stderr}\n# worker output check\n${check.stderr}`,
      error: normalization.error ?? check.error,
    };
  } else {
    const command = commandForGate({ gate, workbench, runPath });
    if (!command) throw new Error(`No command configured for gate ${gate}`);
    result = invoke({ workbench, ...command });
  }

  result = hardenGateResult({ gate, runPath, result });
  const log = writeGateLog(runPath, gate, result);
  const record = { result: result.exitCode === 0 ? "passed" : "failed", command: result.command, cwd: result.cwd, log, snapshot: snapshot(runPath, gate), recordedAt: now() };
  manifest.gates[gate] = record;
  appendEvent(manifest, { type: "gate", gate, result: record.result, log });
  writeJsonAtomically(path, manifest);
  if (record.result !== "passed") {
    process.stderr.write(`${result.stderr || result.stdout}\n`);
    throw new Error(`Deterministic gate failed: ${gate}`);
  }
  if (!values.quiet) console.log(JSON.stringify(record, null, 2));
  return record;
}

function commandRunSequence(values) {
  const runPath = resolve(requireValue(values, "run"));
  const from = values.from?.trim();
  const only = values.only?.trim();
  if (from && only) throw new Error("run-sequence accepts either --from or --only, not both");
  for (const [flag, gate] of [["from", from], ["only", only]]) {
    if (gate && !RECONCILIATION_GATES.includes(gate)) {
      throw new Error(`--${flag} must name a reconciliation gate: ${RECONCILIATION_GATES.join(", ")}`);
    }
  }
  const selected = only
    ? [only]
    : RECONCILIATION_GATES.slice(from ? RECONCILIATION_GATES.indexOf(from) : 0);
  const workbench = resolveWorkbench(runPath, values.workbench);
  const { manifest: startingManifest } = readManifest(runPath);
  assertManifestMutable(startingManifest);
  assertManifestTaskIdentity(startingManifest, runPath);
  if (!allSectionsTerminal(startingManifest)) {
    throw new Error("run-sequence requires terminal statuses for all six citable sections");
  }
  assertOnlyCheckedSectionArtifacts(startingManifest, runPath);
  const report = [];

  for (const gate of selected) {
    const { manifest } = readManifest(runPath);
    assertManifestMutable(manifest);
    if (gateIsFresh(manifest, runPath, gate)) {
      report.push({ gate, result: "fresh, skipped" });
      continue;
    }
    try {
      commandRunGate({ run: runPath, workbench, gate, quiet: "true" });
      report.push({ gate, result: "passed" });
    } catch (error) {
      const { manifest: failedManifest } = readManifest(runPath);
      const rerunFrom = minimumStaleReconciliationGate(failedManifest, runPath, gate);
      const sequenceCommand = `pi-run-manifest.mjs run-sequence --run ${JSON.stringify(runPath)} --workbench ${JSON.stringify(workbench)} --from ${rerunFrom}`;
      const minimumSequence = gateIsFresh(failedManifest, runPath, "preflight")
        ? sequenceCommand
        : `pi-run-manifest.mjs run-gate --run ${JSON.stringify(runPath)} --workbench ${JSON.stringify(workbench)} --gate preflight && ${sequenceCommand}`;
      throw new Error(`run-sequence stopped at ${gate}: ${error instanceof Error ? error.message : String(error)}. Minimum safe sequence after repair: ${minimumSequence}`);
    }
  }

  console.log(JSON.stringify({ outcome: "reconciliation_sequence_complete", runPath, gates: report }, null, 2));
}

function commandFinalize(values) {
  const runPath = resolve(requireValue(values, "run"));
  const { path, manifest } = readManifest(runPath);
  if (manifest.outcome === "needs_review" || manifest.finalizedAt) throw new Error("Manifest is already finalized as needs_review");
  const unfinished = CITABLE_SECTIONS.filter((section) => !SECTION_STATUSES.has(manifest.sections?.[section]?.status));
  if (unfinished.length > 0) throw new Error(`All six citable sections need a terminal status before finalization: ${unfinished.join(", ")}`);
  const incomplete = GATES.filter((gate) => manifest.gates?.[gate]?.result !== "passed");
  if (incomplete.length > 0) throw new Error(`Cannot finalize until deterministic gates pass: ${incomplete.join(", ")}`);
  const validationGate = manifest.gates.validate_patches;
  if (!snapshotsMatch(validationGate.snapshot, snapshot(runPath, "validate_patches"))) {
    throw new Error("Run artifacts changed after validate_patches; rerun the affected gate sequence before finalization");
  }
  const finalGate = manifest.gates.final_review_surface_scan;
  if (!snapshotsMatch(finalGate.snapshot, snapshot(runPath, "final_review_surface_scan"))) {
    throw new Error("Final review surfaces changed after their residue scan; rerun final_review_surface_scan before finalization");
  }
  assertAllFinalReviewSurfacesClean(runPath);
  const draft = resolve(runPath, "citation-draft.json");
  if (!existsSync(draft) || statSync(draft).size === 0) throw new Error(`A nonempty citation draft is required before finalization: ${draft}`);
  const task = readJson(taskPath(runPath));
  const localBinding = assertLocalProposalTask(task, runPath);
  if (localBinding || manifest.selectedSections) {
    const draftValue = readJson(draft);
    if (localBinding) {
      if (!equalJson(manifest.inputBinding, localBinding) || !equalJson(draftValue.inputBinding, localBinding)) {
        throw new Error("Local proposal task, manifest, and draft bindings must match at finalization");
      }
      if (!equalJson(draftValue.provenance, task.provenance) || !equalJson(draftValue.promotion, task.promotion)) {
        throw new Error("Local proposal draft provenance/promotion does not match the task");
      }
      manifest.promotionAllowed = false;
    }
    if (manifest.selectedSections && !equalJson(draftValue.selectedSections ?? null, manifest.selectedSections)) {
      throw new Error("Scoped citation draft selectedSections do not match the initialized manifest");
    }
  }
  manifest.outcome = "needs_review";
  manifest.finalizedAt = now();
  appendEvent(manifest, { type: "finalized", outcome: "needs_review", draft: "citation-draft.json", promotionAllowed: manifest.promotionAllowed });
  writeJsonAtomically(path, manifest);
  console.log(JSON.stringify({ outcome: manifest.outcome, manifest: path, draft }, null, 2));
}

function commandRerun(values) {
  const parentRunPath = resolve(requireValue(values, "run"));
  const reason = requireValue(values, "reason");
  const workbench = resolveWorkbench(parentRunPath, values.workbench);
  const { manifest: parentManifest } = readManifest(parentRunPath);
  if (parentManifest.outcome !== "needs_review" || !parentManifest.finalizedAt) {
    throw new Error("Only a finalized needs_review run may be corrected; do not mutate an existing run");
  }
  assertManifestTaskIdentity(parentManifest, parentRunPath);
  const parentTask = readJson(taskPath(parentRunPath));
  const { runId, runPath } = reserveCorrectiveRerunDirectory(workbench, basename(parentRunPath));
  const correctiveRerun = {
    schemaVersion: CORRECTIVE_RERUN_SCHEMA,
    parentRunId: basename(parentRunPath),
    parentFinalizedAt: parentManifest.finalizedAt,
    parentTaskSha256: sha256(taskPath(parentRunPath)),
    parentManifestSha256: sha256(manifestPath(parentRunPath)),
    reason,
    createdAt: now(),
  };
  const task = structuredClone(parentTask);
  task.taskId = runId;
  task.correctiveRerun = correctiveRerun;
  let sectionReuse = { reused: [], notReused: [] };
  try {
    copyProposalInputsForRerun(parentRunPath, runPath);
    writeFileSync(taskPath(runPath), `${JSON.stringify(task, null, 2)}\n`, { encoding: "utf8", mode: 0o444 });
    chmodSync(taskPath(runPath), 0o444);
    commandInit({ run: runPath, slug: parentManifest.slug, quiet: "true" });
    if (values["reuse-sections"] === "true") {
      sectionReuse = reuseAcceptedSections(parentRunPath, runPath, parentManifest);
    }
  } catch (error) {
    rmSync(runPath, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({
    outcome: "prepared_corrective_rerun",
    runId,
    runPath,
    supersedesRunId: correctiveRerun.parentRunId,
    reason,
    reusedSections: sectionReuse.reused,
    sectionsNotReused: sectionReuse.notReused,
  }, null, 2));
}

function commandShow(values) {
  const runPath = resolve(requireValue(values, "run"));
  const { manifest } = readManifest(runPath);
  console.log(JSON.stringify(manifest, null, 2));
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (!command) usage();
  if (command === "init") commandInit(values);
  else if (command === "check-section") commandCheckSection(values);
  else if (command === "section") commandSection(values);
  else if (command === "run-gate") commandRunGate(values);
  else if (command === "run-sequence") commandRunSequence(values);
  else if (command === "finalize") commandFinalize(values);
  else if (command === "rerun") commandRerun(values);
  else if (command === "show") commandShow(values);
  else usage(`unknown command: ${command}`);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
