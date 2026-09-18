import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import test from "node:test";

import {
  attachManifestDigest,
  buildSectionProposal,
  canonicalHash,
  sha256Text,
  topLevelFieldHashes,
} from "../../batch/proposal/core.mjs";
import {
  canonicalizeSourcePacketReferenceIds,
  parseLocalProposalArgs,
  prepareLocalProposalRun,
} from "./prepare-local-proposal-run.mjs";

const roots = [];
test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeReadonly(path, value) {
  writeFileSync(path, value, { mode: 0o444 });
  chmodSync(path, 0o444);
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fixture(section = "summary") {
  const root = mkdtempSync(resolve(tmpdir(), "local-proposal-bridge-"));
  roots.push(root);
  const repoRoot = resolve(root, "repo");
  const workbench = resolve(root, "workbench");
  const artifactDir = resolve(repoRoot, "notes-and-plans/exports/batch-proposals/2c-b", section, "artifact");
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(resolve(workbench, "inputs"), { recursive: true });
  mkdirSync(resolve(workbench, "runs"), { recursive: true });
  mkdirSync(resolve(workbench, "trackers"), { recursive: true });
  writeFileSync(resolve(workbench, "package.json"), JSON.stringify({ type: "module" }));
  const trackerPath = resolve(workbench, "trackers/citation-queue.json");
  writeFileSync(trackerPath, '{"canary":"unchanged"}\n');

  const baseArticle = {
    slug: "2c-b",
    title: "2C-B",
    summary: "Old summary.",
    pharmacology: { pharmacodynamics: "Old pharmacology.", nested: ["exact", "shape"] },
    dosage: { routes: [] },
    duration: { routes: [] },
    legality: null,
  };
  const generatedValue = section === "summary"
    ? "Proposal summary with exact whitespace.\n\nSecond paragraph."
    : { pharmacodynamics: "Proposal pharmacology.", nested: ["exact", "shape"] };
  const targetArticle = { _id: "article-id", _creationTime: 1, ...baseArticle };
  const manifest = attachManifestDigest({
    schemaVersion: "section-proposal-manifest-v2",
    adapterVersion: `${section}-proposal-v1`,
    slug: "2c-b",
    section,
    capturedAt: "2026-07-01T00:00:00.000Z",
    deployments: {
      source: { identity: "localhost/source-test", fingerprint: "localhost/source-test" },
      target: { identity: "localhost/target-test", fingerprint: "localhost/target-test" },
    },
    targetArticle,
    targetArticleHash: canonicalHash(targetArticle),
    targetArticleContentHash: canonicalHash(baseArticle),
    targetTopLevelFieldHashes: topLevelFieldHashes(targetArticle),
    prompt: { exactContent: "Exact prompt.\n", contentHash: sha256Text("Exact prompt.\n") },
    messages: {
      system: "System prompt.",
      user: "User prompt.",
      systemHash: sha256Text("System prompt."),
      userHash: sha256Text("User prompt."),
    },
  });
  const manifestPath = resolve(artifactDir, "target-manifest.json");
  const rawPath = resolve(artifactDir, "openrouter-response.txt");
  const proposalPath = resolve(artifactDir, "proposal.json");
  const rawResponse = `${section}: generated response bytes\n`;
  writeReadonly(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeReadonly(rawPath, rawResponse);

  const proposal = buildSectionProposal({
    slug: "2c-b",
    targetDeploymentFingerprint: "localhost/target-test",
    targetArticle: baseArticle,
    sectionKey: section,
    generatedValue,
    manifestDigest: manifest.manifestDigest,
    manifestPath: relative(repoRoot, manifestPath),
    rawResponse,
    publicationProfile: section,
    publicationFields: section === "pharmacology" ? ["pharmacology", "dosage", "duration"] : [section],
  });
  const linked = {
    ...proposal,
    artifactPaths: {
      manifest: relative(repoRoot, manifestPath),
      rawResponse: relative(repoRoot, rawPath),
      json: relative(repoRoot, proposalPath),
      markdown: relative(repoRoot, resolve(artifactDir, "proposal.md")),
    },
  };
  writeReadonly(proposalPath, `${JSON.stringify(linked, null, 2)}\n`);

  writeFileSync(resolve(workbench, "inputs/2c-b-full.json"), `${JSON.stringify({
    schemaVersion: "dosewiki_citation_task_v1",
    taskId: "2c-b",
    article: {
      slug: "2c-b",
      title: "2C-B",
      citableSections: {
        summary: "LIVE ARTICLE PROSE MUST NOT COPY",
        pharmacology: { pharmacodynamics: "LIVE ARTICLE PROSE MUST NOT COPY" },
        tolerance: "LIVE ARTICLE PROSE MUST NOT COPY",
      },
      targets: [{ claimKey: "live-target", claimText: "LIVE ARTICLE PROSE MUST NOT COPY" }],
    },
    sourcePacket: {
      compiledSources: [{ id: "source-1", content: "Source packet bytes." }],
      allowedReferences: [
        { id: "canonical-paper", doi: "10.1000/example", title: "Allowed paper" },
      ],
      wikipediaCitationPacket: {
        references: [
          { id: "canonical-paper", doi: "10.1000/example", title: "Wikipedia candidate" },
        ],
      },
      discoveryPackets: {
        psychonautwiki: {
          role: "discovery_only",
          references: [
            { id: "duplicate-paper", doi: "10.1000/EXAMPLE", title: "Discovery candidate" },
          ],
        },
      },
    },
    instructions: { allowLiveWebResearch: true, markerStyle: "[cite:reference-id]" },
  }, null, 2)}\n`);

  return { root, repoRoot, workbench, artifactDir, proposalPath, manifestPath, rawPath, trackerPath, linked, generatedValue };
}

function rewriteJson(path, transform) {
  chmodSync(path, 0o644);
  const value = json(path);
  transform(value);
  writeReadonly(path, `${JSON.stringify(value, null, 2)}\n`);
}

for (const section of ["summary", "pharmacology"]) {
  test(`prepares an exact, isolated ${section} proposal run`, () => {
    const fx = fixture(section);
    const trackerBefore = readFileSync(fx.trackerPath);
    const result = prepareLocalProposalRun({
      proposalPath: relative(fx.repoRoot, fx.proposalPath),
      repoRoot: fx.repoRoot,
      workbench: fx.workbench,
    });

    assert.match(
      result.runId,
      new RegExp(`^2c-b--proposal-${section}--${fx.linked.artifactDigest.slice(0, 12)}--${result.task.bridge.inputDigest.slice(0, 12)}--attempt-[0-9a-f-]{36}$`),
    );
    assert.deepEqual(result.task.article.citableSections[section], fx.generatedValue);
    for (const [key, value] of Object.entries(result.task.article.citableSections)) {
      if (key !== section) assert.equal(value, null);
    }
    assert.equal(
      result.task.sourcePacket.discoveryPackets.psychonautwiki.references[0].id,
      "canonical-paper",
    );
    assert.deepEqual(result.task.bridge.canonicalReferenceRemaps, [{
      path: "sourcePacket.discoveryPackets.psychonautwiki.references[0]",
      identity: "doi:10.1000/example",
      from: "duplicate-paper",
      to: "canonical-paper",
    }]);
    assert.equal(result.task.instructions.allowLiveWebResearch, true);
    assert.doesNotMatch(JSON.stringify(result.task), /LIVE ARTICLE PROSE MUST NOT COPY|live-target/);
    assert.equal(result.task.provenance.applyBound, false);
    assert.equal(result.task.promotion.allowed, false);
    assert.deepEqual(json(resolve(result.runPath, "proposal-input/binding.json")), result.binding);
    assert.deepEqual(readFileSync(fx.trackerPath), trackerBefore);
    assert.equal(createHash("sha256").update(readFileSync(resolve(result.runPath, "proposal-input/proposal.json"))).digest("hex"), result.binding.proposalJsonSha256);
  });
}

test("canonicalizes task reference candidates by the workbench identity order", () => {
  const result = canonicalizeSourcePacketReferenceIds({
    allowedReferences: [
      { id: "doi-canonical", doi: "10.1000/PAPER" },
      { id: "isbn-canonical", isbn: "978-1" },
      { id: "pmid-canonical", pmid: "123" },
      { id: "url-canonical", url: "https://example.test/source/" },
    ],
    wikipediaCitationPacket: {
      references: [{ id: "doi-canonical", doi: "10.1000/paper" }],
    },
    discoveryPackets: {
      wiki: {
        references: [
          { id: "doi-duplicate", doi: "10.1000/paper" },
          { id: "isbn-duplicate", isbn: "978-1" },
          { id: "pmid-duplicate", pmid: "123" },
          { id: "url-duplicate", url: "https://example.test/source" },
        ],
      },
    },
  });

  assert.deepEqual(
    result.sourcePacket.discoveryPackets.wiki.references.map((reference) => reference.id),
    ["doi-canonical", "isbn-canonical", "pmid-canonical", "url-canonical"],
  );
  assert.equal(result.remaps.length, 4);
});

test("rejects tampered proposal, digest, manifest, and raw response artifacts", async (t) => {
  await t.test("proposal body", () => {
    const fx = fixture();
    rewriteJson(fx.proposalPath, (proposal) => { proposal.after.value = "tampered"; });
    assert.throws(() => prepareLocalProposalRun({ proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench }), /after\.value|artifactDigest/);
  });
  await t.test("artifact digest", () => {
    const fx = fixture();
    rewriteJson(fx.proposalPath, (proposal) => { proposal.artifactDigest = "0".repeat(64); });
    assert.throws(() => prepareLocalProposalRun({ proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench }), /artifactDigest/);
  });
  await t.test("manifest", () => {
    const fx = fixture();
    rewriteJson(fx.manifestPath, (manifest) => { manifest.section = "pharmacology"; });
    assert.throws(() => prepareLocalProposalRun({ proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench }), /Manifest digest mismatch/);
  });
  await t.test("raw response", () => {
    const fx = fixture();
    chmodSync(fx.rawPath, 0o644);
    writeReadonly(fx.rawPath, "tampered raw bytes\n");
    assert.throws(() => prepareLocalProposalRun({ proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench }), /rawResponseHash/);
  });
});

test("rejects mismatched identity, scope, guard, paths, and pre-existing markers", async (t) => {
  for (const [name, mutate, pattern] of [
    ["slug", (proposal) => { proposal.proposedArticle.slug = "lsd"; }, /slug/],
    ["section", (proposal) => { proposal.section = "legality"; }, /approvedPaths|section/],
    ["guard", (proposal) => { proposal.guard.accepted = false; }, /guard\.accepted/],
    ["path", (proposal) => { proposal.artifactPaths.rawResponse = "../outside.txt"; }, /beneath|outside|does not exist/],
    ["marker", (proposal) => {
      proposal.after.value = "Proposal[cite:existing] summary.";
      proposal.proposedArticle.summary = proposal.after.value;
    }, /pre-existing/],
  ]) {
    await t.test(name, () => {
      const fx = fixture();
      rewriteJson(fx.proposalPath, mutate);
      assert.throws(() => prepareLocalProposalRun({ proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench }), pattern);
    });
  }
});

test("rejects outside-root and symbolic-link proposal paths", () => {
  const fx = fixture();
  const outside = resolve(fx.root, "outside-proposal.json");
  writeFileSync(outside, "{}\n");
  assert.throws(() => prepareLocalProposalRun({ proposalPath: outside, repoRoot: fx.repoRoot, workbench: fx.workbench }), /beneath|outside/);

  const link = resolve(fx.artifactDir, "proposal-link.json");
  symlinkSync(outside, link);
  assert.throws(() => prepareLocalProposalRun({ proposalPath: link, repoRoot: fx.repoRoot, workbench: fx.workbench }), /symbolic link|outside/);
});

test("rejects write, confirmation, queue, and apply flags", () => {
  for (const flag of ["--write", "--confirm-citation-write", "--queue=next", "--apply"]) {
    assert.throws(() => parseLocalProposalArgs(["--proposal", "proposal.json", flag]), /Forbidden local-proposal flag/);
  }
});

function prepareInChild(options) {
  const moduleUrl = new URL("./prepare-local-proposal-run.mjs", import.meta.url).href;
  const source = `import { prepareLocalProposalRun } from ${JSON.stringify(moduleUrl)};\n` +
    `console.log(JSON.stringify(prepareLocalProposalRun(${JSON.stringify(options)})));`;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `child exited ${code}`));
      else resolvePromise(JSON.parse(stdout));
    });
  });
}

test("reserves isolated attempt runs for concurrent and retry proposal preparation", async () => {
  const fx = fixture();
  const options = { proposalPath: fx.proposalPath, repoRoot: fx.repoRoot, workbench: fx.workbench };
  const [first, second] = await Promise.all([prepareInChild(options), prepareInChild(options)]);
  const retry = prepareLocalProposalRun(options);

  assert.notEqual(first.runId, second.runId);
  assert.notEqual(first.runId, retry.runId);
  assert.notEqual(second.runId, retry.runId);
  assert.deepEqual(first.binding, second.binding);
  assert.deepEqual(first.binding, retry.binding);
  for (const result of [first, second, retry]) {
    assert.equal(json(resolve(result.runPath, "citation-task.json")).inputBinding.artifactDigest, fx.linked.artifactDigest);
    assert.equal(json(resolve(result.runPath, "proposal-input/binding.json")).artifactDigest, fx.linked.artifactDigest);
  }
});
