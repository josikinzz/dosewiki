#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worklistPath = path.join(repoRoot, "docs/audits/generated-section-plagiarism-worklist.json");
const proposalDir = path.join(repoRoot, "docs/audits/generated-section-plagiarism-worker-proposals");
const outputPath = path.join(repoRoot, "docs/audits/generated-section-plagiarism-proposals.json");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function validateProposal(item, proposal) {
  const failures = [];
  for (const key of ["id", "slug", "fieldPath"]) {
    if (proposal[key] !== item[key]) {
      failures.push(`${item.id}: ${key} mismatch (${proposal[key]} !== ${item[key]})`);
    }
  }

  if (typeof proposal.replacementValue !== "string" || proposal.replacementValue.trim().length === 0) {
    failures.push(`${item.id}: replacementValue missing or empty`);
  }

  if (normalizeText(proposal.replacementValue) === normalizeText(item.currentValue)) {
    failures.push(`${item.id}: replacementValue is unchanged`);
  }

  const matchedPhrase = normalizeText(item.matchedPhrase);
  if (matchedPhrase && normalizeText(proposal.replacementValue).includes(matchedPhrase)) {
    failures.push(`${item.id}: replacementValue still contains matchedPhrase`);
  }

  return failures;
}

const worklist = readJson(worklistPath);
const byId = new Map(worklist.workItems.map((item) => [item.id, item]));
const proposals = [];
const failures = [];

for (let batch = 1; batch <= 8; batch += 1) {
  const batchLabel = String(batch).padStart(2, "0");
  const proposalPath = path.join(proposalDir, `batch-${batchLabel}.proposals.json`);
  if (!existsSync(proposalPath)) {
    failures.push(`batch-${batchLabel}: proposal file missing`);
    continue;
  }

  const batchFile = readJson(proposalPath);
  if (!Array.isArray(batchFile.proposals)) {
    failures.push(`batch-${batchLabel}: proposals must be an array`);
    continue;
  }

  for (const proposal of batchFile.proposals) {
    const item = byId.get(proposal.id);
    if (!item) {
      failures.push(`${proposal.id}: proposal id missing from worklist`);
      continue;
    }
    failures.push(...validateProposal(item, proposal));
    proposals.push({
      id: proposal.id,
      slug: proposal.slug,
      fieldPath: proposal.fieldPath,
      replacementValue: proposal.replacementValue,
      rationale: proposal.rationale ?? "",
    });
  }
}

const proposalIds = new Set(proposals.map((proposal) => proposal.id));
for (const item of worklist.workItems) {
  if (!proposalIds.has(item.id)) {
    failures.push(`${item.id}: missing proposal`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceWorklist: path.relative(repoRoot, worklistPath),
    count: proposals.length,
    proposals,
  }, null, 2)}\n`,
);

console.log(JSON.stringify({ count: proposals.length, outputPath: path.relative(repoRoot, outputPath) }, null, 2));
