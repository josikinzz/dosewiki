/**
 * Deterministic gate snapshots, freshness, prerequisites, logs, and workbench
 * command invocation for the Pi run manifest controller.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CITABLE_SECTIONS, GATE_PREREQUISITES, GATE_SCOPES, RECONCILIATION_GATES } from "./pi-run-schema.mjs";
import {
  allSectionsTerminal,
  fileDigest,
  pathForManifest,
  proposalInputDigests,
  runPathRelativeToWorkbench,
  sectionDigests,
  taskPath,
} from "./pi-run-files.mjs";

export function snapshot(runPath, gate) {
  const scope = GATE_SCOPES[gate];
  if (!scope) throw new Error(`No snapshot scope configured for gate ${gate}`);
  const value = { proposalInput: proposalInputDigests(runPath) };
  if (scope.includes("task")) value.task = fileDigest(taskPath(runPath));
  if (scope.includes("sections")) value.sections = sectionDigests(runPath);
  if (scope.includes("articleWideInput")) value.articleWideInput = fileDigest(resolve(runPath, "article-wide-input.json"));
  if (scope.includes("articleWide")) value.articleWide = fileDigest(resolve(runPath, "article-wide.json"));
  if (scope.includes("draft")) value.draft = fileDigest(resolve(runPath, "citation-draft.json"));
  if (scope.includes("report")) value.report = fileDigest(resolve(runPath, "citation-report.md"));
  return value;
}

export function snapshotsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function gateIsFresh(manifest, runPath, gate) {
  const record = manifest.gates?.[gate];
  if (record?.result !== "passed") return false;
  try {
    if (!snapshotsMatch(record.snapshot, snapshot(runPath, gate))) return false;
  } catch {
    return false;
  }
  if ((GATE_PREREQUISITES[gate] ?? []).includes("all_sections_terminal") && !allSectionsTerminal(manifest)) return false;
  return true;
}

export function minimumStaleReconciliationGate(manifest, runPath, fallback) {
  return RECONCILIATION_GATES.find((gate) => !gateIsFresh(manifest, runPath, gate)) ?? fallback;
}

export function requirePassedPrerequisites(manifest, runPath, gate) {
  for (const prerequisite of GATE_PREREQUISITES[gate] ?? []) {
    if (prerequisite === "all_sections_terminal") {
      if (!allSectionsTerminal(manifest)) throw new Error(`Cannot run ${gate} until all six citable sections have terminal statuses`);
      continue;
    }
    const record = manifest.gates?.[prerequisite];
    if (record?.result !== "passed") throw new Error(`Cannot run ${gate} until ${prerequisite} has passed`);
    if (!snapshotsMatch(record.snapshot, snapshot(runPath, prerequisite))) {
      throw new Error(`Cannot run ${gate}: run artifacts changed after ${prerequisite}; rerun the affected gate sequence`);
    }
  }
}

export function assertOnlyCheckedSectionArtifacts(manifest, runPath) {
  const expected = new Set(
    CITABLE_SECTIONS
      .filter((section) => manifest.sections?.[section]?.status === "checked")
      .map((section) => manifest.sections[section].artifact),
  );
  const actual = new Set(Object.keys(sectionDigests(runPath)));
  const unexpected = [...actual].filter((path) => !expected.has(path));
  if (unexpected.length > 0) {
    throw new Error(`Unaccepted section artifacts remain in sections/: ${unexpected.join(", ")}. Archive failed candidates before reconciliation.`);
  }
}

function gateLogPath(runPath, name) {
  const directory = resolve(runPath, "pi-gates");
  mkdirSync(directory, { recursive: true });
  return resolve(directory, `${name}.log`);
}

export function writeGateLog(runPath, name, record) {
  const path = gateLogPath(runPath, name);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return pathForManifest(runPath, path);
}

export function invoke({ workbench, executable, args }) {
  const result = spawnSync(executable, args, { cwd: workbench, encoding: "utf8" });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    command: [executable, ...args],
    cwd: workbench,
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

export function commandForGate({ gate, workbench, runPath }) {
  const run = runPathRelativeToWorkbench(workbench, runPath);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (gate === "preflight") return { executable: npm, args: ["run", "preflight", "--", "--run", run] };
  if (gate === "remap") return { executable: process.execPath, args: ["scripts/remap-section-reference-ids.mjs", "--run", run, "--write"] };
  if (gate === "proactive_scan") return { executable: process.execPath, args: ["scripts/proactive-scan.mjs", "--run", run] };
  if (gate === "article_wide_packet") return { executable: npm, args: ["run", "article-wide:packet", "--", "--run", run] };
  if (gate === "article_wide_sanitize") return { executable: npm, args: ["run", "article-wide:sanitize", "--", "--run", run] };
  if (gate === "article_wide_check") return { executable: npm, args: ["run", "check:worker-output", "--", "--run", run, "--article-wide"] };
  if (gate === "assemble_draft") return { executable: process.execPath, args: ["scripts/assemble-draft.mjs", "--run", run] };
  if (gate === "validate") return { executable: npm, args: ["run", "validate", "--", "--run", run] };
  if (gate === "validate_patches") return { executable: npm, args: ["run", "validate:patches", "--", "--run", run] };
  return null;
}

export function runSectionCheck({ workbench, runPath, section }) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return invoke({
    workbench,
    executable: npm,
    args: ["run", "check:worker-output", "--", "--run", runPathRelativeToWorkbench(workbench, runPath), "--section", section],
  });
}
