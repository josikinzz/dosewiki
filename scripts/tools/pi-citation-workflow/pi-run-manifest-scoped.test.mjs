import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  sections,
  writeScript,
  fixture,
  localProposalFixture,
  run,
  runGate,
  completeLocalProposalGates,
  scopedFixture,
} from "./pi-run-manifest.fixtures.mjs";

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
