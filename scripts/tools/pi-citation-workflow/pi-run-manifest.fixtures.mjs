/**
 * Shared workbench fixtures and CLI drivers for the Pi run manifest tests.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./pi-run-manifest.mjs", import.meta.url).pathname;
export const sections = ["summary", "pharmacology", "tolerance", "harm_potential", "history_culture", "legality"];

export function writeScript(path, source) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, source);
}

export function fixture() {
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

export function localProposalFixture() {
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

export function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function run(...args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

export function runGate(runPath, workbench, gate) {
  return run("run-gate", "--run", runPath, "--workbench", workbench, "--gate", gate);
}

export function prepareReconciliation(runPath, workbench) {
  run("init", "--run", runPath);
  runGate(runPath, workbench, "preflight");
  mkdirSync(join(runPath, "sections"), { recursive: true });
  for (const section of sections) {
    writeFileSync(join(runPath, "sections", `${section}.json`), "{}\n");
    run("check-section", "--run", runPath, "--workbench", workbench, "--section", section);
  }
}

export function completeLocalProposalGates(runPath, workbench) {
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

export function prepareFinalizableLiveRun(runPath, workbench) {
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

export function scopedFixture(selectedSections, sectionScopeSections) {
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
