/* global URL, process */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./citation-campaign.mjs", import.meta.url).pathname;

function run(...args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function writeRun(workbench, runId, manifest, draft) {
  const runPath = join(workbench, "runs", runId);
  mkdirSync(runPath, { recursive: true });
  const draftText = draft ? `${JSON.stringify(draft, null, 2)}\n` : null;
  if (draftText) writeFileSync(join(runPath, "citation-draft.json"), draftText);
  const finalizedManifest = draftText && manifest.outcome === "needs_review"
    ? {
        ...manifest,
        finalizedAt: "2026-05-01T00:00:00.000Z",
        gates: {
          ...manifest.gates,
          final_review_surface_scan: {
            result: "passed",
            snapshot: { draft: createHash("sha256").update(draftText).digest("hex") },
          },
        },
      }
    : manifest;
  writeFileSync(join(runPath, "pi-run-manifest.json"), `${JSON.stringify(finalizedManifest, null, 2)}\n`);
  return runPath;
}

function manifest(runId, extra = {}) {
  return {
    schemaVersion: "dosewiki_pi_citation_run_v1",
    runId,
    slug: "example-drug",
    outcome: "needs_review",
    nonEmptySections: ["summary"],
    sections: {
      summary: { chars: 100, status: "checked", model: "example/worker-model" },
    },
    gates: {},
    ...extra,
  };
}

test("campaign status derives immutable attempt state, supersession, and coverage without changing runs", () => {
  const root = mkdtempSync(join(tmpdir(), "citation-campaign-"));
  const workbench = join(root, "workbench");
  const campaign = join(root, "campaign.json");
  mkdirSync(join(workbench, "runs"), { recursive: true });

  try {
    run(
      "init",
      "--campaign", campaign,
      "--target", "example-drug:summary",
      "--model", "example/worker-model",
      "--tier", "terra-medium",
      "--workbench", workbench,
    );
    const pending = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    assert.equal(pending.targets[0].state, "pending");

    const first = manifest("example-attempt-1");
    writeRun(workbench, first.runId, first, {
      markedSections: { summary: "A claim.[cite:one] Another claim.[cite:two]" },
      gaps: [{ claim: "uncited" }],
    });
    const reviewed = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    assert.equal(reviewed.targets[0].state, "needs_review");
    assert.equal(reviewed.targets[0].attempts[0].coverage.trusted, true);
    assert.equal(reviewed.targets[0].attempts[0].coverage.invalid, false);
    assert.equal(reviewed.coverage.markers, 2);
    assert.equal(reviewed.coverage.gaps, 1);

    const successor = manifest("example-attempt-2", {
      outcome: "prepared",
      supersession: { supersedesRunId: first.runId },
    });
    writeRun(workbench, successor.runId, successor);
    const report = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    assert.equal(report.targets[0].state, "running");
    assert.equal(report.targets[0].attempts[0].state, "superseded");
    assert.equal(report.targets[0].attempts[1].state, "running");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("campaign blocks missing or tampered finalized drafts and excludes their coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "citation-campaign-integrity-"));
  const workbench = join(root, "workbench");
  const campaign = join(root, "campaign.json");
  mkdirSync(join(workbench, "runs"), { recursive: true });

  try {
    run(
      "init",
      "--campaign", campaign,
      "--target", "example-drug:summary",
      "--model", "example/worker-model",
      "--tier", "terra-medium",
      "--workbench", workbench,
    );
    const runPath = writeRun(workbench, "tampered-attempt", manifest("tampered-attempt"), {
      markedSections: { summary: "A claim.[cite:one]" },
      gaps: [{ claim: "uncited" }],
    });
    writeFileSync(join(runPath, "citation-draft.json"), JSON.stringify({ markedSections: { summary: "Tampered.[cite:two]" }, gaps: [] }));

    const tampered = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    const tamperedAttempt = tampered.targets[0].attempts[0];
    assert.equal(tampered.targets[0].state, "blocked");
    assert.match(tamperedAttempt.reason, /hash does not match/);
    assert.equal(tamperedAttempt.coverage.trusted, false);
    assert.equal(tamperedAttempt.coverage.invalid, true);
    assert.equal(tampered.coverage.markers, 0);
    assert.equal(tampered.coverage.gaps, 0);

    rmSync(join(runPath, "citation-draft.json"));
    const missing = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    const missingAttempt = missing.targets[0].attempts[0];
    assert.equal(missing.targets[0].state, "blocked");
    assert.match(missingAttempt.reason, /citation-draft\.json is missing/);
    assert.equal(missingAttempt.coverage.trusted, false);
    assert.equal(missingAttempt.coverage.invalid, true);
    assert.equal(missingAttempt.coverage.markers, 0);
    assert.equal(missingAttempt.coverage.gaps, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("campaign scope and model pin are locked and mismatched attempts are blocked", () => {
  const root = mkdtempSync(join(tmpdir(), "citation-campaign-lock-"));
  const workbench = join(root, "workbench");
  const campaign = join(root, "campaign.json");
  mkdirSync(join(workbench, "runs"), { recursive: true });

  try {
    run(
      "init",
      "--campaign", campaign,
      "--target", "example-drug:summary",
      "--model", "example/worker-model",
      "--tier", "terra-medium",
      "--workbench", workbench,
    );
    assert.throws(
      () => run("init", "--campaign", campaign, "--target", "other:legality", "--model", "openai/model", "--tier", "small", "--workbench", workbench),
      /Campaign already exists and is locked/,
    );

    const mismatched = manifest("wrong-model", {
      sections: { summary: { chars: 100, status: "checked", model: "example/other-model" } },
    });
    writeRun(workbench, mismatched.runId, mismatched);
    const report = JSON.parse(run("status", "--campaign", campaign, "--format", "json"));
    assert.equal(report.targets[0].state, "blocked");
    assert.match(report.targets[0].attempts[0].reason, /model pin mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
