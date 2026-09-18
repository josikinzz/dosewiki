import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SAFETY_LIST,
  SETUP_COST_TAG,
  computeExitCode,
  mergeRuns,
  summarizeNodeSpec,
  summarizeVitestJson,
  tagSetupCost,
} from "./report-test-evidence.mjs";

const vitestFixture = {
  testResults: [
    {
      name: "src/fast.test.ts",
      status: "passed",
      startTime: 1000,
      endTime: 1050,
      assertionResults: [{ title: "adds", fullName: "math adds", status: "passed" }],
    },
    {
      name: "src/slow.test.ts",
      status: "passed",
      startTime: 1000,
      endTime: 4000,
      assertionResults: [
        { title: "renders", fullName: "widget renders", status: "passed" },
        { title: "later", fullName: "widget later", status: "todo" },
        { title: "pending", fullName: "widget pending", status: "pending" },
      ],
    },
    {
      name: "src/off.test.ts",
      status: "skipped",
      startTime: 1000,
      endTime: 1001,
      assertionResults: [{ title: "never", fullName: "never runs", status: "skipped" }],
    },
    {
      name: "src/broken.test.ts",
      status: "failed",
      startTime: 1000,
      endTime: 1500,
      assertionResults: [{ title: "boom", fullName: "boom", status: "failed" }],
    },
  ],
};

test("summarizeVitestJson sorts by duration and detects skipped cases", () => {
  const rows = summarizeVitestJson(vitestFixture, "root-vitest");
  assert.deepEqual(
    rows.map((row) => row.file),
    ["src/slow.test.ts", "src/broken.test.ts", "src/fast.test.ts", "src/off.test.ts"],
  );
  const slow = rows.find((row) => row.file.endsWith("slow.test.ts"));
  assert.equal(slow.durationMs, 3000);
  assert.equal(slow.status, "passed");
  assert.deepEqual(slow.skippedCases, ["widget later", "widget pending"]);
  assert.equal(rows.find((row) => row.file.endsWith("off.test.ts")).status, "skipped");
  assert.equal(rows.find((row) => row.file.endsWith("broken.test.ts")).status, "failed");
  assert.ok(rows.every((row) => row.lane === "root-vitest"));
});

test("summarizeVitestJson tolerates an empty or malformed document", () => {
  assert.deepEqual(summarizeVitestJson({}, "x"), []);
  assert.deepEqual(summarizeVitestJson(null, "x"), []);
});

test("mergeRuns separates flaky from deterministic failures and unions skipped cases", () => {
  const row = (file, status, durationMs, skippedCases = []) => ({ file, lane: "l", status, durationMs, skippedCases });
  const merged = mergeRuns([
    [row("a", "failed", 10), row("b", "failed", 20), row("c", "passed", 5, ["x"])],
    [row("a", "passed", 30), row("b", "failed", 25), row("c", "passed", 6, ["y"])],
    [row("a", "passed", 15), row("b", "failed", 22), row("c", "skipped", 1)],
  ]);
  assert.deepEqual(merged.flaky, ["a"]);
  assert.deepEqual(merged.deterministic, ["b"]);
  assert.deepEqual(
    merged.files.map((row) => row.file),
    ["a", "b", "c"],
  );
  const a = merged.files.find((row) => row.file === "a");
  assert.equal(a.status, "flaky");
  assert.equal(a.durationMs, 30);
  assert.deepEqual(a.outcomes, ["failed", "passed", "passed"]);
  const c = merged.files.find((row) => row.file === "c");
  assert.equal(c.status, "passed");
  assert.deepEqual(c.skippedCases, ["x", "y"]);
});

test("mergeRuns marks a file skipped only when every run skipped it", () => {
  const merged = mergeRuns([
    [{ file: "s", lane: "l", status: "skipped", durationMs: 1, skippedCases: [] }],
    [{ file: "s", lane: "l", status: "skipped", durationMs: 2, skippedCases: [] }],
  ]);
  assert.equal(merged.files[0].status, "skipped");
  assert.deepEqual(merged.flaky, []);
  assert.deepEqual(merged.deterministic, []);
});

test("tagSetupCost tags rdkit, openchemlib, wasm, and OclEditor sources", () => {
  assert.deepEqual(tagSetupCost("a.test.ts", "import { initRDKitModule } from '@rdkit/rdkit';"), [SETUP_COST_TAG]);
  assert.deepEqual(tagSetupCost("b.test.ts", "await import('openchemlib')"), [SETUP_COST_TAG]);
  assert.deepEqual(tagSetupCost("c.test.ts", "loads molecule.wasm"), [SETUP_COST_TAG]);
  assert.deepEqual(tagSetupCost("d.test.tsx", "render(<OclEditor />)"), [SETUP_COST_TAG]);
  assert.deepEqual(tagSetupCost("e.test.ts", "expect(1).toBe(1)"), []);
});

test("computeExitCode gates on safety skips, then deterministic failures", () => {
  const safe = SAFETY_LIST[0];
  const base = (overrides) => ({
    files: [{ file: safe, lane: "l", status: "passed", skippedCases: [], durationMs: 1, tags: [] }],
    flaky: [],
    deterministic: [],
    ...overrides,
  });
  assert.equal(computeExitCode(base({})), 0);
  assert.equal(computeExitCode(base({ flaky: ["x"] })), 0);
  assert.equal(computeExitCode(base({ deterministic: ["x"] })), 1);
  assert.equal(
    computeExitCode(
      base({
        deterministic: ["x"],
        files: [{ file: safe, lane: "l", status: "passed", skippedCases: ["one"], durationMs: 1, tags: [] }],
      }),
    ),
    2,
  );
  assert.equal(
    computeExitCode(base({ files: [{ file: safe, lane: "l", status: "skipped", skippedCases: [], durationMs: 1, tags: [] }] })),
    2,
  );
  assert.equal(
    computeExitCode(base({ files: [{ file: "other.test.ts", lane: "l", status: "skipped", skippedCases: [], durationMs: 1, tags: [] }] })),
    0,
  );
});

test("summarizeNodeSpec reads skip markers and summary counts from spec output", () => {
  const output = [
    "▶ suite",
    "  ✔ runs (1.2ms)",
    "  ﹣ later (0.1ms) # SKIP",
    "  ﹣ someday (0.1ms) # TODO",
    "▶ suite (2ms)",
    "ℹ tests 3",
    "ℹ suites 1",
    "ℹ pass 1",
    "ℹ fail 0",
    "ℹ cancelled 0",
    "ℹ skipped 1",
    "ℹ todo 1",
    "ℹ duration_ms 20",
  ].join("\n");
  const row = summarizeNodeSpec("t.test.mjs", "workflow-node", output, 42, 0);
  assert.equal(row.status, "passed");
  assert.equal(row.durationMs, 42);
  assert.deepEqual(row.skippedCases, ["later", "someday"]);

  const allSkipped = ["﹣ a (0.1ms) # SKIP", "ℹ tests 1", "ℹ pass 0", "ℹ fail 0", "ℹ skipped 1", "ℹ todo 0"].join("\n");
  assert.equal(summarizeNodeSpec("s.test.mjs", "workflow-node", allSkipped, 1, 0).status, "skipped");
  assert.equal(summarizeNodeSpec("f.test.mjs", "workflow-node", "ℹ fail 1", 1, 1).status, "failed");
});
