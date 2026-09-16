#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, postgresFingerprintFromUrl, resolvePostgresSource } from "../lib/data-client.ts";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

import { api } from "../../lib/postgres/runtime/api.ts"
import { normalizeDoi, normalizePmid } from "../../lib/citations/referenceIdentity.mjs";
import { backupBeforeWrite,
getFlagValue,
hasFlag,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";
import { normalizeTextNeedle } from "./formal-citations-source-utils.mjs";

const OPERATION = "apply-citation-author-repairs";
const CITATION_CONFIRMATION_FLAG = "--confirm-citation-author-write";

function readJson(path, label) {
  if (!path) throw new Error(`${label} path is required.`);
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function artifactPayload(proposal) {
  const { artifactSha256: _artifactSha256, ...payload } = proposal;
  return payload;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) return false;
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === timestamp;
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

function hasAuthoritativeEvidence(urls, evidence) {
  return Array.isArray(urls) && urls.length > 0
    && urls.every(isAuthoritativeUrl)
    && typeof evidence === "string" && Boolean(evidence.trim());
}

function validatedExpectedIdentity(row) {
  const rowDoi = normalizeDoi(row.identifiers?.doi);
  const snapshotDoi = normalizeDoi(row.expectedReference?.doi);
  const rowPmid = normalizePmid(row.identifiers?.pmid);
  const snapshotPmid = normalizePmid(row.expectedReference?.pmid);
  if ((rowDoi && snapshotDoi && rowDoi !== snapshotDoi)
      || (rowPmid && snapshotPmid && rowPmid !== snapshotPmid)) {
    throw new Error(`Proposal row ${row.key} has contradictory stable identifier identity.`);
  }
  return {
    doi: rowDoi || snapshotDoi || null,
    pmid: rowPmid || snapshotPmid || null,
  };
}

function hasValidReviewedIdentity(row, result) {
  const originalIdentity = validatedExpectedIdentity(row);
  const resultDoi = normalizeDoi(result?.doi);
  const resultPmid = normalizePmid(result?.pmid);
  if (originalIdentity.doi || originalIdentity.pmid) {
    return (!originalIdentity.doi || resultDoi === originalIdentity.doi)
      && (!originalIdentity.pmid || resultPmid === originalIdentity.pmid);
  }
  const originalTitle = normalizeTextNeedle(row.expectedReference?.title ?? row.storedTitle);
  const resultTitle = normalizeTextNeedle(result?.title);
  return Boolean(originalTitle && resultTitle && originalTitle === resultTitle);
}

function validateIndependentlyReviewedRow(proposal, row) {
  const evidence = row.reviewedEvidence;
  const result = evidence?.result;
  const refutation = evidence?.refutation;
  const sources = proposal.sourceArtifacts;
  const primaryReviewerIdentifier = canonicalReviewerIdentity(evidence?.primaryReviewerIdentifier);
  const refutationReviewerIdentifier = canonicalReviewerIdentity(evidence?.refutationReviewerIdentifier);
  const valid = proposal.sourceKind === "independently_reviewed_residual"
    && row.sourceKind === "independently_reviewed_residual"
    && Array.isArray(row.reasonCodes) && row.reasonCodes.length === 1
    && row.reasonCodes[0] === "independently_reviewed_residual"
    && sources?.originalProposalArtifactSha256
    && sources?.reviewQueueArtifactSha256
    && result?.key === row.key
    && result?.decision === "resolved"
    && result?.confidence === "high"
    && evidence.reviewResultSha256 === sha256Json(result)
    && typeof evidence.reviewResultArtifactSha256 === "string"
    && /^[a-f0-9]{64}$/.test(evidence.reviewResultArtifactSha256)
    && isCanonicalIsoTimestamp(evidence.reviewResultGeneratedAt)
    && hasValidReviewedIdentity(row, result)
    && (normalizeDoi(row.resolvedIdentifiers?.doi) || null) === (normalizeDoi(result.doi) || null)
    && (normalizePmid(row.resolvedIdentifiers?.pmid) || null) === (normalizePmid(result.pmid) || null)
    && Boolean(primaryReviewerIdentifier)
    && primaryReviewerIdentifier === evidence.primaryReviewerIdentifier
    && sameJson(normalizedAuthors(result.authors), normalizedAuthors(row.proposedAuthors))
    && hasAuthoritativeEvidence(result.sourceUrls, result.inspectedEvidence)
    && refutation?.artifactType === "citation_author_repair_refutation"
    && refutation?.artifactVersion === 1
    && evidence.refutationArtifactSha256 === sha256Json(refutation)
    && refutation.proposalArtifactSha256 === sources.originalProposalArtifactSha256
    && refutation.queueArtifactSha256 === sources.reviewQueueArtifactSha256
    && refutation.batchId === evidence.batchId
    && refutation.key === row.key
    && refutation.reviewResultSha256 === evidence.reviewResultSha256
    && canonicalReviewerIdentity(refutation.originalReviewerIdentifier) === primaryReviewerIdentifier
    && Boolean(refutationReviewerIdentifier)
    && canonicalReviewerIdentity(refutation.refutationReviewerIdentifier) === refutationReviewerIdentifier
    && refutationReviewerIdentifier === evidence.refutationReviewerIdentifier
    && primaryReviewerIdentifier !== refutationReviewerIdentifier
    && refutation.decision === "survived_refutation"
    && evidence.refutationDecision === "survived_refutation"
    && isCanonicalIsoTimestamp(refutation.generatedAt)
    && hasAuthoritativeEvidence(refutation.authoritativeSourceUrls, refutation.inspectedEvidence);
  if (!valid) throw new Error(`Proposal row ${row.key} has invalid independently reviewed evidence.`);
}

export function validateApprovedCitationAuthorProposal(proposal, approval) {
  if (proposal?.artifactType !== "citation_author_repair_proposal" || proposal?.artifactVersion !== 1) {
    throw new Error("The proposal is not a supported immutable citation-author repair artifact.");
  }
  const computedHash = sha256Json(artifactPayload(proposal));
  if (!proposal.artifactSha256 || proposal.artifactSha256 !== computedHash) {
    throw new Error("The proposal artifact hash is missing or invalid.");
  }
  assertCitationSourceIdentity(proposal.sourceDeployment);
  if (approval?.artifactType !== "citation_author_repair_approval"
      || approval?.artifactVersion !== 1
      || approval?.decision !== "approved"
      || approval?.scope !== "high_confidence_only"
      || !isCanonicalIsoTimestamp(approval?.approvedAt)
      || typeof approval?.approvedBy !== "string" || !approval.approvedBy.trim()
      || approval?.proposalArtifactSha256 !== proposal.artifactSha256) {
    throw new Error("An explicit matching approval artifact for the high-confidence proposal is required.");
  }
  if (!Array.isArray(proposal.highConfidence) || !Array.isArray(proposal.residual)) {
    throw new Error("The proposal artifact is missing its high-confidence or residual queue.");
  }
  const seen = new Set();
  for (const row of [...proposal.highConfidence, ...proposal.residual]) {
    if (!row?.key || seen.has(row.key)) throw new Error(`Proposal contains a missing or duplicate row key: ${row?.key ?? "(missing)"}.`);
    seen.add(row.key);
  }
  for (const row of proposal.highConfidence) {
    if (row.classification !== "high_confidence") throw new Error(`Proposal row ${row.key} is not high confidence.`);
    if (!row.expectedReference || sha256Json(row.expectedReference) !== row.expectedReferenceSha256) {
      throw new Error(`Proposal row ${row.key} has a stale or invalid expected reference snapshot.`);
    }
    validatedExpectedIdentity(row);
    if (!Array.isArray(row.proposedAuthors) || normalizedAuthors(row.proposedAuthors).length === 0) {
      throw new Error(`Proposal row ${row.key} has no proposed authors.`);
    }
    if (row.sourceKind === "independently_reviewed_residual") {
      validateIndependentlyReviewedRow(proposal, row);
      continue;
    }
    const stableDoi = normalizeDoi(row.identifiers?.doi);
    const stablePmid = normalizePmid(row.identifiers?.pmid);
    if (!stableDoi && !stablePmid) {
      throw new Error(`Proposal row ${row.key} is not backed by a stable DOI or PMID.`);
    }
    const expectedTitle = normalizeTextNeedle(row.expectedReference?.title);
    const providerTitles = (row.providerLanes ?? []).map((lane) => normalizeTextNeedle(lane.title)).filter(Boolean);
    if (!expectedTitle || providerTitles.length === 0 || providerTitles.some((title) => title !== expectedTitle)) {
      throw new Error(`Proposal row ${row.key} does not have strict provider title agreement.`);
    }
  }
  return proposal.highConfidence;
}

function expectedSnapshot(row) {
  const identity = validatedExpectedIdentity(row);
  return {
    title: row.expectedReference.title,
    doi: identity.doi,
    pmid: identity.pmid,
    authors: row.expectedAuthors,
  };
}

export function preflightCitationAuthorRepair(article, row) {
  if (!article) throw new Error(`Article ${row.slug} was not found.`);
  const matches = (article.references ?? []).filter((reference) => reference?.id === row.referenceId);
  if (matches.length !== 1) {
    throw new Error(`${row.key}: ${matches.length === 0 ? "REFERENCE_NOT_FOUND" : "REFERENCE_DUPLICATE"}.`);
  }
  const reference = matches[0];
  const expected = expectedSnapshot(row);
  const identityMatches = reference.title === expected.title
    && (normalizeDoi(reference.doi) || null) === (normalizeDoi(expected.doi) || null)
    && (normalizePmid(reference.pmid) || null) === (normalizePmid(expected.pmid) || null);
  if (!identityMatches) throw new Error(`${row.key}: REFERENCE_CONFLICT: reference identity changed.`);
  if (sameJson(reference.authors ?? [], row.proposedAuthors)) return "already_applied";
  if (!sameJson(reference.authors ?? [], expected.authors)) {
    throw new Error(`${row.key}: REFERENCE_CONFLICT: reference authors changed.`);
  }
  return "apply";
}

function authorsFor(article, referenceId) {
  const matches = (article?.references ?? []).filter((reference) => reference?.id === referenceId);
  if (matches.length !== 1) return null;
  return matches[0].authors;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function runApplyReferenceAuthorRepairs(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;
  const command = createProductionWriteCommand({ operation: OPERATION, argv, env: dependencies.env ?? process.env });
  printProductionWriteCommand(command, { logger });
  const proposalPath = getFlagValue(argv, "--proposal");
  const approvalPath = getFlagValue(argv, "--approval");
  const proposal = readJson(proposalPath, "proposal");
  const approval = readJson(approvalPath, "approval");
  const rows = validateApprovedCitationAuthorProposal(proposal, approval);

  if (command.writeRequested) {
    assertProductionWriteAllowed(command);
    if (!hasFlag(argv, CITATION_CONFIRMATION_FLAG)) {
      throw new Error(`Production citation-author repair requires ${CITATION_CONFIRMATION_FLAG}.`);
    }
  }

  const env = dependencies.env ?? process.env;
  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({ argv, env }).url;
  if (!readUrl) throw new Error("A Postgres source URL or explicit target URL is required.");
  if (proposal.sourceDeployment !== postgresFingerprintFromUrl(readUrl)) {
    throw new Error("The approved proposal source identity does not match the selected Postgres database.");
  }
  const client = dependencies.client ?? createDataClient({ target: readUrl, argv, env }).client;
  const queryApi = dependencies.api ?? api;
  const plan = [];
  for (const row of rows) {
    const article = await client.query(queryApi.substanceIndex.getBySlug, { slug: row.slug });
    plan.push({ row, status: preflightCitationAuthorRepair(article, row) });
  }
  const pending = plan.filter((item) => item.status === "apply");
  const alreadyApplied = plan.length - pending.length;
  logger.log(`Approved high-confidence rows: ${plan.length}; pending: ${pending.length}; already applied: ${alreadyApplied}; residual rows excluded: ${proposal.residual.length}.`);
  if (!command.writeRequested) return { status: "dry_run", pending: pending.length, alreadyApplied, residualExcluded: proposal.residual.length };

  const apiKey = dependencies.apiKey ?? requireProductionWriteCredential("editorArticleWrite", { env: dependencies.env ?? process.env }).token;
  const backup = dependencies.backupBeforeWrite ?? backupBeforeWrite;
  const auditWriter = dependencies.writeAuditLog ?? writeAuditLog;
  const auditUpdater = dependencies.updateAuditLog ?? updateAuditLog;
  const affectedSlugs = [...new Set(pending.map(({ row }) => row.slug))];
  const backups = [];
  for (const slug of affectedSlugs) {
    backups.push(await backup({
      sourceClient: client,
      queryGetAll: queryApi.substanceIndex.getBySlug,
      queryArgs: { slug },
      label: `citation-author-repair-${slug}`,
      repoRoot: command.repoRoot,
    }));
  }
  const audit = auditWriter({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: "high-confidence",
    mutations: pending.map(({ row }) => ({
      slug: row.slug,
      referenceId: row.referenceId,
      action: "replace_reference_authors",
      proposedAuthors: row.proposedAuthors,
      providerLanes: row.providerLanes ?? [],
      sourceKind: row.sourceKind ?? "automated_provider_match",
      ...(row.reviewedEvidence ? { reviewedEvidence: row.reviewedEvidence } : {}),
    })),
    repoRoot: command.repoRoot,
  });
  const results = [];
  try {
    for (const { row } of pending) {
      const fresh = await client.query(queryApi.substanceIndex.getBySlug, { slug: row.slug });
      const freshStatus = preflightCitationAuthorRepair(fresh, row);
      if (freshStatus === "already_applied") {
        results.push({ key: row.key, status: "already_applied" });
        continue;
      }
      const mutationResult = await client.mutation(queryApi.substanceIndex.repairArticleReferenceAuthors, {
        apiKey,
        slug: row.slug,
        referenceId: row.referenceId,
        expected: expectedSnapshot(row),
        proposedAuthors: row.proposedAuthors,
      });
      const verified = await client.query(queryApi.substanceIndex.getBySlug, { slug: row.slug });
      if (!sameJson(authorsFor(verified, row.referenceId), mutationResult.authors)
          || !sameJson(mutationResult.authors, row.proposedAuthors)) {
        throw new Error(`${row.key}: post-write author verification failed.`);
      }
      results.push({ key: row.key, status: mutationResult.updated ? "updated" : "already_applied" });
    }
    auditUpdater(audit.path, { status: "completed", proposalArtifactSha256: proposal.artifactSha256, approval, backups, results });
  } catch (error) {
    auditUpdater(audit.path, { status: "failed", proposalArtifactSha256: proposal.artifactSha256, approval, backups, results, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  return { status: "completed", results, auditLogPath: audit.path, backups };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  runApplyReferenceAuthorRepairs().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
