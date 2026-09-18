import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./pi-run-manifest.mjs", import.meta.url).pathname;
const sections = ["summary", "pharmacology", "tolerance", "harm_potential", "history_culture", "legality"];

function writeScript(path, source) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, source);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-citation-manifest-"));
  const workbench = join(root, "workbench");
  const run = join(workbench, "runs", "example-drug");
  mkdirSync(join(workbench, "scripts"), { recursive: true });
  mkdirSync(run, { recursive: true });
  writeFileSync(join(workbench, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      preflight: "node scripts/preflight.mjs",
      "check:worker-output": "node scripts/check.mjs",
      "article-wide:packet": "node scripts/packet.mjs",
      "article-wide:sanitize": "node scripts/sanitize.mjs",
      "normalize:discovery-provenance": "node scripts/normalize.mjs",
      validate: "node scripts/validate.mjs",
      "validate:patches": "node scripts/validate-patches.mjs",
    },
  }));
  writeScript(join(workbench, "scripts", "preflight.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "check.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "proactive-scan.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "remap-section-reference-ids.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "sanitize.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "normalize.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "validate.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "validate-patches.mjs"), "process.exit(0);\n");
  writeScript(join(workbench, "scripts", "packet.mjs"), `
    import { writeFileSync } from 'node:fs';
    const index = process.argv.indexOf('--run');
    writeFileSync(process.argv[index + 1] + '/article-wide-input.json', '{"clean":true}\\n');
  `);
  writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
    import { readFileSync, writeFileSync } from 'node:fs';
    const index = process.argv.indexOf('--run');
    const run = process.argv[index + 1];
    const task = JSON.parse(readFileSync(run + '/citation-task.json', 'utf8'));
    writeFileSync(run + '/citation-draft.json', JSON.stringify({
      citationMode: 'marker_only',
      provenance: task.provenance,
      promotion: task.promotion,
      inputBinding: task.inputBinding,
      selectedSections: task.selectedSections ?? null,
    }) + '\\n');
    writeFileSync(run + '/citation-report.md', '# Citation review\\n\\nClean final review report.\\n');
  `);
  writeFileSync(
    join(run, "citation-task.json"),
    JSON.stringify({
      taskId: "example-drug",
      allowLiveWebResearch: false,
      provenance: { source: "live_postgres_export", applyBound: true },
      article: { slug: "example-drug", citableSections: Object.fromEntries(sections.map((section) => [section, `${section} prose`])) },
    }),
  );
  return { root, workbench, run };
}

function localProposalFixture() {
  const base = fixture();
  const runId = "example-drug--proposal-summary--abcdef123456";
  const proposalRun = join(base.workbench, "runs", runId);
  mkdirSync(proposalRun, { recursive: true });
  mkdirSync(join(proposalRun, "proposal-input"), { recursive: true });

  const raw = "raw response bytes\n";
  const rawHash = createHash("sha256").update(raw).digest("hex");
  const proposal = {
    schemaVersion: "section-proposal-v1",
    slug: "example-drug",
    section: "summary",
    artifactDigestVersion: "reviewed-section-artifact-v1",
    artifactDigest: "a".repeat(64),
    manifestDigest: "b".repeat(64),
    rawResponseHash: rawHash,
    sectionHashAfter: "c".repeat(64),
    after: { present: true, value: "proposal summary prose" },
  };
  const proposalText = `${JSON.stringify(proposal, null, 2)}\n`;
  const binding = {
    schemaVersion: "dosewiki_local_proposal_binding_v1",
    kind: "local_section_proposal",
    slug: "example-drug",
    section: "summary",
    artifactDigestVersion: proposal.artifactDigestVersion,
    artifactDigest: proposal.artifactDigest,
    manifestDigest: proposal.manifestDigest,
    proposalJsonSha256: createHash("sha256").update(proposalText).digest("hex"),
    sectionHashAfter: proposal.sectionHashAfter,
    sourcePath: "notes-and-plans/exports/batch-proposals/example-drug/summary/proposal.json",
  };
  writeFileSync(join(proposalRun, "proposal-input", "proposal.json"), proposalText);
  writeFileSync(join(proposalRun, "proposal-input", "target-manifest.json"), `${JSON.stringify({ manifestDigest: binding.manifestDigest })}\n`);
  writeFileSync(join(proposalRun, "proposal-input", "openrouter-response.txt"), raw);
  writeFileSync(join(proposalRun, "proposal-input", "binding.json"), `${JSON.stringify(binding, null, 2)}\n`);
  writeFileSync(join(proposalRun, "citation-task.json"), JSON.stringify({
    taskId: runId,
    allowLiveWebResearch: false,
    provenance: { source: "local_section_proposal", taskMode: "local_experiment", applyBound: false },
    promotion: { allowed: false, policy: "never", reason: "Local proposal citation drafts are review artifacts only." },
    inputBinding: binding,
    article: {
      slug: "example-drug",
      title: "Example Drug",
      citableSections: Object.fromEntries(sections.map((section) => [section, section === "summary" ? proposal.after.value : null])),
    },
  }));
  rmSync(base.run, { recursive: true, force: true });
  return { ...base, run: proposalRun, runId, binding };
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(...args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function runGate(runPath, workbench, gate) {
  return run("run-gate", "--run", runPath, "--workbench", workbench, "--gate", gate);
}

function prepareReconciliation(runPath, workbench) {
  run("init", "--run", runPath);
  runGate(runPath, workbench, "preflight");
  mkdirSync(join(runPath, "sections"), { recursive: true });
  for (const section of sections) {
    writeFileSync(join(runPath, "sections", `${section}.json`), "{}\n");
    run("check-section", "--run", runPath, "--workbench", workbench, "--section", section);
  }
}

function completeLocalProposalGates(runPath, workbench) {
  runGate(runPath, workbench, "preflight");
  mkdirSync(join(runPath, "sections"), { recursive: true });
  writeFileSync(join(runPath, "sections", "summary.json"), "{}\n");
  run("check-section", "--run", runPath, "--workbench", workbench, "--section", "summary");
  for (const section of sections.filter((entry) => entry !== "summary")) {
    run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
  }
  for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
    runGate(runPath, workbench, gate);
  }
  writeFileSync(join(runPath, "article-wide.json"), "{}\n");
  for (const gate of ["article_wide_check", "assemble_draft", "validate", "validate_patches"]) {
    runGate(runPath, workbench, gate);
  }
  if (!existsSync(join(runPath, "citation-report.md"))) {
    writeFileSync(join(runPath, "citation-report.md"), "# Citation review\n\nClean final review report.\n");
  }
  runGate(runPath, workbench, "final_review_surface_scan");
}

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

function prepareFinalizableLiveRun(runPath, workbench) {
  run("init", "--run", runPath);
  runGate(runPath, workbench, "preflight");
  mkdirSync(join(runPath, "sections"), { recursive: true });
  for (const section of sections) {
    writeFileSync(join(runPath, "sections", `${section}.json`), "{}\n");
    run("check-section", "--run", runPath, "--workbench", workbench, "--section", section);
  }
  for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
    runGate(runPath, workbench, gate);
  }
  writeFileSync(join(runPath, "article-wide.json"), "{}\n");
  for (const gate of ["article_wide_check", "assemble_draft", "validate", "validate_patches"]) {
    runGate(runPath, workbench, gate);
  }
}

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

test("strips discovery-only PsychonautWiki prior-work metadata before the residue gate", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    runGate(runPath, workbench, "remap");
    runGate(runPath, workbench, "section_rechecks");
    runGate(runPath, workbench, "proactive_scan");
    runGate(runPath, workbench, "article_wide_packet");
    writeScript(join(workbench, "scripts", "sanitize.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      writeFileSync(process.argv[index + 1] + '/article-wide-input.json', JSON.stringify({
        priorWork: {
          references: [
            { id: 'pw-ref', source: 'PsychonautWiki', role: 'candidate_discovery_only', supportStatus: 'discovery_only', discoverySource: 'psychonautwiki_reference_cache' },
            { id: 'official-ref', title: 'Official source', url: 'https://example.test/official' },
          ],
          sources: [{ id: 'pw-source', sourceName: 'PsychonautWiki', supportStatus: 'discovery_only' }],
        },
      }) + '\\n');
    `);
    runGate(runPath, workbench, "article_wide_sanitize");
    const packet = JSON.parse(readFileSync(join(runPath, "article-wide-input.json"), "utf8"));
    assert.deepEqual(packet.priorWork.references, [{ id: 'official-ref', title: 'Official source', url: 'https://example.test/official' }]);
    assert.deepEqual(packet.priorWork.sources, []);
    runGate(runPath, workbench, "article_wide_residue_scan");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects discovery-only wiki metadata retained by article-wide output", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), JSON.stringify({
      priorWork: { references: [{ id: "pw-ref", source: "PsychonautWiki" }] },
    }));
    assert.throws(
      () => runGate(runPath, workbench, "article_wide_check"),
      /Deterministic gate failed: article_wide_check/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects discovery-only wiki metadata retained by the assembled draft", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), "{}");
    runGate(runPath, workbench, "article_wide_check");
    writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      writeFileSync(process.argv[index + 1] + '/citation-draft.json', JSON.stringify({
        references: [{ id: 'wiki-ref', title: 'Wikipedia research note', url: 'https://example.test/reference' }],
      }) + '\\n');
    `);
    assert.throws(
      () => runGate(runPath, workbench, "assemble_draft"),
      /Deterministic gate failed: assemble_draft/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows only top-level metadata.discoveryProvenance in JSON review artifacts", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), JSON.stringify({
      metadata: {
        discoveryProvenance: ["Research began with Wikipedia before primary-source verification."],
      },
    }));
    runGate(runPath, workbench, "article_wide_check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not exempt discovery provenance nested in public article-wide content", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), JSON.stringify({
      metadata: {
        discoveryProvenance: {
          markedSections: {
            summary: "Wikipedia supplied this public claim.",
          },
        },
      },
    }));
    assert.throws(
      () => runGate(runPath, workbench, "article_wide_check"),
      /forbidden discovery\/wiki residue/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows citation-draft metadata.discoveryProvenance but still scans public references", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), "{}\n");
    runGate(runPath, workbench, "article_wide_check");
    writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      const run = process.argv[index + 1];
      writeFileSync(run + '/citation-draft.json', JSON.stringify({
        metadata: { discoveryProvenance: ['Wikipedia was used for discovery only.'] },
        references: [],
      }) + '\\n');
      writeFileSync(run + '/citation-report.md', '# Citation review\\n');
    `);
    runGate(runPath, workbench, "assemble_draft");

    writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      const run = process.argv[index + 1];
      writeFileSync(run + '/citation-draft.json', JSON.stringify({
        metadata: { discoveryProvenance: ['Wikipedia was used for discovery only.'] },
        references: [{ id: 'wiki-ref', title: 'Wikipedia public citation' }],
      }) + '\\n');
      writeFileSync(run + '/citation-report.md', '# Citation review\\n');
    `);
    assert.throws(() => runGate(runPath, workbench, "assemble_draft"), /forbidden discovery\/wiki residue/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows one exact Discovery provenance report section and scans later prose", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    prepareFinalizableLiveRun(runPath, workbench);
    writeFileSync(join(runPath, "citation-report.md"), "# Citation review\n\n## Discovery provenance\n\nWikipedia and PsychonautWiki were discovery-only.\n\n## Validation\n\nClean.\n");
    runGate(runPath, workbench, "final_review_surface_scan");
    writeFileSync(join(runPath, "citation-report.md"), "# Citation review\n\n## Discovery provenance\n\nWikipedia was discovery-only.\n\n## Validation\n\nWikipedia leaked here.\n");
    assert.throws(() => runGate(runPath, workbench, "final_review_surface_scan"), /forbidden discovery\/wiki residue/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses a residue-contaminated article-wide packet", () => {
  const { root, workbench, run: runPath } = fixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    runGate(runPath, workbench, "remap");
    runGate(runPath, workbench, "section_rechecks");
    runGate(runPath, workbench, "proactive_scan");
    runGate(runPath, workbench, "article_wide_packet");
    writeScript(join(workbench, "scripts", "sanitize.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      writeFileSync(process.argv[index + 1] + '/article-wide-input.json', '{"text":"https://wikipedia.org/wiki/Bad"}\\n');
    `);
    runGate(runPath, workbench, "article_wide_sanitize");
    assert.throws(
      () => runGate(runPath, workbench, "article_wide_residue_scan"),
      /Deterministic gate failed: article_wide_residue_scan/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supports a proposal runId distinct from slug and preflights by --run", () => {
  const { root, workbench, run: runPath, runId } = localProposalFixture();
  try {
    const manifest = JSON.parse(run("init", "--run", runPath, "--slug", "example-drug"));
    assert.equal(manifest.runId, runId);
    assert.equal(manifest.slug, "example-drug");
    assert.equal(manifest.promotionAllowed, false);
    const gate = JSON.parse(runGate(runPath, workbench, "preflight"));
    assert.deepEqual(gate.command.slice(-3), ["--", "--run", `runs/${runId}`]);
    assert.ok(gate.snapshot.proposalInput["proposal-input/proposal.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("enforces one-section, non-apply-bound local proposal tasks", async (t) => {
  await t.test("multiple sections", () => {
    const { root, run: runPath } = localProposalFixture();
    try {
      const task = JSON.parse(readFileSync(join(runPath, "citation-task.json"), "utf8"));
      task.article.citableSections.legality = "extra prose";
      writeFileSync(join(runPath, "citation-task.json"), JSON.stringify(task));
      assert.throws(() => run("init", "--run", runPath), /exactly its bound section/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await t.test("apply-bound provenance", () => {
    const { root, run: runPath } = localProposalFixture();
    try {
      const task = JSON.parse(readFileSync(join(runPath, "citation-task.json"), "utf8"));
      task.provenance.applyBound = true;
      writeFileSync(join(runPath, "citation-task.json"), JSON.stringify(task));
      assert.throws(() => run("init", "--run", runPath), /non-apply-bound/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("proposal-input mutation invalidates downstream gates", () => {
  const { root, workbench, run: runPath } = localProposalFixture();
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    for (const section of sections) run("section", "--run", runPath, "--section", section, "--status", "missing_preserve_original");
    writeFileSync(join(runPath, "proposal-input", "openrouter-response.txt"), "mutated\n");
    assert.throws(() => runGate(runPath, workbench, "remap"), /artifacts changed after preflight/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finalization requires unchanged task, manifest, and draft proposal bindings", async (t) => {
  await t.test("absent draft binding", () => {
    const { root, workbench, run: runPath } = localProposalFixture();
    try {
      run("init", "--run", runPath);
      writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
        import { writeFileSync } from 'node:fs';
        const index = process.argv.indexOf('--run');
        writeFileSync(process.argv[index + 1] + '/citation-draft.json', '{"citationMode":"marker_only"}\\n');
      `);
      completeLocalProposalGates(runPath, workbench);
      assert.throws(() => run("finalize", "--run", runPath), /bindings must match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await t.test("altered draft binding", () => {
    const { root, workbench, run: runPath } = localProposalFixture();
    try {
      run("init", "--run", runPath);
      writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
        import { readFileSync, writeFileSync } from 'node:fs';
        const index = process.argv.indexOf('--run');
        const run = process.argv[index + 1];
        const task = JSON.parse(readFileSync(run + '/citation-task.json', 'utf8'));
        writeFileSync(run + '/citation-draft.json', JSON.stringify({ citationMode: 'marker_only', provenance: task.provenance, promotion: task.promotion, inputBinding: { ...task.inputBinding, section: 'legality' } }) + '\\n');
      `);
      completeLocalProposalGates(runPath, workbench);
      assert.throws(() => run("finalize", "--run", runPath), /bindings must match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function scopedFixture(selectedSections, sectionScopeSections) {
  const base = fixture();
  const taskPath = join(base.run, "citation-task.json");
  const task = JSON.parse(readFileSync(taskPath, "utf8"));
  task.selectedSections = selectedSections;
  task.sectionScope = {
    source: "explicit",
    frozenAt: "2026-07-18T00:00:00.000Z",
    sections: sectionScopeSections,
  };
  writeFileSync(taskPath, JSON.stringify(task));
  return base;
}

test("scoped run pre-seeds skip statuses and finalizes with only selected sections checked", () => {
  const { root, workbench, run: runPath } = scopedFixture(["pharmacology", "tolerance"], {
    summary: { selected: false, skipReason: "already_cited" },
    pharmacology: { selected: true, skipReason: null },
    tolerance: { selected: true, skipReason: null },
    harm_potential: { selected: false, skipReason: "not_selected" },
    history_culture: { selected: false, skipReason: "not_selected" },
    legality: { selected: false, skipReason: "not_selected" },
  });
  try {
    const initialized = JSON.parse(run("init", "--run", runPath));
    assert.deepEqual(initialized.selectedSections, ["pharmacology", "tolerance"]);
    assert.equal(initialized.sections.summary.status, "skipped_already_cited");
    assert.equal(initialized.sections.summary.skipReason, "already_cited");
    assert.equal(initialized.sections.harm_potential.status, "not_selected");
    assert.equal(initialized.sections.pharmacology.status, null);

    runGate(runPath, workbench, "preflight");
    mkdirSync(join(runPath, "sections"), { recursive: true });
    for (const section of ["pharmacology", "tolerance"]) {
      writeFileSync(join(runPath, "sections", `${section}.json`), "{}\n");
      run("check-section", "--run", runPath, "--workbench", workbench, "--section", section);
    }
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), "{}\n");
    for (const gate of ["article_wide_check", "assemble_draft", "validate", "validate_patches", "final_review_surface_scan"]) {
      runGate(runPath, workbench, gate);
    }
    const finalized = JSON.parse(run("finalize", "--run", runPath));
    assert.equal(finalized.outcome, "needs_review");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoped run rejects worker output for a non-selected section", () => {
  const { root, workbench, run: runPath } = scopedFixture(["pharmacology"], {});
  try {
    run("init", "--run", runPath);
    runGate(runPath, workbench, "preflight");
    mkdirSync(join(runPath, "sections"), { recursive: true });
    writeFileSync(join(runPath, "sections", "summary.json"), "{}\n");
    assert.throws(
      () => run("check-section", "--run", runPath, "--workbench", workbench, "--section", "summary"),
      /not in this run's selectedSections/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoped init rejects invalid or empty selected sections", () => {
  const invalid = scopedFixture(["pharmacology", "pharmacology"], {});
  try {
    assert.throws(() => run("init", "--run", invalid.run), /duplicate entry/);
  } finally {
    rmSync(invalid.root, { recursive: true, force: true });
  }
  const unknown = scopedFixture(["nope"], {});
  try {
    assert.throws(() => run("init", "--run", unknown.run), /not a citable section/);
  } finally {
    rmSync(unknown.root, { recursive: true, force: true });
  }
  const emptySelected = fixture();
  try {
    const taskPath = join(emptySelected.run, "citation-task.json");
    const task = JSON.parse(readFileSync(taskPath, "utf8"));
    task.article.citableSections.pharmacology = null;
    task.selectedSections = ["pharmacology"];
    writeFileSync(taskPath, JSON.stringify(task));
    assert.throws(() => run("init", "--run", emptySelected.run), /Selected section pharmacology is empty/);
  } finally {
    rmSync(emptySelected.root, { recursive: true, force: true });
  }
});

test("scoped run detects selectedSections drift between init and gates", () => {
  const { root, workbench, run: runPath } = scopedFixture(["pharmacology"], {});
  try {
    run("init", "--run", runPath);
    const taskPath = join(runPath, "citation-task.json");
    const task = JSON.parse(readFileSync(taskPath, "utf8"));
    task.selectedSections = ["pharmacology", "tolerance"];
    writeFileSync(taskPath, JSON.stringify(task));
    assert.throws(() => runGate(runPath, workbench, "preflight"), /selectedSections do not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoped finalization rejects a draft whose selectedSections do not match", () => {
  const { root, workbench, run: runPath } = scopedFixture(["pharmacology"], {});
  try {
    run("init", "--run", runPath);
    writeScript(join(workbench, "scripts", "assemble-draft.mjs"), `
      import { writeFileSync } from 'node:fs';
      const index = process.argv.indexOf('--run');
      writeFileSync(process.argv[index + 1] + '/citation-draft.json', JSON.stringify({ citationMode: 'marker_only', selectedSections: ['pharmacology', 'tolerance'] }) + '\\n');
      writeFileSync(process.argv[index + 1] + '/citation-report.md', '# Citation review\\n\\nClean.\\n');
    `);
    runGate(runPath, workbench, "preflight");
    mkdirSync(join(runPath, "sections"), { recursive: true });
    writeFileSync(join(runPath, "sections", "pharmacology.json"), "{}\n");
    run("check-section", "--run", runPath, "--workbench", workbench, "--section", "pharmacology");
    for (const gate of ["remap", "section_rechecks", "proactive_scan", "article_wide_packet", "article_wide_sanitize", "article_wide_residue_scan"]) {
      runGate(runPath, workbench, gate);
    }
    writeFileSync(join(runPath, "article-wide.json"), "{}\n");
    for (const gate of ["article_wide_check", "assemble_draft", "validate", "validate_patches", "final_review_surface_scan"]) {
      runGate(runPath, workbench, gate);
    }
    assert.throws(() => run("finalize", "--run", runPath), /draft selectedSections do not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
