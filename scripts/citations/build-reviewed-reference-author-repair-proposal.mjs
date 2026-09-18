#!/usr/bin/env node
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createDataOpsRunContext,
  getFlagValue,
  hasFlag,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { normalizeDoi, normalizePmid } from "../../lib/citations/referenceIdentity.mjs";
import { validateCitationAuthorRepairProposal } from "./build-reference-author-review-queue.mjs";
import { normalizeTextNeedle } from "./formal-citations-source-utils.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

const ARTIFACT_VERSION = 1;
const SOURCE_KIND = "independently_reviewed_residual";
const DEFAULT_OUTPUT_DIRECTORY = "tmp/citation-author-repair-proposals";
const DUPLICATE_REASONS = new Set(["duplicate_reference", "reference_duplicate", "possible_duplicate"]);

function artifactPayload(artifact) {
  const { artifactSha256: _artifactSha256, ...payload } = artifact;
  return payload;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
  }
  return value;
}

function normalizedAuthors(authors) {
  const seen = new Set();
  const output = [];
  for (const author of Array.isArray(authors) ? authors : []) {
    const value = String(author ?? "").replace(/\s+/g, " ").trim();
    const key = value.toLocaleLowerCase("en-US");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function canonicalReviewerIdentity(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US") : "";
}

function isAuthoritativeUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLocaleLowerCase("en-US");
    return host === "doi.org"
      || host === "crossref.org" || host.endsWith(".crossref.org")
      || host === "openalex.org" || host.endsWith(".openalex.org")
      || host === "ncbi.nlm.nih.gov" || host.endsWith(".ncbi.nlm.nih.gov")
      || host.endsWith(".gov") || host.endsWith(".gov.uk") || host.endsWith(".gc.ca")
      || host === "who.int" || host.endsWith(".who.int")
      || host === "unodc.org" || host.endsWith(".unodc.org")
      || host === "europa.eu" || host.endsWith(".europa.eu");
  } catch {
    return false;
  }
}

function authoritativeUrls(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((url) => String(url ?? "").trim()).filter(isAuthoritativeUrl);
}

function requireEvidence(urls, evidence, label) {
  if (authoritativeUrls(urls).length !== urls?.length || authoritativeUrls(urls).length === 0
      || typeof evidence !== "string" || !evidence.trim()) {
    throw new Error(`${label} must include authoritative HTTPS source evidence.`);
  }
}

function validatedOriginalIdentity(original) {
  const rowDoi = normalizeDoi(original.identifiers?.doi);
  const snapshotDoi = normalizeDoi(original.expectedReference?.doi);
  const rowPmid = normalizePmid(original.identifiers?.pmid);
  const snapshotPmid = normalizePmid(original.expectedReference?.pmid);
  if ((rowDoi && snapshotDoi && rowDoi !== snapshotDoi)
      || (rowPmid && snapshotPmid && rowPmid !== snapshotPmid)) {
    throw new Error(`Resolved review result ${original.key} contradicts the original stable identifier identity.`);
  }
  return {
    doi: rowDoi || snapshotDoi || null,
    pmid: rowPmid || snapshotPmid || null,
  };
}

function assertReviewedIdentity(original, result) {
  const originalIdentity = validatedOriginalIdentity(original);
  const resultDoi = normalizeDoi(result.doi);
  const resultPmid = normalizePmid(result.pmid);
  if (originalIdentity.doi || originalIdentity.pmid) {
    if ((originalIdentity.doi && resultDoi !== originalIdentity.doi)
        || (originalIdentity.pmid && resultPmid !== originalIdentity.pmid)) {
      throw new Error(`Resolved review result ${result.key} must exactly match every original stable identifier identity.`);
    }
    return;
  }
  const originalTitle = normalizeTextNeedle(original.expectedReference?.title ?? original.storedTitle);
  const resultTitle = normalizeTextNeedle(result.title);
  if (!originalTitle || !resultTitle || originalTitle !== resultTitle) {
    throw new Error(`Resolved review result ${result.key} must have exact normalized title identity.`);
  }
}

export function reviewResultSha256(result) {
  return sha256Json(result);
}

export function validateCitationAuthorReviewQueue(originalProposal, reviewQueue) {
  const originalResidual = validateCitationAuthorRepairProposal(originalProposal);
  if (reviewQueue?.artifactType !== "citation_author_repair_review_queue" || reviewQueue?.artifactVersion !== 1) {
    throw new Error("The review queue is not a supported citation-author review artifact.");
  }
  const queueHash = sha256Json(artifactPayload(reviewQueue));
  if (!reviewQueue.artifactSha256 || reviewQueue.artifactSha256 !== queueHash) {
    throw new Error("The queue artifact hash is missing or invalid.");
  }
  if (reviewQueue.sourceProposal?.artifactSha256 !== originalProposal.artifactSha256
      || reviewQueue.sourceProposal?.sourceDeployment !== originalProposal.sourceDeployment) {
    throw new Error("The review queue is not bound to the original proposal digest and deployment.");
  }
  if (!Array.isArray(reviewQueue.batches)) throw new Error("The review queue is missing batches.");
  const batchIds = new Set();
  const queueRows = [];
  for (const batch of reviewQueue.batches) {
    if (!batch?.batchId || batchIds.has(batch.batchId) || !Array.isArray(batch.rows)) {
      throw new Error("The review queue contains a missing or duplicate batch ID.");
    }
    batchIds.add(batch.batchId);
    queueRows.push(...batch.rows);
  }
  const originalByKey = new Map(originalResidual.map((row) => [row.key, row]));
  if (queueRows.length !== originalResidual.length) {
    throw new Error("The review queue does not have exact row completeness for the original residual proposal.");
  }
  const seen = new Set();
  for (const row of queueRows) {
    const original = originalByKey.get(row?.key);
    if (!original || seen.has(row.key) || sha256Json(row) !== sha256Json(original)) {
      throw new Error(`The review queue does not have exact row completeness for ${row?.key ?? "(missing)"}.`);
    }
    seen.add(row.key);
  }
  return reviewQueue.batches;
}

function validateReviewResults(originalProposal, reviewQueue, reviewResults) {
  const batches = validateCitationAuthorReviewQueue(originalProposal, reviewQueue);
  if (!Array.isArray(reviewResults)) throw new Error("Review results must be an array.");
  const resultByBatch = new Map();
  for (const resultArtifact of reviewResults) {
    if (resultArtifact?.artifactType !== "citation_author_repair_review_result"
        || resultArtifact?.artifactVersion !== 1
        || !resultArtifact.batchId
        || resultByBatch.has(resultArtifact.batchId)
        || !Array.isArray(resultArtifact.results)) {
      throw new Error("Review results do not have exact batch completeness.");
    }
    if (resultArtifact.proposalDigest !== originalProposal.artifactSha256
        || !canonicalReviewerIdentity(resultArtifact.reviewerIdentifier)) {
      throw new Error(`Review result ${resultArtifact.batchId} is not bound to the proposal or a reviewer.`);
    }
    canonicalTimestamp(resultArtifact.generatedAt, `Review result ${resultArtifact.batchId} generatedAt`);
    resultByBatch.set(resultArtifact.batchId, resultArtifact);
  }
  if (resultByBatch.size !== batches.length || batches.some((batch) => !resultByBatch.has(batch.batchId))) {
    throw new Error("Review results do not have exact batch completeness.");
  }
  const entries = new Map();
  for (const batch of batches) {
    const artifact = resultByBatch.get(batch.batchId);
    const expectedKeys = new Set(batch.rows.map((row) => row.key));
    const seen = new Set();
    if (artifact.results.length !== expectedKeys.size) {
      throw new Error(`Review result ${batch.batchId} does not have exact row completeness.`);
    }
    for (const result of artifact.results) {
      if (!result?.key || !expectedKeys.has(result.key) || seen.has(result.key)
          || !["resolved", "unresolved"].includes(result.decision)) {
        throw new Error(`Review result ${batch.batchId} does not have exact row completeness.`);
      }
      seen.add(result.key);
      if (result.decision === "resolved") {
        if (normalizedAuthors(result.authors).length === 0 || result.confidence !== "high") {
          throw new Error(`Resolved review result ${result.key} must have high-confidence authors.`);
        }
        requireEvidence(result.sourceUrls, result.inspectedEvidence, `Resolved review result ${result.key}`);
        const original = batch.rows.find((row) => row.key === result.key);
        assertReviewedIdentity(original, result);
      }
      entries.set(result.key, {
        batchId: batch.batchId,
        reviewerIdentifier: canonicalReviewerIdentity(artifact.reviewerIdentifier),
        resultArtifactSha256: sha256Json(artifact),
        resultGeneratedAt: artifact.generatedAt,
        result,
        resultSha256: reviewResultSha256(result),
      });
    }
  }
  return entries;
}

function validateRefutations(originalProposal, reviewQueue, reviewedEntries, refutations) {
  if (!Array.isArray(refutations)) throw new Error("Refutations must be an array.");
  const byKey = new Map();
  for (const refutation of refutations) {
    if (refutation?.artifactType !== "citation_author_repair_refutation"
        || refutation?.artifactVersion !== 1 || !refutation.key || byKey.has(refutation.key)) {
      throw new Error("Refutation artifacts must be separate and unique per row.");
    }
    byKey.set(refutation.key, refutation);
  }
  for (const [key, entry] of reviewedEntries) {
    if (entry.result.decision !== "resolved") continue;
    const refutation = byKey.get(key);
    if (!refutation
        || refutation.proposalArtifactSha256 !== originalProposal.artifactSha256
        || refutation.queueArtifactSha256 !== reviewQueue.artifactSha256
        || refutation.batchId !== entry.batchId
        || refutation.reviewResultSha256 !== entry.resultSha256
        || canonicalReviewerIdentity(refutation.originalReviewerIdentifier) !== entry.reviewerIdentifier
        || !canonicalReviewerIdentity(refutation.refutationReviewerIdentifier)
        || canonicalReviewerIdentity(refutation.refutationReviewerIdentifier) === entry.reviewerIdentifier
        || !["survived_refutation", "refuted", "uncertain"].includes(refutation.decision)) {
      throw new Error(`Refutation for ${key} is missing, mismatched, or not independently reviewed.`);
    }
    canonicalTimestamp(refutation.generatedAt, `Refutation ${key} generatedAt`);
    requireEvidence(refutation.authoritativeSourceUrls, refutation.inspectedEvidence, `Refutation ${key}`);
  }
  const resolvedKeys = new Set([...reviewedEntries].filter(([, entry]) => entry.result.decision === "resolved").map(([key]) => key));
  for (const key of byKey.keys()) {
    if (!resolvedKeys.has(key)) throw new Error(`Refutation ${key} does not bind to a resolved review result.`);
  }
  return byKey;
}

function reviewedEvidence(entry, refutation) {
  return {
    batchId: entry.batchId,
    reviewResultSha256: entry.resultSha256,
    reviewResultArtifactSha256: entry.resultArtifactSha256,
    reviewResultGeneratedAt: entry.resultGeneratedAt,
    primaryReviewerIdentifier: entry.reviewerIdentifier,
    result: structuredClone(entry.result),
    refutationArtifactSha256: sha256Json(refutation),
    refutationReviewerIdentifier: canonicalReviewerIdentity(refutation.refutationReviewerIdentifier),
    refutationDecision: refutation.decision,
    refutation: structuredClone(refutation),
  };
}

export function buildReviewedReferenceAuthorRepairProposal({
  originalProposal,
  reviewQueue,
  reviewResults,
  refutations,
  generatedAt = new Date().toISOString(),
}) {
  canonicalTimestamp(generatedAt, "Proposal generatedAt");
  const reviewedEntries = validateReviewResults(originalProposal, reviewQueue, reviewResults);
  const refutationByKey = validateRefutations(originalProposal, reviewQueue, reviewedEntries, refutations);
  const highConfidence = [];
  const residual = [];
  for (const original of originalProposal.residual) {
    const entry = reviewedEntries.get(original.key);
    const refutation = refutationByKey.get(original.key);
    const duplicate = original.reasonCodes?.some((reason) => DUPLICATE_REASONS.has(reason));
    let reviewDisposition;
    if (duplicate) reviewDisposition = "duplicate_permanently_excluded";
    else if (entry.result.decision !== "resolved") reviewDisposition = "unresolved";
    else if (refutation.decision !== "survived_refutation") reviewDisposition = refutation.decision;
    if (reviewDisposition) {
      residual.push({
        ...structuredClone(original),
        sourceKind: SOURCE_KIND,
        reviewDisposition,
        reviewedEvidence: refutation ? reviewedEvidence(entry, refutation) : {
          batchId: entry.batchId,
          reviewResultSha256: entry.resultSha256,
          reviewResultArtifactSha256: entry.resultArtifactSha256,
          reviewResultGeneratedAt: entry.resultGeneratedAt,
          primaryReviewerIdentifier: entry.reviewerIdentifier,
          result: structuredClone(entry.result),
        },
      });
      continue;
    }
    highConfidence.push({
      ...structuredClone(original),
      classification: "high_confidence",
      reasonCodes: ["independently_reviewed_residual"],
      sourceKind: SOURCE_KIND,
      proposedAuthors: normalizedAuthors(entry.result.authors),
      resolvedIdentifiers: {
        doi: entry.result.doi ? String(entry.result.doi).trim() : null,
        pmid: entry.result.pmid ? String(entry.result.pmid).trim() : null,
      },
      reviewedEvidence: reviewedEvidence(entry, refutation),
    });
  }
  const payload = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: ARTIFACT_VERSION,
    generatedAt,
    sourceDeployment: originalProposal.sourceDeployment,
    mode: "dry_run",
    sourceKind: SOURCE_KIND,
    sourceArtifacts: {
      originalProposalArtifactSha256: originalProposal.artifactSha256,
      reviewQueueArtifactSha256: reviewQueue.artifactSha256,
    },
    summary: {
      articleCount: new Set(originalProposal.residual.map((row) => row.slug)).size,
      candidateCount: originalProposal.residual.length,
      highConfidenceCount: highConfidence.length,
      residualCount: residual.length,
      reviewDispositionCounts: residual.reduce((counts, row) => {
        counts[row.reviewDisposition] = (counts[row.reviewDisposition] ?? 0) + 1;
        return counts;
      }, {}),
    },
    highConfidence,
    residual,
  };
  return { ...payload, artifactSha256: sha256Json(payload) };
}

function readJson(path, label) {
  if (!path) throw new Error(`${label} path is required.`);
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJsonDirectory(path, label) {
  if (!path) throw new Error(`${label} directory is required.`);
  const absolute = resolve(path);
  if (!statSync(absolute).isDirectory()) throw new Error(`${label} must be a directory.`);
  return readdirSync(absolute)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => readJson(resolve(absolute, entry), `${label} artifact`));
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

export function runBuildReviewedReferenceAuthorRepairProposal(argv = process.argv.slice(2), dependencies = {}) {
  if (hasFlag(argv, "--write") || hasFlag(argv, "--execute")) {
    throw new Error("This reviewed-proposal command is read-only and does not accept --write or --execute.");
  }
  const context = createDataOpsRunContext({
    operation: "Build independently reviewed citation author repair proposal",
    intent: "citationMetadataRead",
    argv,
    selectedTables: [],
    localArtifacts: [DEFAULT_OUTPUT_DIRECTORY],
    destructive: false,
  });
  printDataOpsRunContext(context, { logger: dependencies.logger ?? console });
  const originalProposal = readJson(getFlagValue(argv, "--proposal"), "proposal");
  const reviewQueue = readJson(getFlagValue(argv, "--queue"), "review queue");
  const reviewResults = readJsonDirectory(getFlagValue(argv, "--results"), "review results");
  const refutations = readJsonDirectory(getFlagValue(argv, "--refutations"), "refutations");
  const artifact = buildReviewedReferenceAuthorRepairProposal({
    originalProposal,
    reviewQueue,
    reviewResults,
    refutations,
    generatedAt: dependencies.generatedAt ?? new Date().toISOString(),
  });
  const outputPath = resolve(getFlagValue(argv, "--output")
    ?? resolve(context.repoRoot, DEFAULT_OUTPUT_DIRECTORY, `independently-reviewed-${artifact.artifactSha256.slice(0, 12)}.json`));
  (dependencies.writeImmutableJson ?? writeImmutableJson)(outputPath, artifact);
  (dependencies.logger ?? console).log(`Wrote independently reviewed proposal with ${artifact.highConfidence.length} approved rows and ${artifact.residual.length} excluded rows to ${outputPath}.`);
  return { artifact, outputPath };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  try {
    runBuildReviewedReferenceAuthorRepairProposal();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
