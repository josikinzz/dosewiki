#!/usr/bin/env node
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createDataOpsRunContext,
  getFlagValue,
  hasFlag,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

const ARTIFACT_VERSION = 1;
const DEFAULT_OUTPUT_DIRECTORY = "tmp/citation-author-repair-review-queues";
const MIN_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;

export const RESIDUAL_REVIEW_GUIDE = Object.freeze({
  identifier_disagreement: "Compare DOI and PMID against authoritative records; do not merge or edit until both identifiers resolve to the same work.",
  title_disagreement: "Compare the stored and provider titles, allowing only punctuation or subtitle variation; reject a different work.",
  missing_identifier_or_authors: "Inspect the primary source for a stable DOI/PMID and an explicit author byline; never infer authors from the title or domain.",
  organizational_ambiguity: "Determine whether authorship is organizational, a named collaboration, or individual; preserve the source's explicit attribution.",
  possible_duplicate: "Compare canonical DOI, PMID, normalized title, and URL with sibling references before choosing the canonical record.",
  source_inspection: "Open the authoritative source and record what was inspected; leave unresolved when the source is unavailable or metadata remains ambiguous.",
});

const REASON_TO_GUIDE = Object.freeze({
  identifier_conflict: "identifier_disagreement",
  provider_disagreement: "identifier_disagreement",
  title_conflict: "title_disagreement",
  missing_stable_identifier: "missing_identifier_or_authors",
  no_authors_returned: "missing_identifier_or_authors",
  institutional_authorship: "organizational_ambiguity",
  ambiguous_authorship: "organizational_ambiguity",
  organizational_authorship: "organizational_ambiguity",
  duplicate_reference: "possible_duplicate",
  reference_duplicate: "possible_duplicate",
  possible_duplicate: "possible_duplicate",
  provider_failure: "source_inspection",
  source_inspection_required: "source_inspection",
});

function artifactPayload(artifact) {
  const { artifactSha256: _artifactSha256, ...payload } = artifact;
  return payload;
}

export function validateCitationAuthorRepairProposal(proposal) {
  if (proposal?.artifactType !== "citation_author_repair_proposal" || proposal?.artifactVersion !== 1) {
    throw new Error("The proposal is not a supported immutable citation-author repair artifact.");
  }
  if (proposal.sourceKind === "independently_reviewed_residual") {
    throw new Error("A terminal independently reviewed proposal cannot be rebuilt into another review queue.");
  }
  const computedHash = sha256Json(artifactPayload(proposal));
  if (!proposal.artifactSha256 || proposal.artifactSha256 !== computedHash) {
    throw new Error("The proposal artifact hash is missing or invalid.");
  }
  assertCitationSourceIdentity(proposal.sourceDeployment);
  if (!Array.isArray(proposal.residual)) {
    throw new Error("The proposal artifact is missing its residual queue.");
  }
  const seen = new Set();
  for (const row of proposal.residual) {
    if (!row?.key || seen.has(row.key)) {
      throw new Error(`Proposal contains a missing or duplicate residual row key: ${row?.key ?? "(missing)"}.`);
    }
    if (row.classification !== "residual" || !Array.isArray(row.reasonCodes) || row.reasonCodes.length === 0) {
      throw new Error(`Proposal residual row ${row.key} is malformed.`);
    }
    seen.add(row.key);
  }
  return proposal.residual;
}

function compareRows(left, right) {
  return String(left.slug ?? "").localeCompare(String(right.slug ?? ""))
    || String(left.key).localeCompare(String(right.key));
}

export function balancedBatchSizes(total, minSize = MIN_BATCH_SIZE, maxSize = MAX_BATCH_SIZE) {
  if (total === 0) return [];
  if (total <= maxSize) return [total];
  const batchCount = Math.ceil(total / maxSize);
  const baseSize = Math.floor(total / batchCount);
  const remainder = total % batchCount;
  if (baseSize < minSize) {
    throw new Error(`Cannot partition ${total} rows into ${minSize}–${maxSize} item batches.`);
  }
  return Array.from({ length: batchCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
}

function guideKeysForReasons(reasonCodes) {
  const keys = new Set();
  for (const reason of reasonCodes) keys.add(REASON_TO_GUIDE[reason] ?? "source_inspection");
  return [...keys].sort();
}

function batchId(proposalHash, index, rows) {
  const digest = sha256Json({ proposalHash, keys: rows.map((row) => row.key) }).slice(0, 10);
  return `citation-author-residual-${String(index + 1).padStart(3, "0")}-${digest}`;
}

export function buildCitationAuthorReviewQueue(proposal, { generatedAt = new Date().toISOString() } = {}) {
  const residual = validateCitationAuthorRepairProposal(proposal);
  const sorted = [...residual].sort(compareRows);
  const sizes = balancedBatchSizes(sorted.length);
  let offset = 0;
  const batches = sizes.map((size, index) => {
    const rows = sorted.slice(offset, offset + size);
    offset += size;
    const reasonCodes = [...new Set(rows.flatMap((row) => row.reasonCodes))].sort();
    const guideKeys = guideKeysForReasons(reasonCodes);
    return {
      batchId: batchId(proposal.artifactSha256, index, rows),
      assignment: "Assign this entire batch to one reviewer; return row-level decisions with inspected-source evidence and do not write to Postgres.",
      articleSlugs: [...new Set(rows.map((row) => row.slug))],
      reasonCodes,
      reviewInstructions: guideKeys.map((key) => ({ category: key, instruction: RESIDUAL_REVIEW_GUIDE[key] })),
      rows,
    };
  });
  const reasonCounts = sorted.flatMap((row) => row.reasonCodes).reduce((counts, reason) => {
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
  const queue = {
    artifactType: "citation_author_repair_review_queue",
    artifactVersion: ARTIFACT_VERSION,
    generatedAt,
    mode: "read_only",
    sourceProposal: {
      artifactSha256: proposal.artifactSha256,
      generatedAt: proposal.generatedAt,
      sourceDeployment: proposal.sourceDeployment,
    },
    reviewGuide: RESIDUAL_REVIEW_GUIDE,
    summary: {
      residualCount: sorted.length,
      batchCount: batches.length,
      articleCount: new Set(sorted.map((row) => row.slug)).size,
      reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort(([left], [right]) => left.localeCompare(right))),
    },
    batches,
  };
  return { ...queue, artifactSha256: sha256Json(queue) };
}

function readJson(path) {
  if (!path) throw new Error("--proposal=<path> is required.");
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read proposal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function defaultOutputPath(repoRoot, proposalHash) {
  return resolve(repoRoot, DEFAULT_OUTPUT_DIRECTORY, `citation-author-review-queue-${proposalHash.slice(0, 12)}.json`);
}

function writeImmutableJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
}

export function runBuildCitationAuthorReviewQueue(argv = process.argv.slice(2), dependencies = {}) {
  if (hasFlag(argv, "--write") || hasFlag(argv, "--execute")) {
    throw new Error("This review-queue command is read-only and does not accept --write or --execute.");
  }
  const context = createDataOpsRunContext({
    operation: "Build citation author residual review queue",
    intent: "citationMetadataRead",
    argv,
    selectedTables: [],
    localArtifacts: [DEFAULT_OUTPUT_DIRECTORY],
    destructive: false,
  });
  printDataOpsRunContext(context, { logger: dependencies.logger ?? console });
  const proposal = readJson(getFlagValue(argv, "--proposal"));
  const queue = buildCitationAuthorReviewQueue(proposal, {
    generatedAt: dependencies.generatedAt ?? new Date().toISOString(),
  });
  const outputPath = resolve(getFlagValue(argv, "--output") ?? defaultOutputPath(context.repoRoot, proposal.artifactSha256));
  (dependencies.writeImmutableJson ?? writeImmutableJson)(outputPath, queue);
  (dependencies.logger ?? console).log(`Wrote ${queue.summary.residualCount} residual rows in ${queue.summary.batchCount} review batches to ${outputPath}.`);
  return { outputPath, queue };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  try {
    runBuildCitationAuthorReviewQueue();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
