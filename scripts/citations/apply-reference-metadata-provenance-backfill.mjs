#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, postgresFingerprintFromUrl, resolvePostgresSource } from "../lib/data-client.ts";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  normalizeDoi,
  normalizePmid,
  normalizeReferenceMetadataProvenance,
} from "../../lib/citations/referenceIdentity.mjs";
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

const OPERATION = "apply-citation-reference-provenance-backfill";
const CONFIRMATION_FLAG = "--confirm-citation-provenance-write";
const PROPOSAL_TYPE = "citation_reference_provenance_backfill_proposal";
const APPROVAL_TYPE = "citation_reference_provenance_backfill_approval";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

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

function approvalPayload(approval) {
  const { approvalArtifactSha256: _approvalArtifactSha256, ...payload } = approval;
  return payload;
}

export function withApprovalArtifactSha256(approval) {
  return { ...approval, approvalArtifactSha256: sha256Json(approval) };
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(stableJsonValue(value));
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validCanonicalProvenance(value, { allowNull = false } = {}) {
  if (allowNull && value === null) return true;
  return Array.isArray(value)
    && value.length <= 32
    && sameJson(normalizeReferenceMetadataProvenance(value), value);
}

function validExactAuthors(authors) {
  return Array.isArray(authors)
    && authors.length > 0
    && authors.every((author) => typeof author === "string" && author.length > 0 && author === author.trim())
    && new Set(authors).size === authors.length;
}


function expectedSnapshot(row) {
  return {
    title: row.expectedTitle,
    doi: normalizeDoi(row.identifiers?.doi) || null,
    pmid: normalizePmid(row.identifiers?.pmid) || null,
    authors: row.expectedAuthors,
    metadataProvenance: row.expectedMetadataProvenance,
  };
}

export function validateApprovedReferenceProvenanceBackfill(proposal, approval) {
  if (proposal?.artifactType !== PROPOSAL_TYPE || proposal?.artifactVersion !== 1) {
    throw new Error("The proposal is not a supported immutable reference-provenance backfill artifact.");
  }
  const computedHash = sha256Json(artifactPayload(proposal));
  if (!proposal.artifactSha256 || proposal.artifactSha256 !== computedHash) {
    throw new Error("The proposal artifact hash is missing or invalid.");
  }
  const computedApprovalHash = approval && sha256Json(approvalPayload(approval));
  if (approval?.artifactType !== APPROVAL_TYPE
      || approval?.artifactVersion !== 1
      || approval?.decision !== "approved"
      || approval?.scope !== "all_rows"
      || approval?.proposalArtifactSha256 !== proposal.artifactSha256
      || !isCanonicalIsoTimestamp(approval?.approvedAt)
      || typeof approval?.approvedBy !== "string" || !approval.approvedBy.trim()
      || !SHA256_PATTERN.test(approval?.approvalArtifactSha256)
      || approval.approvalArtifactSha256 !== computedApprovalHash) {
    throw new Error("An explicit matching approval artifact for the complete provenance backfill is required.");
  }
  assertCitationSourceIdentity(proposal.sourceDeployment);
  if (!isCanonicalIsoTimestamp(proposal.generatedAt)) {
    throw new Error("The proposal generation timestamp is invalid.");
  }
  if (!Array.isArray(proposal.rows) || proposal.rows.length !== 759 || proposal.summary?.rows !== 759) {
    throw new Error("The proposal must contain exactly 759 repair-lineage rows.");
  }
  if (!SHA256_PATTERN.test(proposal.lineageManifest?.fileSha256)) {
    throw new Error("The proposal is not bound to the tracked lineage manifest.");
  }
  if (!SHA256_PATTERN.test(proposal.evidenceBundle?.fileSha256)
      || !SHA256_PATTERN.test(proposal.evidenceBundle?.bundleDigest)) {
    throw new Error("The proposal is not bound to the tracked repair evidence bundle.");
  }
  const seen = new Set();
  for (const row of proposal.rows) {
    if (!row?.key || row.key !== `${row.slug}::${row.referenceId}` || seen.has(row.key)) {
      throw new Error(`Proposal contains an invalid or duplicate row key: ${row?.key ?? "(missing)"}.`);
    }
    seen.add(row.key);
    if (!["deterministic-high-confidence", "independently-reviewed-residual"].includes(row.wave)) {
      throw new Error(`${row.key} has an invalid repair wave.`);
    }
    if (typeof row.expectedTitle !== "string"
        || normalizeTextNeedle(row.expectedTitle) !== row.normalizedTitle
        || !validExactAuthors(row.expectedAuthors)) {
      throw new Error(`${row.key} has an invalid identity/authors snapshot.`);
    }
    if ((normalizeDoi(row.identifiers?.doi) || null) !== (row.identifiers?.doi ?? null)
        || (normalizePmid(row.identifiers?.pmid) || null) !== (row.identifiers?.pmid ?? null)) {
      throw new Error(`${row.key} has noncanonical identifiers.`);
    }
    if (!validCanonicalProvenance(row.expectedMetadataProvenance, { allowNull: true })
        || sha256Json(row.expectedMetadataProvenance) !== row.expectedMetadataProvenanceSha256) {
      throw new Error(`${row.key} has an invalid expected provenance snapshot.`);
    }
    if (!validCanonicalProvenance(row.proposedMetadataProvenance)
        || row.proposedMetadataProvenance.length === 0
        || sha256Json(row.proposedMetadataProvenance) !== row.proposedMetadataProvenanceSha256) {
      throw new Error(`${row.key} has invalid proposed provenance.`);
    }
    const proposed = new Set(row.proposedMetadataProvenance.map((entry) => stableJson(entry)));
    if (!(row.expectedMetadataProvenance ?? []).every((entry) => proposed.has(stableJson(entry)))) {
      throw new Error(`${row.key} proposed provenance removes existing lineage.`);
    }
    const expectedKind = row.wave === "deterministic-high-confidence" ? "fetched" : "inspected";
    const allowedSources = expectedKind === "fetched"
      ? new Set(["citation-author-repair:doi", "citation-author-repair:pmid"])
      : new Set(["citation-author-repair:review-result", "citation-author-repair:independent-refutation"]);
    const added = row.proposedMetadataProvenance.filter((entry) => !(row.expectedMetadataProvenance ?? []).some((old) => sameJson(old, entry)));
    if (added.length === 0 || added.some((entry) => (
      entry.kind !== expectedKind
      || !allowedSources.has(entry.source)
      || typeof entry.provider !== "string" || !entry.provider
      || !entry.fields?.includes("authors")
      || !SHA256_PATTERN.test(entry.artifactDigest)
    ))) {
      throw new Error(`${row.key} has incorrect fetched/inspected provenance semantics.`);
    }
    const manualDomains = row.sourceBinding?.manualEvidence?.evidenceDomains ?? [];
    if (!Array.isArray(manualDomains)
        || manualDomains.some((domain) => typeof domain !== "string" || !added.some((entry) => entry.provider === domain))) {
      throw new Error(`${row.key} does not retain its manual authoritative evidence domains.`);
    }
    if (!SHA256_PATTERN.test(row.sourceBinding?.proposalArtifactSha256)
        || !SHA256_PATTERN.test(row.sourceBinding?.auditFileSha256)
        || !SHA256_PATTERN.test(row.sourceBinding?.approvalFileSha256)
        || row.sourceBinding?.evidenceBundleDigest !== proposal.evidenceBundle.bundleDigest
        || row.sourceBinding?.evidenceBundleFileSha256 !== proposal.evidenceBundle.fileSha256
        || !SHA256_PATTERN.test(row.sourceBinding?.evidenceRowSha256)) {
      throw new Error(`${row.key} has an invalid repair source binding.`);
    }
    if (expectedKind === "fetched") {
      if (added.some((entry) => entry.artifactDigest !== row.sourceBinding.proposalArtifactSha256)) {
        throw new Error(`${row.key} fetched lineage is not bound to its deterministic proposal.`);
      }
    } else {
      const reviewed = row.sourceBinding.reviewedEvidence;
      if (!SHA256_PATTERN.test(reviewed?.reviewResultSha256)
          || !SHA256_PATTERN.test(reviewed?.reviewResultArtifactSha256)
          || !SHA256_PATTERN.test(reviewed?.refutationArtifactSha256)
          || !added.some((entry) => entry.source === "citation-author-repair:review-result"
            && entry.artifactDigest === reviewed.reviewResultArtifactSha256)
          || !added.some((entry) => entry.source === "citation-author-repair:independent-refutation"
            && entry.artifactDigest === reviewed.refutationArtifactSha256)) {
        throw new Error(`${row.key} inspected lineage is not bound to its review and refutation artifacts.`);
      }
      const manual = row.sourceBinding.manualEvidence;
      if (manual && (manual.reviewResultSha256 !== reviewed.reviewResultSha256
          || manual.refutationArtifactSha256 !== reviewed.refutationArtifactSha256)) {
        throw new Error(`${row.key} manual evidence disagrees with its reviewed source binding.`);
      }
    }
  }
  if (proposal.rows.filter((row) => row.wave === "deterministic-high-confidence").length !== 74
      || proposal.rows.filter((row) => row.wave === "independently-reviewed-residual").length !== 685) {
    throw new Error("The proposal repair-wave coverage is not exactly 74 + 685.");
  }
  return proposal.rows;
}

function snapshotProvenance(snapshot) {
  if (!snapshot?.reference) return null;
  return Object.prototype.hasOwnProperty.call(snapshot.reference, "metadataProvenance")
    ? snapshot.reference.metadataProvenance
    : null;
}

export function preflightReferenceProvenanceBackfill(snapshot, row) {
  if (snapshot?.articleCount !== 1) throw new Error(`${row.key}: ARTICLE_${snapshot?.articleCount === 0 ? "NOT_FOUND" : "DUPLICATE"}.`);
  if (snapshot?.referenceCount !== 1 || !snapshot.reference) throw new Error(`${row.key}: REFERENCE_${snapshot?.referenceCount === 0 ? "NOT_FOUND" : "DUPLICATE"}.`);
  const reference = snapshot.reference;
  const identityMatches = reference.title === row.expectedTitle
    && normalizeTextNeedle(reference.title) === row.normalizedTitle
    && (normalizeDoi(reference.doi) || null) === (normalizeDoi(row.identifiers?.doi) || null)
    && (normalizePmid(reference.pmid) || null) === (normalizePmid(row.identifiers?.pmid) || null)
    && sameJson(reference.authors, row.expectedAuthors);
  if (!identityMatches) throw new Error(`${row.key}: REFERENCE_CONFLICT: identity or authors changed.`);
  const live = snapshotProvenance(snapshot);
  if (sameJson(live, row.proposedMetadataProvenance)) return "already_applied";
  if (!sameJson(live, row.expectedMetadataProvenance)) {
    throw new Error(`${row.key}: REFERENCE_CONFLICT: metadata provenance changed.`);
  }
  return "apply";
}

async function readSnapshot(client, queryApi, row) {
  return await client.query(queryApi.substanceIndex.getArticleReferenceProvenanceRepairSnapshot, {
    slug: row.slug,
    referenceId: row.referenceId,
  });
}

export async function runApplyReferenceProvenanceBackfill(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;
  const command = createProductionWriteCommand({ operation: OPERATION, argv, env: dependencies.env ?? process.env });
  printProductionWriteCommand(command, { logger });
  const proposal = readJson(getFlagValue(argv, "--proposal"), "proposal");
  const approval = readJson(getFlagValue(argv, "--approval"), "approval");
  const rows = validateApprovedReferenceProvenanceBackfill(proposal, approval);
  if (command.writeRequested) {
    assertProductionWriteAllowed(command);
    if (!hasFlag(argv, CONFIRMATION_FLAG)) throw new Error(`Production provenance backfill requires ${CONFIRMATION_FLAG}.`);
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
    const snapshot = await readSnapshot(client, queryApi, row);
    plan.push({ row, status: preflightReferenceProvenanceBackfill(snapshot, row) });
  }
  const pending = plan.filter((item) => item.status === "apply");
  const alreadyApplied = plan.length - pending.length;
  logger.log(`Approved provenance rows: ${plan.length}; pending: ${pending.length}; already applied: ${alreadyApplied}.`);
  if (!command.writeRequested) return { status: "dry_run", pending: pending.length, alreadyApplied };

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
      label: `citation-provenance-backfill-${slug}`,
      repoRoot: command.repoRoot,
    }));
  }
  const audit = auditWriter({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: "759-repair-lineage-rows",
    mutations: pending.map(({ row }) => ({
      key: row.key,
      action: "replace_reference_metadata_provenance",
      expectedMetadataProvenanceSha256: row.expectedMetadataProvenanceSha256,
      proposedMetadataProvenanceSha256: row.proposedMetadataProvenanceSha256,
      sourceBinding: row.sourceBinding,
    })),
    repoRoot: command.repoRoot,
  });
  const results = [];
  try {
    for (const { row } of pending) {
      const fresh = await readSnapshot(client, queryApi, row);
      const freshStatus = preflightReferenceProvenanceBackfill(fresh, row);
      if (freshStatus === "already_applied") {
        results.push({ key: row.key, status: "already_applied" });
        continue;
      }
      const mutationResult = await client.mutation(queryApi.substanceIndex.repairArticleReferenceMetadataProvenance, {
        apiKey,
        slug: row.slug,
        referenceId: row.referenceId,
        expected: expectedSnapshot(row),
        proposedMetadataProvenance: row.proposedMetadataProvenance,
      });
      const verified = await readSnapshot(client, queryApi, row);
      if (!sameJson(snapshotProvenance(verified), row.proposedMetadataProvenance)
          || !sameJson(mutationResult.metadataProvenance, row.proposedMetadataProvenance)) {
        throw new Error(`${row.key}: post-write metadata provenance verification failed.`);
      }
      results.push({ key: row.key, status: mutationResult.updated ? "updated" : "already_applied" });
    }
    auditUpdater(audit.path, {
      status: "completed",
      proposalArtifactSha256: proposal.artifactSha256,
      approvalArtifactSha256: approval.approvalArtifactSha256,
      approval,
      evidenceBundle: proposal.evidenceBundle,
      backups,
      results,
    });
  } catch (error) {
    auditUpdater(audit.path, {
      status: "failed",
      proposalArtifactSha256: proposal.artifactSha256,
      approvalArtifactSha256: approval.approvalArtifactSha256,
      approval,
      evidenceBundle: proposal.evidenceBundle,
      backups,
      results,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return { status: "completed", results, auditLogPath: audit.path, backups };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  runApplyReferenceProvenanceBackfill().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
