#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, getDataBackend, postgresFingerprintFromUrl, resolvePostgresSource } from "../lib/data-client.ts";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  normalizeDoi,
  normalizePmid,
  normalizeReferenceMetadataProvenance,
} from "../../lib/citations/referenceIdentity.mjs";
import { findRepoRoot, getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import { getAllReferenceMetadata } from "../lib/data-pagination.mjs";
import {
  DEFAULT_LINEAGE_MANIFEST,
  validateCitationAuthorRepairLineage,
} from "./validate-citation-author-repair-lineage.mjs";
import { normalizeSourceLookupKey, normalizeTextNeedle } from "./formal-citations-source-utils.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

const ARTIFACT_TYPE = "citation_reference_provenance_backfill_proposal";
const ARTIFACT_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

export function sameSemanticJson(left, right) {
  return JSON.stringify(stableJsonValue(left)) === JSON.stringify(stableJsonValue(right));
}

function canonicalIsoTimestamp(value) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), "generatedAt must be canonical ISO-8601");
  assert(new Date(value).toISOString() === value, "generatedAt must be a real canonical ISO-8601 timestamp");
  return value;
}


function exactAuthors(value, key) {
  assert(Array.isArray(value) && value.length > 0, `${key} has no expected authors`);
  assert(value.every((author) => typeof author === "string" && author.length > 0 && author === author.trim()), `${key} has invalid expected authors`);
  assert(new Set(value).size === value.length, `${key} has duplicate expected authors`);
  return structuredClone(value);
}

function referenceKeyParts(key) {
  const separator = key.indexOf("::");
  assert(separator > 0 && separator < key.length - 2, `Invalid lineage key ${key}`);
  return { slug: key.slice(0, separator), referenceId: key.slice(separator + 2) };
}

function verifiedCurrentProvenance(reference, key) {
  if (!Object.prototype.hasOwnProperty.call(reference, "metadataProvenance")) return null;
  assert(Array.isArray(reference.metadataProvenance), `${key} has non-array live metadataProvenance`);
  const normalized = normalizeReferenceMetadataProvenance(reference.metadataProvenance);
  assert(sameSemanticJson(normalized, reference.metadataProvenance), `${key} live metadataProvenance is not canonical`);
  return structuredClone(reference.metadataProvenance);
}

function evidenceEntries(row, key) {
  return row.provenance.flatMap((entry) => {
    const artifactDigest = entry.kind === "fetched"
      ? row.sourceBinding.proposalArtifactSha256
      : entry.source === "citation-author-repair:review-result"
        ? row.sourceBinding.reviewResultArtifactSha256
        : row.sourceBinding.refutationArtifactSha256;
    assert(SHA256_PATTERN.test(artifactDigest), `${key} evidence artifact digest is invalid`);
    const providers = entry.kind === "inspected"
      ? [...new Set(entry.authoritativeDomains ?? [])]
      : [entry.provider];
    assert(providers.length > 0 && providers.every((provider) => typeof provider === "string" && provider), `${key} evidence providers are invalid`);
    return providers.map((provider) => ({
      kind: entry.kind,
      source: entry.source,
      provider,
      artifactDigest,
      fields: ["authors"],
    }));
  });
}

function assertEvidenceMatchesLive(row, reference, key) {
  assert(sameSemanticJson(row.authors, reference.authors), `${key} tracked evidence authors do not match live authors`);
  const liveTitle = normalizeTextNeedle(reference.title);
  const liveIdentityTitle = normalizeSourceLookupKey(reference.title);
  assert(liveTitle && row.storedIdentity?.normalizedTitle === liveTitle, `${key} tracked stored title does not match live title`);
  assert(row.storedIdentity.normalizedIdentityTitle === liveIdentityTitle, `${key} tracked stored title identity does not match live work`);
  const evidenceTitleMatches = row.titles.some((title) => title.normalizedIdentityTitle === liveIdentityTitle);
  const liveDoi = normalizeDoi(reference.doi) || null;
  const livePmid = normalizePmid(reference.pmid) || null;
  assert(row.storedIdentity.doi === liveDoi && row.storedIdentity.pmid === livePmid, `${key} tracked stored identifiers do not match live reference`);
  const stableIdentifierMatches = (row.identifiers.doi && row.identifiers.doi === liveDoi)
    || (row.identifiers.pmid && row.identifiers.pmid === livePmid);
  if (row.identityMatchBasis === "title_and_identifier") {
    assert(evidenceTitleMatches, `${key} inspected/fetched evidence title does not match live work`);
  } else {
    assert(row.identityMatchBasis === "stable_identifier_with_independent_review"
      && row.wave === "independently-reviewed-residual" && stableIdentifierMatches, `${key} evidence title mismatch lacks independently reviewed stable-identifier identity`);
  }
  if (row.identifiers.doi && liveDoi) assert(row.identifiers.doi === liveDoi, `${key} evidence DOI contradicts live DOI`);
  if (row.identifiers.pmid && livePmid) assert(row.identifiers.pmid === livePmid, `${key} evidence PMID contradicts live PMID`);
}

export function buildReferenceProvenanceBackfillProposal({
  lineage,
  lineageManifestSha256,
  lineageManifestPath,
  evidenceBundle,
  evidenceBundleFileSha256,
  articles,
  sourceDeployment,
  generatedAt,
}) {
  canonicalIsoTimestamp(generatedAt);
  assertCitationSourceIdentity(sourceDeployment);
  assert(SHA256_PATTERN.test(lineageManifestSha256), "Lineage manifest SHA-256 is invalid");
  const articlesBySlug = new Map();
  for (const article of articles) {
    const bucket = articlesBySlug.get(article.slug) ?? [];
    bucket.push(article);
    articlesBySlug.set(article.slug, bucket);
  }
  assert(evidenceBundle?.artifactType === "citation_author_repair_evidence_bundle" && evidenceBundle?.artifactVersion === 1, "Tracked evidence bundle type/version is invalid");
  assert(evidenceBundle.bundleDigest === lineage.evidenceBundle?.bundleDigest, "Tracked evidence bundle digest disagrees with lineage");
  assert(evidenceBundleFileSha256 === lineage.evidenceBundle?.fileSha256, "Tracked evidence bundle file hash disagrees with lineage");
  const evidenceByKey = new Map(evidenceBundle.rows.map((row) => [row.key, row]));
  assert(evidenceByKey.size === 759, "Tracked evidence bundle must contain 759 unique rows");
  const rows = [];
  for (const wave of lineage.waves) {
    const keys = Object.keys(wave.referenceProviders).sort();
    assert(keys.length === wave.successfulMutationCount, `${wave.name} lineage count mismatch`);
    for (const key of keys) {
      const { slug, referenceId } = referenceKeyParts(key);
      const articleMatches = articlesBySlug.get(slug) ?? [];
      assert(articleMatches.length === 1, `${key} requires exactly one live article; found ${articleMatches.length}`);
      const referenceMatches = (articleMatches[0].references ?? []).filter((reference) => reference?.id === referenceId);
      assert(referenceMatches.length === 1, `${key} requires exactly one live reference; found ${referenceMatches.length}`);
      const reference = referenceMatches[0];
      const evidence = evidenceByKey.get(key);
      assert(evidence?.wave === wave.name, `${key} is missing from its tracked evidence wave`);
      const expectedAuthors = exactAuthors(evidence.authors, key);
      assert(typeof reference.title === "string" && normalizeTextNeedle(reference.title), `${key} has no usable live title`);
      assertEvidenceMatchesLive(evidence, reference, key);
      const expectedMetadataProvenance = verifiedCurrentProvenance(reference, key);
      const newEntries = evidenceEntries(evidence, key);
      const proposedMetadataProvenance = normalizeReferenceMetadataProvenance([
        ...(expectedMetadataProvenance ?? []),
        ...newEntries,
      ]);
      assert(proposedMetadataProvenance.length > 0 && proposedMetadataProvenance.length <= 32, `${key} proposed provenance is empty or unbounded`);
      const proposedSet = new Set(proposedMetadataProvenance.map((entry) => JSON.stringify(stableJsonValue(entry))));
      assert((expectedMetadataProvenance ?? []).every((entry) => proposedSet.has(JSON.stringify(stableJsonValue(entry)))), `${key} proposed provenance would remove live lineage`);
      rows.push({
        key,
        slug,
        referenceId,
        wave: wave.name,
        identifiers: {
          doi: normalizeDoi(reference.doi) || null,
          pmid: normalizePmid(reference.pmid) || null,
        },
        expectedTitle: reference.title,
        normalizedTitle: normalizeTextNeedle(reference.title),
        expectedAuthors,
        expectedMetadataProvenance,
        expectedMetadataProvenanceSha256: sha256Json(expectedMetadataProvenance),
        proposedMetadataProvenance,
        proposedMetadataProvenanceSha256: sha256Json(proposedMetadataProvenance),
        sourceBinding: {
          proposalArtifactSha256: wave.proposalArtifactSha256,
          auditFileSha256: wave.sourceArtifacts.audit.fileSha256,
          approvalFileSha256: wave.sourceArtifacts.approval.fileSha256,
          evidenceBundleDigest: evidenceBundle.bundleDigest,
          evidenceBundleFileSha256,
          evidenceRowSha256: sha256Json(evidence),
          ...(wave.name === "independently-reviewed-residual" ? {
            reviewedEvidence: {
              reviewResultSha256: evidence.sourceBinding.reviewResultSha256,
              reviewResultArtifactSha256: evidence.sourceBinding.reviewResultArtifactSha256,
              refutationArtifactSha256: evidence.sourceBinding.refutationArtifactSha256,
            },
          } : {}),
          ...(wave.manualEvidence?.[key] ? { manualEvidence: wave.manualEvidence[key] } : {}),
        },
      });
    }
  }
  rows.sort((left, right) => left.key.localeCompare(right.key));
  assert(rows.length === 759 && new Set(rows.map((row) => row.key)).size === 759, "Backfill proposal must contain exactly 759 unique rows");
  const payload = {
    artifactType: ARTIFACT_TYPE,
    artifactVersion: ARTIFACT_VERSION,
    generatedAt,
    sourceDeployment,
    mode: "read_only_proposal",
    lineageManifest: {
      path: lineageManifestPath,
      fileSha256: lineageManifestSha256,
      artifactVersion: lineage.artifactVersion,
    },
    evidenceBundle: {
      path: lineage.evidenceBundle.path,
      fileSha256: evidenceBundleFileSha256,
      bundleDigest: evidenceBundle.bundleDigest,
      artifactVersion: evidenceBundle.artifactVersion,
    },
    summary: {
      rows: rows.length,
      fetched: rows.filter((row) => row.wave === "deterministic-high-confidence").length,
      inspected: rows.filter((row) => row.wave === "independently-reviewed-residual").length,
    },
    rows,
  };
  return { ...payload, artifactSha256: sha256Json(payload) };
}

export async function runPlanReferenceProvenanceBackfill(argv = process.argv.slice(2), dependencies = {}) {
  if (hasFlag(argv, "--write") || hasFlag(argv, "--execute")) {
    throw new Error("The provenance backfill planner is read-only and rejects --write/--execute.");
  }
  const repoRoot = dependencies.repoRoot ?? findRepoRoot();
  const env = dependencies.env ?? process.env;
  getDataBackend(env);
  const { url: sourceUrl } = resolvePostgresSource({ argv, env });
  assert(sourceUrl, "--source-url or SOURCE_POSTGRES_URL must select a Postgres source");
  const sourceDeployment = postgresFingerprintFromUrl(sourceUrl);
  const outputValue = getFlagValue(argv, "--output");
  assert(outputValue, "--output is required and must name a new immutable proposal path");
  const outputPath = resolve(repoRoot, outputValue);
  const lineagePath = resolve(repoRoot, getFlagValue(argv, "--lineage") ?? relative(repoRoot, DEFAULT_LINEAGE_MANIFEST));
  const lineageBytes = readFileSync(lineagePath);
  const lineage = JSON.parse(lineageBytes.toString("utf8"));
  validateCitationAuthorRepairLineage(lineage, { verifyFiles: true });
  const evidenceBundlePath = resolve(repoRoot, lineage.evidenceBundle.path);
  const evidenceBundleBytes = readFileSync(evidenceBundlePath);
  const evidenceBundle = JSON.parse(evidenceBundleBytes.toString("utf8"));
  const evidenceBundleFileSha256 = sha256Bytes(evidenceBundleBytes);
  assert(evidenceBundleFileSha256 === lineage.evidenceBundle.fileSha256, "Tracked evidence bundle file hash mismatch");
  const client = dependencies.client ?? createDataClient({ target: sourceUrl, argv, env }).client;
  const queryApi = dependencies.api ?? api;
  const articles = await getAllReferenceMetadata(client, queryApi.substanceIndex.getReferenceMetadataPage);
  const proposal = buildReferenceProvenanceBackfillProposal({
    lineage,
    lineageManifestSha256: sha256Bytes(lineageBytes),
    lineageManifestPath: relative(repoRoot, lineagePath),
    evidenceBundle,
    evidenceBundleFileSha256,
    articles,
    sourceDeployment,
    generatedAt: dependencies.generatedAt ?? new Date().toISOString(),
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  const descriptor = openSync(outputPath, "wx");
  try {
    writeFileSync(descriptor, `${JSON.stringify(proposal, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
  (dependencies.logger ?? console).log(JSON.stringify({
    output: relative(repoRoot, outputPath),
    artifactSha256: proposal.artifactSha256,
    summary: proposal.summary,
  }, null, 2));
  return proposal;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  runPlanReferenceProvenanceBackfill().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
