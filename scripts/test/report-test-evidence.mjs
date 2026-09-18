// Per-file runtime, skip, and flake evidence for both test runners (TEST-011).
//
//   node scripts/test/report-test-evidence.mjs [--runs N]
//
// Lanes run sequentially: root Vitest, workflow Vitest, workflow node:test.
// Output: .test-evidence/report.json and .test-evidence/report.md.
// Exit 2 when a safety-listed file is skipped or has skipped cases,
// exit 1 when any file fails on every run, otherwise 0 (flaky files are listed but do not fail).

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverWorkflowTests } from "./workflow-test-manifest.mjs";

// Files that must never skip: TEST-003 fixture-backed workflow tests plus the local fixture stub.
export const SAFETY_LIST = [
  "scripts/citations/build-citation-author-repair-evidence-bundle.test.mjs",
];

export const SETUP_COST_PATTERN = /initRDKitModule|@rdkit|openchemlib|wasm|OclEditor/;
export const SETUP_COST_TAG = "setup:rdkit-or-wasm";

const SKIP_STATUSES = new Set(["pending", "skipped", "todo"]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function relative(file) {
  return path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
}

/**
 * Reduce a Vitest `--reporter=json` document to per-file rows.
 * Returns rows shaped { file, lane, durationMs, status, skippedCases: string[] }.
 */
export function summarizeVitestJson(json, lane) {
  const results = Array.isArray(json?.testResults) ? json.testResults : [];
  return results
    .map((result) => {
      const cases = Array.isArray(result.assertionResults) ? result.assertionResults : [];
      const skippedCases = cases
        .filter((c) => SKIP_STATUSES.has(c.status))
        .map((c) => c.fullName || c.title || "(untitled)");
      const failed = result.status === "failed" || cases.some((c) => c.status === "failed");
      const wholeFileSkipped =
        result.status === "skipped" || (cases.length > 0 && skippedCases.length === cases.length);
      const startTime = Number(result.startTime) || 0;
      const endTime = Number(result.endTime) || startTime;
      return {
        file: relative(result.name ?? ""),
        lane,
        durationMs: Math.max(0, endTime - startTime),
        status: failed ? "failed" : wholeFileSkipped ? "skipped" : "passed",
        skippedCases,
      };
    })
    .sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file));
}

/**
 * Merge the same lane rows across N runs.
 * Input: array of runs, each an array of rows from summarizeVitestJson or the node lane.
 * Output: { files: row[], flaky: string[], deterministic: string[] } where each row carries
 * durationMs (max across runs), durations, outcomes, status of the last run, and union of skipped cases.
 */
export function mergeRuns(runs) {
  const byFile = new Map();
  for (const rows of runs) {
    for (const row of rows) {
      const key = `${row.lane}\u0000${row.file}`;
      let merged = byFile.get(key);
      if (!merged) {
        merged = { file: row.file, lane: row.lane, durations: [], outcomes: [], skippedCases: new Set() };
        byFile.set(key, merged);
      }
      merged.durations.push(row.durationMs);
      merged.outcomes.push(row.status);
      for (const title of row.skippedCases ?? []) merged.skippedCases.add(title);
      if (row.tags) merged.tags = row.tags;
    }
  }

  const files = [];
  const flaky = [];
  const deterministic = [];
  for (const merged of byFile.values()) {
    const failures = merged.outcomes.filter((o) => o === "failed").length;
    const skips = merged.outcomes.filter((o) => o === "skipped").length;
    let status;
    if (failures === merged.outcomes.length) {
      status = "failed";
      deterministic.push(merged.file);
    } else if (failures > 0) {
      status = "flaky";
      flaky.push(merged.file);
    } else if (skips === merged.outcomes.length) {
      status = "skipped";
    } else {
      status = "passed";
    }
    files.push({
      file: merged.file,
      lane: merged.lane,
      durationMs: Math.max(...merged.durations),
      durations: merged.durations,
      outcomes: merged.outcomes,
      status,
      skippedCases: [...merged.skippedCases],
      tags: merged.tags ?? [],
    });
  }
  files.sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file));
  flaky.sort();
  deterministic.sort();
  return { files, flaky, deterministic };
}

/** Tag a test file whose source touches RDKit, OpenChemLib, or wasm setup. */
export function tagSetupCost(file, source) {
  return SETUP_COST_PATTERN.test(source) ? [SETUP_COST_TAG] : [];
}

/** Exit code from a merged report: 2 safety skip, 1 deterministic failure, 0 otherwise. */
export function computeExitCode(merged, safetyList = SAFETY_LIST) {
  const safety = new Set(safetyList);
  const safetySkipped = merged.files.some(
    (row) => safety.has(row.file) && (row.status === "skipped" || row.skippedCases.length > 0),
  );
  if (safetySkipped) return 2;
  if (merged.deterministic.length > 0) return 1;
  return 0;
}


function vitestBin() {
  return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
}

function spawn(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: "test", CI: "1" },
  });
}

function runVitestLane(lane, outFile, extraArgs) {
  const args = ["run", "--reporter=json", `--outputFile=${outFile}`, ...extraArgs];
  process.stderr.write(`[evidence] ${lane}: vitest ${args.join(" ")}\n`);
  const result = spawn(vitestBin(), args);
  if (result.error) throw result.error;
  let json;
  try {
    json = JSON.parse(readFileSync(outFile, "utf8"));
  } catch (error) {
    throw new Error(`${lane}: vitest wrote no JSON report (exit ${result.status}).\n${result.stderr}`, { cause: error });
  }
  return summarizeVitestJson(json, lane);
}

/** Parse `node --test --test-reporter=spec` output for one file into a row. */
export function summarizeNodeSpec(file, lane, output, durationMs, exitStatus) {
  const skippedCases = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(?:﹣|-)\s+(.*?)\s+\([\d.]+ms\)\s+#\s+(?:SKIP|TODO)/u);
    if (match) skippedCases.push(match[1]);
  }
  const counts = {};
  for (const key of ["tests", "pass", "fail", "skipped", "todo"]) {
    const match = output.match(new RegExp(`^ℹ ${key} (\\d+)$`, "mu"));
    counts[key] = match ? Number(match[1]) : 0;
  }
  const failed = exitStatus !== 0 || counts.fail > 0;
  const wholeFileSkipped = !failed && counts.tests > 0 && counts.skipped + counts.todo === counts.tests;
  return {
    file,
    lane,
    durationMs,
    status: failed ? "failed" : wholeFileSkipped ? "skipped" : "passed",
    skippedCases,
  };
}

function runNodeLane(lane, files) {
  const rows = [];
  for (const file of files) {
    process.stderr.write(`[evidence] ${lane}: node --test ${file}\n`);
    const started = performance.now();
    const result = spawn(process.execPath, ["--test", "--test-reporter=spec", file]);
    const durationMs = Math.round(performance.now() - started);
    if (result.error) throw result.error;
    rows.push(summarizeNodeSpec(file, lane, `${result.stdout}\n${result.stderr}`, durationMs, result.status ?? 1));
  }
  return rows;
}

function attachTags(rows) {
  for (const row of rows) {
    let source = "";
    try {
      source = readFileSync(path.join(repoRoot, row.file), "utf8");
    } catch {
      source = "";
    }
    row.tags = tagSetupCost(row.file, source);
  }
  return rows;
}

function laneTotals(files) {
  const totals = {};
  for (const row of files) {
    const lane = (totals[row.lane] ??= { files: 0, durationMs: 0 });
    lane.files += 1;
    lane.durationMs += row.durationMs;
  }
  return totals;
}

export function buildReport(merged, { runs, command, generatedAt }) {
  const tagged = merged.files.filter((row) => row.tags.includes(SETUP_COST_TAG));
  const skipped = merged.files.filter((row) => row.status === "skipped" || row.skippedCases.length > 0);
  const failed = merged.files.filter((row) => row.status === "failed" || row.status === "flaky");
  return {
    generatedAt,
    command,
    runs,
    exitCode: computeExitCode(merged),
    laneTotals: laneTotals(merged.files),
    setupCost: {
      tag: SETUP_COST_TAG,
      count: tagged.length,
      durationMs: tagged.reduce((sum, row) => sum + row.durationMs, 0),
      files: tagged.map((row) => row.file),
    },
    files: merged.files,
    skipped: skipped.map((row) => ({ file: row.file, lane: row.lane, status: row.status, skippedCases: row.skippedCases })),
    failed: failed.map((row) => ({ file: row.file, lane: row.lane, status: row.status, outcomes: row.outcomes })),
    flaky: merged.flaky,
    deterministic: merged.deterministic,
    safetyList: SAFETY_LIST,
  };
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push("# Test evidence report", "");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Command: \`${report.command}\``);
  lines.push(`Runs per lane: ${report.runs}`);
  lines.push(`Exit code: ${report.exitCode}`, "");

  lines.push("## Lane totals", "", "| Lane | Files | Total ms |", "| --- | ---: | ---: |");
  for (const [lane, total] of Object.entries(report.laneTotals)) {
    lines.push(`| ${lane} | ${total.files} | ${total.durationMs} |`);
  }
  lines.push("");

  lines.push("## Per-file duration (descending)", "", "| ms | Lane | Status | Tags | File |", "| ---: | --- | --- | --- | --- |");
  for (const row of report.files) {
    lines.push(`| ${row.durationMs} | ${row.lane} | ${row.status} | ${row.tags.join(" ") || ""} | ${row.file} |`);
  }
  lines.push("");

  lines.push(`## Setup cost (${report.setupCost.tag})`, "");
  lines.push(`${report.setupCost.count} files, ${report.setupCost.durationMs} ms total.`, "");
  for (const file of report.setupCost.files) lines.push(`- ${file}`);
  lines.push("");

  lines.push("## Skipped suites and cases", "");
  if (report.skipped.length === 0) lines.push("None.");
  for (const row of report.skipped) {
    lines.push(`- ${row.file} (${row.lane}, ${row.status})`);
    for (const title of row.skippedCases) lines.push(`  - ${title}`);
  }
  lines.push("");

  lines.push("## Failed files", "");
  if (report.failed.length === 0) lines.push("None.");
  for (const row of report.failed) lines.push(`- ${row.file} (${row.lane}, ${row.status}: ${row.outcomes.join(", ")})`);
  lines.push("");

  if (report.runs > 1) {
    lines.push("## Flaky (outcome differed across runs)", "");
    if (report.flaky.length === 0) lines.push("None.");
    for (const file of report.flaky) lines.push(`- ${file}`);
    lines.push("", "## Deterministic failures (failed every run)", "");
    if (report.deterministic.length === 0) lines.push("None.");
    for (const file of report.deterministic) lines.push(`- ${file}`);
    lines.push("");
  }

  lines.push("## Safety list", "");
  for (const file of report.safetyList) lines.push(`- ${file}`);
  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv) {
  let runs = 1;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--runs") {
      runs = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i].startsWith("--runs=")) {
      runs = Number(argv[i].slice("--runs=".length));
    }
  }
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${runs}`);
  return { runs };
}

function main() {
  const { runs } = parseArgs(process.argv.slice(2));
  const tmp = mkdtempSync(path.join(tmpdir(), "test-evidence-"));
  const { nodeTests, vitestTests } = discoverWorkflowTests(repoRoot);

  const runRows = [];
  for (let run = 1; run <= runs; run += 1) {
    process.stderr.write(`[evidence] run ${run}/${runs}\n`);
    const rows = [
      ...runVitestLane("root-vitest", path.join(tmp, `root-${run}.json`), []),
      ...(vitestTests.length > 0
        ? runVitestLane("workflow-vitest", path.join(tmp, `workflow-${run}.json`), [
            "--config",
            "scripts/test/vitest.workflow.config.ts",
            ...vitestTests,
          ])
        : []),
      ...runNodeLane("workflow-node", nodeTests),
    ];
    runRows.push(attachTags(rows));
  }

  const merged = mergeRuns(runRows);
  const report = buildReport(merged, {
    runs,
    command: `node scripts/test/report-test-evidence.mjs --runs ${runs}`,
    generatedAt: new Date().toISOString(),
  });

  const outDir = path.join(repoRoot, ".test-evidence");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outDir, "report.md"), renderMarkdown(report));
  process.stderr.write(`[evidence] wrote ${path.relative(repoRoot, outDir)}/report.{json,md}; exit ${report.exitCode}\n`);
  process.exit(report.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
