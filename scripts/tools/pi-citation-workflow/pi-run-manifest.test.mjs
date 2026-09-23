import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  sections,
  writeScript,
  fixture,
  json,
  run,
  runGate,
  prepareReconciliation,
  prepareFinalizableLiveRun,
} from "./pi-run-manifest.fixtures.mjs";

test("executes the complete auditable Pi citation draft sequence", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    const initialized = JSON.parse(run("init", "--run", runPath, "--slug", "example-drug"));
    assert.equal(initialized.allowLiveWebResearch, false);
    runGate(runPath, workbench, "preflight");

    for (const section of sections) {
      const artifact = join(runPath, "sections", `${section}.json`);
      mkdirSync(join(runPath, "sections"), { recursive: true });
      writeFileSync(artifact, "{}\n");
      run("check-section", "--run", runPath, "--workbench", workbench, "--section", section, "--worker-id", `worker-${section}`, "--model", "test-model");
    }

    runGate(runPath, workbench, "remap");
    runGate(runPath, workbench, "section_rechecks");
    runGate(runPath, workbench, "proactive_scan");
    runGate(runPath, workbench, "article_wide_packet");
    runGate(runPath, workbench, "article_wide_sanitize");
    runGate(runPath, workbench, "article_wide_residue_scan");
    writeFileSync(join(runPath, "article-wide.json"), "{}\n");
    runGate(runPath, workbench, "article_wide_check");
    runGate(runPath, workbench, "assemble_draft");
    runGate(runPath, workbench, "validate");
    runGate(runPath, workbench, "validate_patches");
    runGate(runPath, workbench, "final_review_surface_scan");

    const finalized = JSON.parse(run("finalize", "--run", runPath));
    assert.equal(finalized.outcome, "needs_review");
    const manifest = JSON.parse(readFileSync(join(runPath, "pi-run-manifest.json"), "utf8"));
    assert.equal(manifest.gates.validate_patches.result, "passed");
    assert.ok(manifest.gates.article_wide_check.command.includes("normalize:discovery-provenance"));
    assert.equal(manifest.sections.summary.status, "checked");
    assert.ok(manifest.gates.article_wide_residue_scan.log);
    assert.throws(
      () => run("section", "--run", runPath, "--section", "summary", "--status", "missing_preserve_original"),
      /Cannot mutate a finalized manifest/,
    );
    assert.throws(
      () => run("check-section", "--run", runPath, "--workbench", workbench, "--section", "summary"),
      /Cannot mutate a finalized manifest/,
    );
    assert.throws(
      () => runGate(runPath, workbench, "validate"),
      /Cannot mutate a finalized manifest/,
    );
    assert.throws(
      () => run("init", "--run", runPath),
      /manifest already exists/,
    );
    assert.throws(
      () => run("finalize", "--run", runPath),
      /already finalized/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects finalization until a contaminated human-facing report is corrected and rescanned", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareFinalizableLiveRun(runPath, workbench);
    writeFileSync(join(runPath, "citation-report.md"), "# Citation review\n\nAudit research used PsychonautWiki.\n");
    assert.throws(
      () => runGate(runPath, workbench, "final_review_surface_scan"),
      /forbidden discovery\/wiki residue/,
    );
    assert.throws(() => run("finalize", "--run", runPath), /final_review_surface_scan/);
    writeFileSync(join(runPath, "citation-report.md"), "# Citation review\n\nClean final review report.\n");
    runGate(runPath, workbench, "final_review_surface_scan");
    assert.equal(JSON.parse(run("finalize", "--run", runPath)).outcome, "needs_review");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("creates immutable, linked corrective reruns instead of mutating finalized runs", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareFinalizableLiveRun(runPath, workbench);
    runGate(runPath, workbench, "final_review_surface_scan");
    run("finalize", "--run", runPath);
    const originalTask = readFileSync(join(runPath, "citation-task.json"), "utf8");
    const originalManifest = readFileSync(join(runPath, "pi-run-manifest.json"), "utf8");
    const first = JSON.parse(run("rerun", "--run", runPath, "--workbench", workbench, "--reason", "Remove forbidden audit residue."));
    const second = JSON.parse(run("rerun", "--run", runPath, "--workbench", workbench, "--reason", "Independent clean retry."));
    assert.notEqual(first.runId, second.runId);
    assert.notEqual(first.runPath, runPath);
    assert.equal(readFileSync(join(runPath, "citation-task.json"), "utf8"), originalTask);
    assert.equal(readFileSync(join(runPath, "pi-run-manifest.json"), "utf8"), originalManifest);
    const rerunManifest = json(join(first.runPath, "pi-run-manifest.json"));
    assert.deepEqual(rerunManifest.supersession, {
      schemaVersion: "dosewiki_pi_citation_corrective_rerun_v1",
      supersedesRunId: "example-drug",
      reason: "Remove forbidden audit residue.",
      parentFinalizedAt: json(join(runPath, "pi-run-manifest.json")).finalizedAt,
      parentTaskSha256: createHash("sha256").update(originalTask).digest("hex"),
      parentManifestSha256: createHash("sha256").update(originalManifest).digest("hex"),
    });
    assert.equal(json(join(first.runPath, "citation-task.json")).taskId, first.runId);
    assert.equal(json(join(first.runPath, "citation-task.json")).correctiveRerun.reason, "Remove forbidden audit residue.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-sequence executes reconciliation in order and skips fresh gates", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareReconciliation(runPath, workbench);
    const first = JSON.parse(run("run-sequence", "--run", runPath, "--workbench", workbench));
    assert.deepEqual(first.gates.map(({ gate }) => gate), [
      "remap",
      "section_rechecks",
      "proactive_scan",
      "article_wide_packet",
      "article_wide_sanitize",
      "article_wide_residue_scan",
    ]);
    assert.deepEqual(first.gates.map(({ result }) => result), Array(6).fill("passed"));

    const second = JSON.parse(run("run-sequence", "--run", runPath, "--workbench", workbench));
    assert.deepEqual(second.gates.map(({ result }) => result), Array(6).fill("fresh, skipped"));
    const only = JSON.parse(run("run-sequence", "--run", runPath, "--workbench", workbench, "--only", "proactive_scan"));
    assert.deepEqual(only.gates, [{ gate: "proactive_scan", result: "fresh, skipped" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-sequence stops at the first failure and resumes from a selected gate", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareReconciliation(runPath, workbench);
    writeScript(join(workbench, "scripts", "proactive-scan.mjs"), "process.stderr.write('repair proactive scan\\n'); process.exit(1);\n");
    assert.throws(
      () => run("run-sequence", "--run", runPath, "--workbench", workbench),
      /run-sequence stopped at proactive_scan.*Minimum safe sequence after repair:.*--from proactive_scan/s,
    );
    const manifest = json(join(runPath, "pi-run-manifest.json"));
    assert.equal(manifest.gates.proactive_scan.result, "failed");
    assert.equal(manifest.gates.article_wide_packet, undefined);

    writeScript(join(workbench, "scripts", "proactive-scan.mjs"), "process.exit(0);\n");
    const resumed = JSON.parse(run("run-sequence", "--run", runPath, "--workbench", workbench, "--from", "proactive_scan"));
    assert.deepEqual(resumed.gates.map(({ gate }) => gate), [
      "proactive_scan",
      "article_wide_packet",
      "article_wide_sanitize",
      "article_wide_residue_scan",
    ]);
    assert.deepEqual(resumed.gates.map(({ result }) => result), Array(4).fill("passed"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-sequence includes stale preflight in its minimum repair sequence", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareReconciliation(runPath, workbench);
    const task = json(join(runPath, "citation-task.json"));
    task.packetRevision = 2;
    writeFileSync(join(runPath, "citation-task.json"), `${JSON.stringify(task)}\n`);
    assert.throws(
      () => run("run-sequence", "--run", runPath, "--workbench", workbench),
      /Minimum safe sequence after repair:.*run-gate.*--gate preflight.*&&.*--from remap/s,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rerun --reuse-sections copies only accepted artifacts with matching hashes", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareFinalizableLiveRun(runPath, workbench);
    runGate(runPath, workbench, "final_review_surface_scan");
    run("finalize", "--run", runPath);

    const reusedRun = JSON.parse(run("rerun", "--run", runPath, "--workbench", workbench, "--reason", "Article-wide correction.", "--reuse-sections"));
    assert.deepEqual(reusedRun.reusedSections.map(({ section }) => section), sections);
    assert.deepEqual(reusedRun.sectionsNotReused, []);
    const successorManifest = json(join(reusedRun.runPath, "pi-run-manifest.json"));
    for (const section of sections) {
      assert.equal(successorManifest.sections[section].status, "checked");
      assert.equal(successorManifest.sections[section].reusedFrom.runId, "example-drug");
      assert.ok(existsSync(join(reusedRun.runPath, successorManifest.sections[section].artifact)));
      assert.ok(existsSync(join(reusedRun.runPath, successorManifest.sections[section].checkLog)));
    }

    writeFileSync(join(runPath, "sections", "legality.json"), "{\"tampered\":true}\n");
    const partialRun = JSON.parse(run("rerun", "--run", runPath, "--workbench", workbench, "--reason", "Report-only correction.", "--reuse-sections"));
    assert.deepEqual(partialRun.reusedSections.map(({ section }) => section), sections.filter((section) => section !== "legality"));
    assert.deepEqual(partialRun.sectionsNotReused, [{ section: "legality", reason: "accepted artifact hash no longer matches the manifest" }]);
    assert.equal(json(join(partialRun.runPath, "pi-run-manifest.json")).sections.legality.status, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("archives a failed section and rejects any remaining unaccepted output", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    mkdirSync(join(runPath, "sections"), { recursive: true });
    writeFileSync(join(runPath, "sections", "summary.json"), "{}\n");
    run("section", "--run", runPath, "--section", "summary", "--status", "failed_preserve_original", "--artifact", "sections/summary.json");
    for (const section of sections.filter((section) => section !== "summary")) {
      run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    }
    writeFileSync(join(runPath, "sections", "rogue.json"), "{}\\n");
    assert.throws(
      () => runGate(runPath, workbench, "remap"),
      /Unaccepted section artifacts remain/,
    );
    assert.ok(readFileSync(join(runPath, "pi-run-manifest.json"), "utf8").includes("failed-sections/summary-"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
