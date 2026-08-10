import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildEvidenceBundleFromFiles,
  DEFAULT_EVIDENCE_BUNDLE,
} from "./build-citation-author-repair-evidence-bundle.mjs";

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const sourceProposalPath = path.resolve("tmp/citation-author-repair-proposals/current-reviewed-residual-20260810T005325Z.json");
const reviewedProposalAvailable = fs.existsSync(sourceProposalPath);

function fixtureWithProposal(transform = ({ bytes, lineage }) => ({ bytes, lineage })) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "citation-author-evidence-"));
  temporary.push(directory);
  const proposalPath = path.join(directory, "reviewed-proposal.json");
  const lineagePath = path.join(directory, "lineage.json");
  const outputPath = path.join(directory, "evidence.json");
  const lineage = JSON.parse(fs.readFileSync(path.resolve("scripts/data/tracked/citation-author-repair-lineage.json"), "utf8"));
  const bytes = fs.readFileSync(sourceProposalPath);
  const transformed = transform({ bytes, lineage, proposalPath });
  const reviewedWave = transformed.lineage.waves.find((wave) => wave.name === "independently-reviewed-residual");
  reviewedWave.sourceArtifacts.proposal.path = proposalPath;
  fs.writeFileSync(proposalPath, transformed.bytes);
  fs.writeFileSync(lineagePath, `${JSON.stringify(transformed.lineage, null, 2)}\n`);
  return { lineagePath, outputPath, proposalPath };
}

describe("tracked citation-author evidence bundle", () => {
  it.skipIf(!reviewedProposalAvailable)("rebuilds deterministically from the lineage-declared hash-bound proposal", () => {
    const { lineagePath, outputPath } = fixtureWithProposal(({ bytes, lineage }) => ({ bytes, lineage }));
    const rebuilt = buildEvidenceBundleFromFiles({ lineagePath, outputPath });
    const tracked = JSON.parse(fs.readFileSync(DEFAULT_EVIDENCE_BUNDLE, "utf8"));
    expect(rebuilt).toEqual(tracked);
    expect(rebuilt.rows).toHaveLength(759);
    expect(rebuilt.rows.filter((row) => row.provenance.every((entry) => entry.kind === "fetched"))).toHaveLength(74);
    expect(rebuilt.rows.filter((row) => row.provenance.every((entry) => entry.kind === "inspected"))).toHaveLength(685);
    expect(rebuilt.bundleDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(fs.readFileSync(outputPath))).toBe(sha256(fs.readFileSync(DEFAULT_EVIDENCE_BUNDLE)));
  });

  it.skipIf(!reviewedProposalAvailable)("rejects proposal bytes that do not match the lineage-declared file hash", () => {
    const { lineagePath, outputPath } = fixtureWithProposal(({ bytes, lineage }) => ({
      bytes: Buffer.concat([bytes, Buffer.from("\n")]),
      lineage,
    }));
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/proposal file hash mismatch/i);
  });

  it.skipIf(!reviewedProposalAvailable)("rejects a proposal whose canonical artifact digest is invalid", () => {
    const { lineagePath, outputPath } = fixtureWithProposal(({ bytes, lineage }) => {
      const proposal = JSON.parse(bytes.toString("utf8"));
      proposal.summary.articleCount += 1;
      const changedBytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
      const reviewedWave = lineage.waves.find((wave) => wave.name === "independently-reviewed-residual");
      reviewedWave.sourceArtifacts.proposal.fileSha256 = sha256(changedBytes);
      return { bytes: changedBytes, lineage };
    });
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/proposal canonical artifact digest mismatch/i);
  });
});
