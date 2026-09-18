#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "./public-prose-artifact-language-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {
    publicWorklist: null,
    editorWorklist: null,
    proposals: [],
    publicOut: null,
    editorOut: null,
    report: null,
  };

  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (key === "proposal" || key === "proposals") {
      options.proposals.push(...match[2].split(",").map((entry) => entry.trim()).filter(Boolean));
    } else {
      options[key] = match[2];
    }
  }

  for (const key of ["publicWorklist", "editorWorklist", "publicOut", "editorOut", "report"]) {
    if (!options[key]) throw new Error(`Provide --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}=<path>`);
  }
  if (options.proposals.length === 0) throw new Error("Provide at least one --proposal=<path>");
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function writeArtifact(filePath, value) {
  const absolutePath = path.resolve(repoRoot, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fieldKey(item) {
  return `${item.slug}\n${item.fieldPath}`;
}

function loadProposalItems(paths) {
  return paths.flatMap((proposalPath) => {
    const doc = readJson(proposalPath);
    if (!Array.isArray(doc.proposals)) {
      throw new Error(`${proposalPath}: proposals must be an array`);
    }
    return doc.proposals.map((proposal) => ({ ...proposal, proposalPath }));
  });
}

function validateProposalShape(proposal) {
  const errors = [];
  for (const key of ["id", "slug", "fieldPath", "replacementValue"]) {
    if (typeof proposal[key] !== "string" || proposal[key].trim().length === 0) {
      errors.push(`${proposal.id ?? "unknown"}: ${key} must be a non-empty string`);
    }
  }
  return errors;
}

function buildCombinedPublicProposals(worklist, proposalItems) {
  const byId = new Map();
  const errors = [];

  for (const proposal of proposalItems) {
    for (const error of validateProposalShape(proposal)) errors.push(error);
    if (byId.has(proposal.id)) errors.push(`${proposal.id}: duplicate proposal id`);
    byId.set(proposal.id, proposal);
  }

  const proposals = [];
  for (const item of worklist.workItems) {
    const proposal = byId.get(item.id);
    if (!proposal) {
      errors.push(`${item.id}: missing proposal`);
      continue;
    }
    if (proposal.slug !== item.slug) errors.push(`${item.id}: slug mismatch ${proposal.slug} !== ${item.slug}`);
    if (proposal.fieldPath !== item.fieldPath) {
      errors.push(`${item.id}: fieldPath mismatch ${proposal.fieldPath} !== ${item.fieldPath}`);
    }
    proposals.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      fieldPath: item.fieldPath,
      replacementValue: proposal.replacementValue,
      rationale: proposal.rationale ?? "Removes named-source attribution while preserving the field meaning.",
      classification: item.classification,
      matchedPhrases: item.matchedPhrases,
      proposalPath: proposal.proposalPath,
    });
  }

  const worklistIds = new Set(worklist.workItems.map((item) => item.id));
  for (const proposal of proposalItems) {
    if (!worklistIds.has(proposal.id)) {
      errors.push(`${proposal.id}: proposal has no matching public worklist item`);
    }
  }

  return { proposals, errors };
}

function buildEditorProposals(editorWorklist, publicProposals) {
  const byField = new Map(publicProposals.map((proposal) => [fieldKey(proposal), proposal]));
  const errors = [];
  const proposals = [];

  for (const item of editorWorklist.workItems) {
    const publicProposal = byField.get(fieldKey(item));
    if (!publicProposal) {
      errors.push(`${item.id}: no public proposal for editor field ${item.slug} ${item.fieldPath}`);
      continue;
    }
    proposals.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      fieldPath: item.fieldPath,
      replacementValue: publicProposal.replacementValue,
      rationale: publicProposal.rationale,
      classification: item.classification,
      matchedPhrases: item.matchedPhrases,
      sourcePublicProposalId: publicProposal.id,
    });
  }

  return { proposals, errors };
}

function auditProposalText(proposals, label) {
  const input = { proposals };
  assertNoPublicProseArtifactLanguage(input, { sourcePath: label });
  assertNoPublicProseNamedSourceAttribution(input, { sourcePath: label });
}

function buildProposalDoc({ deployment, sourceWorklistPath, proposals }) {
  return {
    generatedAt: new Date().toISOString(),
    remediationScope: "named_source_attribution",
    deployment,
    sourceWorklistPath,
    count: proposals.length,
    proposals,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const publicWorklist = readJson(options.publicWorklist);
  const editorWorklist = readJson(options.editorWorklist);
  const proposalItems = loadProposalItems(options.proposals);

  const publicCombined = buildCombinedPublicProposals(publicWorklist, proposalItems);
  const editorCombined = buildEditorProposals(editorWorklist, publicCombined.proposals);
  const errors = [...publicCombined.errors, ...editorCombined.errors];
  if (errors.length > 0) {
    throw new Error(`Proposal aggregation failed:\n${errors.join("\n")}`);
  }

  auditProposalText(publicCombined.proposals, options.publicOut);
  auditProposalText(editorCombined.proposals, options.editorOut);

  const publicDoc = buildProposalDoc({
    deployment: "publicRead",
    sourceWorklistPath: options.publicWorklist,
    proposals: publicCombined.proposals,
  });
  const editorDoc = buildProposalDoc({
    deployment: "editorDefault",
    sourceWorklistPath: options.editorWorklist,
    proposals: editorCombined.proposals,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    remediationScope: "named_source_attribution",
    publicProposalCount: publicDoc.count,
    editorProposalCount: editorDoc.count,
    sourceProposalPaths: options.proposals,
    publicOut: options.publicOut,
    editorOut: options.editorOut,
    audit: {
      artifactLanguage: "passed",
      namedSourceAttribution: "passed",
    },
  };

  writeArtifact(options.publicOut, publicDoc);
  writeArtifact(options.editorOut, editorDoc);
  writeArtifact(options.report, report);
  console.log(JSON.stringify(report, null, 2));
}

main();
