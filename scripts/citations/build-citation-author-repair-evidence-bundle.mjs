#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDoi, normalizePmid } from "../../lib/citations/referenceIdentity.mjs";
import { normalizeSourceLookupKey, normalizeTextNeedle } from "./formal-citations-source-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_LINEAGE = path.join(ROOT, "scripts/data/tracked/citation-author-repair-lineage.json");
export const DEFAULT_EVIDENCE_BUNDLE = path.join(ROOT, "scripts/data/tracked/citation-author-repair-evidence.json");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value) {
  return sha256Bytes(canonicalJson(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function artifactPayload(artifact) {
  const { artifactSha256: _artifactSha256, ...payload } = artifact;
  return payload;
}

function readHashBoundProposal(sourceArtifact, expectedArtifactSha256, label) {
  assert(sourceArtifact && typeof sourceArtifact.path === "string" && sourceArtifact.path, `${label} proposal source path is missing`);
  assert(SHA256_PATTERN.test(sourceArtifact.fileSha256), `${label} proposal file hash is invalid`);
  assert(SHA256_PATTERN.test(expectedArtifactSha256), `${label} proposal artifact digest is invalid`);
  const proposalPath = path.resolve(ROOT, sourceArtifact.path);
  const bytes = fs.readFileSync(proposalPath);
  assert(sha256Bytes(bytes) === sourceArtifact.fileSha256, `${label} proposal file hash mismatch`);
  const proposal = JSON.parse(bytes.toString("utf8"));
  assert(proposal?.artifactSha256 === expectedArtifactSha256, `${label} proposal declared artifact digest mismatch`);
  assert(sha256Json(artifactPayload(proposal)) === expectedArtifactSha256, `${label} proposal canonical artifact digest mismatch`);
  return proposal;
}

function exactAuthors(value, key) {
  assert(Array.isArray(value) && value.length > 0, `${key} has no authors`);
  assert(value.every((author) => typeof author === "string" && author.trim() === author && author.length > 0), `${key} has invalid authors`);
  assert(new Set(value).size === value.length, `${key} has duplicate authors`);
  return structuredClone(value);
}

function domains(urls, key) {
  return [...new Set((urls ?? []).map((value) => {
    const url = new URL(value);
    assert(url.protocol === "https:", `${key} evidence URL must use HTTPS`);
    return url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  }))].sort();
}

function providerDomain(provider) {
  return ({
    crossref: "api.crossref.org",
    pubmed: "pubmed.ncbi.nlm.nih.gov",
    openalex: "api.openalex.org",
  })[provider] ?? null;
}

function identifiersFromLanes(lanes, key) {
  const dois = new Set();
  const pmids = new Set();
  for (const lane of lanes ?? []) {
    const doi = normalizeDoi(lane?.identifiers?.doi);
    const pmid = normalizePmid(lane?.identifiers?.pmid);
    if (doi) dois.add(doi);
    if (pmid) pmids.add(pmid);
  }
  assert(dois.size <= 1 && pmids.size <= 1, `${key} has contradictory provider identifiers`);
  return { doi: [...dois][0] ?? null, pmid: [...pmids][0] ?? null };
}

function titleEvidence(values, key) {
  const entries = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const title = value.trim();
    const normalizedTitle = normalizeTextNeedle(title);
    const normalizedIdentityTitle = normalizeSourceLookupKey(title);
    assert(normalizedIdentityTitle, `${key} has unusable evidence title`);
    const identity = normalizedIdentityTitle;
    if (seen.has(identity)) continue;
    seen.add(identity);
    entries.push({ title, normalizedTitle, normalizedIdentityTitle });
  }
  assert(entries.length > 0, `${key} has no evidence title`);
  return entries;
}

function validateAudit(audit, wave) {
  assert(audit?.status === "completed", `${wave.name} audit is not completed`);
  assert(audit.proposalArtifactSha256 === wave.proposalArtifactSha256, `${wave.name} proposal digest mismatch`);
  assert(Array.isArray(audit.mutations) && audit.mutations.length === wave.successfulMutationCount, `${wave.name} audit mutation coverage mismatch`);
  const resultKeys = (audit.results ?? []).filter((result) => result.status === "updated").map((result) => result.key).sort();
  const mutationKeys = audit.mutations.map((mutation) => `${mutation.slug}::${mutation.referenceId}`).sort();
  assert(JSON.stringify(resultKeys) === JSON.stringify(mutationKeys), `${wave.name} successful result coverage mismatch`);
}

function storedIdentity(title, identifiers, key) {
  assert(typeof title === "string" && title.trim(), `${key} stored identity title is missing`);
  const normalizedTitle = normalizeTextNeedle(title);
  const normalizedIdentityTitle = normalizeSourceLookupKey(title);
  assert(normalizedIdentityTitle, `${key} stored identity title is unusable`);
  return {
    title: title.trim(),
    normalizedTitle,
    normalizedIdentityTitle,
    doi: normalizeDoi(identifiers?.doi) || null,
    pmid: normalizePmid(identifiers?.pmid) || null,
  };
}

function deterministicRow(wave, mutation, auditFileSha256, approvalFileSha256) {
  const key = `${mutation.slug}::${mutation.referenceId}`;
  const successful = [];
  for (const lane of mutation.providerLanes ?? []) {
    assert(["doi", "pmid"].includes(lane.providerLane), `${key} has invalid identifier lane`);
    for (const record of lane.metadataProvenance ?? []) {
      if (record?.status !== "success") continue;
      assert(typeof record.provider === "string" && record.provider, `${key} has invalid provider`);
      assert(JSON.stringify(record.title) === JSON.stringify(lane.title), `${key} provider title disagrees with lane title`);
      assert(record.authorCount === mutation.proposedAuthors.length, `${key} provider author count mismatch`);
      assert(JSON.stringify(lane.authors) === JSON.stringify(mutation.proposedAuthors), `${key} provider authors do not exactly support applied authors`);
      successful.push({
        kind: "fetched",
        source: `citation-author-repair:${lane.providerLane}`,
        identifierLane: lane.providerLane,
        provider: record.provider,
        authoritativeDomains: [providerDomain(record.provider)].filter(Boolean),
      });
    }
  }
  assert(successful.length > 0, `${key} has no successful fetched provider evidence`);
  const expectedProviders = [...new Set(wave.referenceProviders[key] ?? [])].sort();
  assert(JSON.stringify([...new Set(successful.map((entry) => entry.provider))].sort()) === JSON.stringify(expectedProviders), `${key} provider evidence disagrees with lineage`);
  const identifiers = identifiersFromLanes(mutation.providerLanes, key);
  assert(identifiers.doi || identifiers.pmid, `${key} deterministic evidence lacks a stable identifier`);
  return {
    key,
    slug: mutation.slug,
    referenceId: mutation.referenceId,
    wave: wave.name,
    authors: exactAuthors(mutation.proposedAuthors, key),
    storedIdentity: storedIdentity(mutation.providerLanes[0].title, identifiers, key),
    identifiers,
    titles: titleEvidence((mutation.providerLanes ?? []).map((lane) => lane.title), key),
    provenance: successful,
    sourceBinding: {
      proposalArtifactSha256: wave.proposalArtifactSha256,
      auditFileSha256,
      approvalFileSha256,
      mutationSha256: sha256Json(mutation),
    },
  };
}

function reviewedRow(wave, mutation, proposalRow, auditFileSha256, approvalFileSha256) {
  const key = `${mutation.slug}::${mutation.referenceId}`;
  const reviewed = mutation.reviewedEvidence;
  assert(proposalRow?.key === key && proposalRow.classification === "high_confidence", `${key} reviewed proposal row is missing`);
  assert(proposalRow.expectedReferenceSha256 === sha256Json(proposalRow.expectedReference), `${key} expected reference digest mismatch`);
  assert(JSON.stringify(proposalRow.proposedAuthors) === JSON.stringify(mutation.proposedAuthors), `${key} reviewed proposal authors disagree with audit`);
  assert(reviewed?.result?.key === key && reviewed?.refutation?.key === key, `${key} reviewed evidence key mismatch`);
  assert(reviewed.result.decision === "resolved" && reviewed.refutationDecision === "survived_refutation" && reviewed.refutation.decision === "survived_refutation", `${key} lacks surviving independent review`);
  assert(SHA256_PATTERN.test(reviewed.reviewResultSha256) && SHA256_PATTERN.test(reviewed.reviewResultArtifactSha256) && SHA256_PATTERN.test(reviewed.refutationArtifactSha256), `${key} reviewed evidence digest invalid`);
  assert(sha256Json(reviewed.result) === reviewed.reviewResultSha256, `${key} review-result digest mismatch`);
  assert(JSON.stringify(reviewed.result.authors) === JSON.stringify(mutation.proposedAuthors), `${key} reviewed authors disagree with applied authors`);
  assert(reviewed.refutation.reviewResultSha256 === reviewed.reviewResultSha256, `${key} refutation is not bound to review result`);
  assert(reviewed.refutation.originalReviewerIdentifier === reviewed.primaryReviewerIdentifier, `${key} original reviewer mismatch`);
  assert(reviewed.refutation.refutationReviewerIdentifier === reviewed.refutationReviewerIdentifier, `${key} refuter mismatch`);
  assert(reviewed.primaryReviewerIdentifier.trim().toLocaleLowerCase("en-US") !== reviewed.refutationReviewerIdentifier.trim().toLocaleLowerCase("en-US"), `${key} reviewers are not independent`);
  const identifiers = {
    doi: normalizeDoi(reviewed.result.doi) || null,
    pmid: normalizePmid(reviewed.result.pmid) || null,
  };
  const refutationDomains = domains(reviewed.refutation.authoritativeSourceUrls, key);
  const reviewDomains = domains(reviewed.result.sourceUrls, key);
  assert(reviewDomains.length > 0 && refutationDomains.length > 0, `${key} reviewed evidence lacks authoritative domains`);
  return {
    key,
    slug: mutation.slug,
    referenceId: mutation.referenceId,
    wave: wave.name,
    authors: exactAuthors(mutation.proposedAuthors, key),
    storedIdentity: storedIdentity(proposalRow.expectedReference.title, proposalRow.expectedReference, key),
    identifiers,
    titles: titleEvidence([reviewed.result.title], key),
    provenance: [{
      kind: "inspected",
      source: "citation-author-repair:review-result",
      identifierLane: identifiers.doi ? "doi" : identifiers.pmid ? "pmid" : null,
      provider: reviewDomains[0],
      authoritativeDomains: reviewDomains,
    }, {
      kind: "inspected",
      source: "citation-author-repair:independent-refutation",
      identifierLane: identifiers.doi ? "doi" : identifiers.pmid ? "pmid" : null,
      provider: refutationDomains[0],
      authoritativeDomains: refutationDomains,
    }],
    sourceBinding: {
      proposalArtifactSha256: wave.proposalArtifactSha256,
      auditFileSha256,
      approvalFileSha256,
      mutationSha256: sha256Json(mutation),
      expectedReferenceSha256: proposalRow.expectedReferenceSha256,
      reviewResultSha256: reviewed.reviewResultSha256,
      reviewResultArtifactSha256: reviewed.reviewResultArtifactSha256,
      refutationArtifactSha256: reviewed.refutationArtifactSha256,
      primaryReviewerIdentifier: reviewed.primaryReviewerIdentifier,
      refutationReviewerIdentifier: reviewed.refutationReviewerIdentifier,
    },
  };
}

export function buildEvidenceBundle({ lineage, auditsByWave, proposalsByWave = new Map() }) {
  const rows = [];
  const waves = [];
  for (const wave of lineage.waves ?? []) {
    const auditEntry = auditsByWave.get(wave.name);
    assert(auditEntry, `${wave.name} audit is unavailable`);
    const { audit, fileSha256 } = auditEntry;
    validateAudit(audit, wave);
    assert(fileSha256 === wave.sourceArtifacts.audit.fileSha256, `${wave.name} audit file hash mismatch`);
    const keys = new Set(Object.keys(wave.referenceProviders));
    const proposalRows = new Map((proposalsByWave.get(wave.name)?.highConfidence ?? []).map((row) => [row.key, row]));
    if (wave.name === "independently-reviewed-residual") {
      assert(proposalsByWave.get(wave.name)?.artifactSha256 === wave.proposalArtifactSha256, `${wave.name} reviewed proposal hash mismatch`);
      assert(proposalRows.size === wave.successfulMutationCount, `${wave.name} reviewed proposal coverage mismatch`);
    }
    for (const mutation of audit.mutations) {
      const key = `${mutation.slug}::${mutation.referenceId}`;
      assert(keys.delete(key), `${wave.name} audit contains unexpected ${key}`);
      rows.push(wave.name === "deterministic-high-confidence"
        ? deterministicRow(wave, mutation, fileSha256, wave.sourceArtifacts.approval.fileSha256)
        : reviewedRow(wave, mutation, proposalRows.get(key), fileSha256, wave.sourceArtifacts.approval.fileSha256));
    }
    assert(keys.size === 0, `${wave.name} audit misses lineage keys`);
    waves.push({
      name: wave.name,
      successfulMutationCount: wave.successfulMutationCount,
      proposalArtifactSha256: wave.proposalArtifactSha256,
      ...(wave.sourceArtifacts.proposal ? { proposalFileSha256: wave.sourceArtifacts.proposal.fileSha256 } : {}),
      auditFileSha256: fileSha256,
      approvalFileSha256: wave.sourceArtifacts.approval.fileSha256,
    });
  }
  for (const row of rows) {
    const titleMatches = row.titles.some((title) => title.normalizedIdentityTitle === row.storedIdentity.normalizedIdentityTitle);
    if (titleMatches) {
      row.identityMatchBasis = "title_and_identifier";
    } else {
      const stableIdentifierMatches = (row.identifiers.doi && row.identifiers.doi === row.storedIdentity.doi)
        || (row.identifiers.pmid && row.identifiers.pmid === row.storedIdentity.pmid);
      assert(row.wave === "independently-reviewed-residual" && stableIdentifierMatches, `${row.key} title mismatch lacks independently reviewed stable-identifier identity`);
      row.identityMatchBasis = "stable_identifier_with_independent_review";
    }
  }
  rows.sort((left, right) => left.key.localeCompare(right.key));
  assert(rows.length === 759 && new Set(rows.map((row) => row.key)).size === 759, "Evidence bundle must cover exactly 759 unique rows");
  assert(rows.filter((row) => row.wave === "deterministic-high-confidence").length === 74, "Fetched evidence coverage must be 74");
  assert(rows.filter((row) => row.wave === "independently-reviewed-residual").length === 685, "Inspected evidence coverage must be 685");
  const payload = {
    artifactType: "citation_author_repair_evidence_bundle",
    artifactVersion: 1,
    scope: "Sanitized, hash-bound evidence for the 759 successful citation-author repairs; no raw quotes or secrets.",
    sourceDeployment: lineage.sourceDeployment,
    waves,
    rows,
  };
  return { ...payload, bundleDigest: sha256Json(payload) };
}

export function buildEvidenceBundleFromFiles({ lineagePath = DEFAULT_LINEAGE, outputPath = DEFAULT_EVIDENCE_BUNDLE } = {}) {
  const lineage = readJson(lineagePath);
  const auditsByWave = new Map(lineage.waves.map((wave) => {
    const auditPath = path.resolve(ROOT, wave.sourceArtifacts.audit.path);
    const bytes = fs.readFileSync(auditPath);
    return [wave.name, { audit: JSON.parse(bytes), fileSha256: sha256Bytes(bytes) }];
  }));
  const proposalsByWave = new Map();
  for (const wave of lineage.waves ?? []) {
    if (!wave.sourceArtifacts?.proposal) continue;
    proposalsByWave.set(wave.name, readHashBoundProposal(
      wave.sourceArtifacts.proposal,
      wave.proposalArtifactSha256,
      wave.name,
    ));
  }
  const bundle = buildEvidenceBundle({ lineage, auditsByWave, proposalsByWave });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputFlag = process.argv.find((value) => value.startsWith("--output="));
    const outputPath = outputFlag ? path.resolve(outputFlag.slice("--output=".length)) : DEFAULT_EVIDENCE_BUNDLE;
    const bundle = buildEvidenceBundleFromFiles({ outputPath });
    console.log(JSON.stringify({ output: path.relative(ROOT, outputPath), rows: bundle.rows.length, bundleDigest: bundle.bundleDigest }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
