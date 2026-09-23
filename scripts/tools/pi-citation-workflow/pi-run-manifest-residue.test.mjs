import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  sections,
  writeScript,
  fixture,
  run,
  runGate,
  prepareFinalizableLiveRun,
} from "./pi-run-manifest.fixtures.mjs";

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
