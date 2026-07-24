#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  reconcileSecondPassDerivedState,
  sha256File,
} from "./second-pass-derived-state.mjs";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) throw new Error(`Unexpected argument: ${entry}`);
    const [key, inline] = entry.slice(2).split("=", 2);
    if (key === "check" || key === "write") {
      values[key] = true;
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (!value || (!inline && value.startsWith("--"))) throw new Error(`Missing value for --${key}`);
    if (!inline) index += 1;
    values[key] = value;
  }
  return values;
}

export function reconcileSecondPassDerivedFiles({ planPath, trackerPath, statePath, workbench, write = false }) {
  if (!existsSync(statePath)) throw new Error(`Campaign state not found: ${statePath}`);
  const result = reconcileSecondPassDerivedState({
    plan: readJson(planPath),
    tracker: readJson(trackerPath),
    campaignState: readJson(statePath),
    workbench,
    immutablePlanSha256: sha256File(planPath),
  });
  const changed = result.trackerChanges > 0 || result.stateChanged;
  if (write && changed) {
    writeJson(trackerPath, result.tracker);
    writeJson(statePath, result.campaignState);
  }
  return {
    ...result,
    changed,
    planPath,
    trackerPath,
    statePath,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.check === options.write) throw new Error("Choose exactly one of --check or --write");
  const workbench = resolve(options.workbench ?? process.env.DOSEWIKI_CITATION_WORKBENCH ?? "/Users/josie/.codex/dosewiki-citation-workbench");
  const planPath = resolve(options.plan ?? "outputs/citation-second-pass-research-plan.json");
  const trackerPath = resolve(options.tracker ?? resolve(workbench, "trackers/second-pass-rollout.json"));
  const statePath = resolve(options.state ?? resolve(workbench, "campaigns/second-pass-campaign-state.json"));
  const runContext = createDataOpsRunContext({
    operation: "reconcile second-pass derived campaign state",
    intent: "citation-second-pass-derived-state",
    argv,
    sourceUrlKeys: [],
    targetUrlKeys: [],
    localArtifacts: [planPath, trackerPath, statePath],
  });
  printDataOpsRunContext(runContext);
  const result = reconcileSecondPassDerivedFiles({
    planPath,
    trackerPath,
    statePath,
    workbench,
    write: options.write,
  });
  console.log(JSON.stringify({
    mode: options.write ? "write" : "check",
    changed: result.changed,
    trackerChanges: result.trackerChanges,
    stateChanged: result.stateChanged,
    currentRows: result.currentRows.length,
    planPath,
    trackerPath,
    statePath,
  }, null, 2));
  if (options.check && result.changed) process.exitCode = 1;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
