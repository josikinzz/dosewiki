#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDoi, normalizePmid } from "../../lib/citations/referenceIdentity.mjs";
import { normalizeSourceLookupKey, normalizeTextNeedle } from "./formal-citations-source-utils.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_LINEAGE_MANIFEST = path.join(
  ROOT,
  "scripts/data/tracked/citation-author-repair-lineage.json",
);

const EXPECTED_WAVES = new Map([
  ["deterministic-high-confidence", 74],
  ["independently-reviewed-residual", 685],
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXPECTED_PROVENANCE_BACKFILL = {
  proposalArtifactSha256: "8d19afa96040694258ceb4ab0f1f0ca51d3f1974259c78d19c2e042dd3b1ddfb",
  approvalArtifactSha256: "205b88f2abf08bdc0bab46a503c407ccf445d1362c3cb01221e9b33fe882ce48",
  auditPath: "scripts/data/audit-logs/2026-08-10T06-17-03-707Z-apply-citation-reference-provenance-backfill-759-repair-lineage-rows.json",
  auditFileSha256: "291234ed30de42165bb4504d8a3f67236a8325aca7dc3e6fb54aac0d4bc8584d",
};

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return sha256(canonicalJson(value));
}

export function canonicalMutationSet(referenceProviders) {
  return JSON.stringify(Object.keys(referenceProviders).sort());
}

export function mutationSetSha256(referenceProviders) {
  return sha256(canonicalMutationSet(referenceProviders));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveArtifactPath(artifactPath) {
  return path.resolve(ROOT, artifactPath);
}

function validateArtifactBinding(binding, label) {
  assert(binding && typeof binding === "object", `${label} binding is missing`);
  assert(typeof binding.path === "string" && binding.path.length > 0, `${label} path is missing`);
  assert(SHA256_PATTERN.test(binding.fileSha256), `${label} SHA-256 is invalid`);
  const filePath = resolveArtifactPath(binding.path);
  if (!fs.existsSync(filePath)) return { checked: false, path: binding.path };
  const actual = sha256(fs.readFileSync(filePath));
  assert(actual === binding.fileSha256, `${label} SHA-256 mismatch for ${binding.path}`);
  return { checked: true, path: binding.path };
}

function auditKeys(audit, label) {
  assert(audit.status === "completed", `${label} audit is not completed`);
  assert(Array.isArray(audit.results), `${label} audit results are missing`);
  for (const result of audit.results) {
    assert(result?.status === "updated", `${label} contains a non-updated result`);
  }
  return audit.results.map((result) => result.key).sort();
}

function validateCanonicalProvenanceBackfill(manifest) {
  const policy = manifest.canonicalMetadataProvenancePolicy;
  assert(typeof policy === "string" && policy.includes("All 759 repaired canonical references now retain bounded metadataProvenance"), "canonical metadata provenance policy is stale");
  const backfill = manifest.canonicalMetadataProvenanceBackfill;
  assert(backfill?.status === "completed", "canonical metadata provenance backfill is not completed");
  assert(backfill.sourceDeployment === manifest.sourceDeployment, "canonical metadata provenance deployment mismatch");
  assert(backfill.referenceCount === 759, "canonical metadata provenance reference count must be 759");
  assert(backfill.proposalArtifactSha256 === EXPECTED_PROVENANCE_BACKFILL.proposalArtifactSha256, "canonical metadata provenance proposal digest mismatch");
  assert(backfill.approvalArtifactSha256 === EXPECTED_PROVENANCE_BACKFILL.approvalArtifactSha256, "canonical metadata provenance approval digest mismatch");

  const audit = backfill.completedAudit;
  assert(audit?.path === EXPECTED_PROVENANCE_BACKFILL.auditPath, "canonical metadata provenance audit path mismatch");
  assert(audit.fileSha256 === EXPECTED_PROVENANCE_BACKFILL.auditFileSha256, "canonical metadata provenance audit SHA-256 mismatch");
  assert(audit.status === "completed", "canonical metadata provenance audit is not completed");
  assert(audit.successfulMutationCount === 759, "canonical metadata provenance audit mutation count must be 759");
  assert(audit.articleBackupCount === 182, "canonical metadata provenance audit backup count must be 182");

  assert(backfill.postApplyVerification?.pending === 0
    && backfill.postApplyVerification?.alreadyApplied === 759, "canonical metadata provenance post-apply verification mismatch");
  assert(SHA256_PATTERN.test(backfill.bindingSha256), "canonical metadata provenance completion digest is invalid");
  const { bindingSha256, ...completion } = backfill;
  assert(sha256Json(completion) === bindingSha256, "canonical metadata provenance completion digest mismatch");
  return {
    status: backfill.status,
    references: backfill.referenceCount,
    proposalArtifactSha256: backfill.proposalArtifactSha256,
    approvalArtifactSha256: backfill.approvalArtifactSha256,
    auditFileSha256: audit.fileSha256,
    bindingSha256: backfill.bindingSha256,
  };
}

function validateManualEvidence(wave, keys) {
  const manualEvidence = wave.manualEvidence ?? {};
  const emptyProviderKeys = keys.filter((key) => wave.referenceProviders[key].length === 0);
  assert(
    JSON.stringify(Object.keys(manualEvidence).sort()) === JSON.stringify(emptyProviderKeys.sort()),
    `${wave.name} manualEvidence must cover exactly the empty-provider rows`,
  );
  for (const [key, evidence] of Object.entries(manualEvidence)) {
    assert(evidence?.method === "independent_authoritative_source_review", `${key} has an invalid manual method`);
    assert(Array.isArray(evidence.evidenceDomains) && evidence.evidenceDomains.length > 0, `${key} has no evidence domains`);
    assert(evidence.evidenceDomains.every((domain) => typeof domain === "string" && domain.length > 0), `${key} has an invalid evidence domain`);
    assert(evidence.identifiers && typeof evidence.identifiers === "object", `${key} identifiers are missing`);
    assert(SHA256_PATTERN.test(evidence.reviewResultSha256), `${key} review result SHA-256 is invalid`);
    assert(SHA256_PATTERN.test(evidence.refutationArtifactSha256), `${key} refutation SHA-256 is invalid`);
  }
}

function exactAuthors(value, key) {
  assert(Array.isArray(value) && value.length > 0, `${key} evidence authors are missing`);
  assert(value.every((author) => typeof author === "string" && author.length > 0 && author.trim() === author), `${key} evidence authors are invalid`);
  assert(new Set(value).size === value.length, `${key} evidence authors contain duplicates`);
}

function validateEvidenceBundle(manifest, { verifyFiles, checkedArtifacts }) {
  const binding = manifest.evidenceBundle;
  assert(binding && typeof binding === "object", "tracked evidenceBundle binding is missing");
  assert(binding.path === "scripts/data/tracked/citation-author-repair-evidence.json", "tracked evidenceBundle path is invalid");
  assert(SHA256_PATTERN.test(binding.fileSha256), "tracked evidenceBundle file SHA-256 is invalid");
  assert(SHA256_PATTERN.test(binding.bundleDigest), "tracked evidenceBundle digest is invalid");
  assert(binding.rowCount === 759, "tracked evidenceBundle row count must be 759");
  const bundlePath = resolveArtifactPath(binding.path);
  assert(fs.existsSync(bundlePath), "tracked evidenceBundle file is required");
  const bytes = fs.readFileSync(bundlePath);
  assert(sha256(bytes) === binding.fileSha256, "tracked evidenceBundle file SHA-256 mismatch");
  const bundle = JSON.parse(bytes);
  assert(bundle?.artifactType === "citation_author_repair_evidence_bundle" && bundle?.artifactVersion === 1, "tracked evidenceBundle type/version is invalid");
  const { bundleDigest: declaredDigest, ...payload } = bundle;
  assert(declaredDigest === binding.bundleDigest && sha256Json(payload) === declaredDigest, "tracked evidenceBundle canonical digest mismatch");
  assert(bundle.sourceDeployment === manifest.sourceDeployment, "tracked evidenceBundle deployment mismatch");
  assert(Array.isArray(bundle.rows) && bundle.rows.length === 759, "tracked evidenceBundle must contain 759 rows");
  const rowsByKey = new Map();
  for (const row of bundle.rows) {
    assert(row?.key === `${row.slug}::${row.referenceId}` && !rowsByKey.has(row.key), `tracked evidenceBundle has invalid/duplicate key ${row?.key ?? "(missing)"}`);
    const wave = manifest.waves.find((entry) => entry.name === row.wave);
    assert(wave && Object.prototype.hasOwnProperty.call(wave.referenceProviders, row.key), `${row.key} evidence wave/key is not in lineage`);
    exactAuthors(row.authors, row.key);
    assert(row.identifiers && typeof row.identifiers === "object", `${row.key} evidence identifiers are missing`);
    assert((normalizeDoi(row.identifiers.doi) || null) === (row.identifiers.doi ?? null)
      && (normalizePmid(row.identifiers.pmid) || null) === (row.identifiers.pmid ?? null), `${row.key} evidence identifiers are noncanonical`);
    const stored = row.storedIdentity;
    assert(typeof stored?.title === "string" && normalizeTextNeedle(stored.title) === stored.normalizedTitle, `${row.key} stored title normalization is invalid`);
    assert(normalizeSourceLookupKey(stored.title) === stored.normalizedIdentityTitle, `${row.key} stored identity-title normalization is invalid`);
    assert((normalizeDoi(stored.doi) || null) === (stored.doi ?? null)
      && (normalizePmid(stored.pmid) || null) === (stored.pmid ?? null), `${row.key} stored identifiers are noncanonical`);
    assert(Array.isArray(row.titles) && row.titles.length > 0, `${row.key} evidence titles are missing`);
    for (const title of row.titles) {
      assert(typeof title.title === "string" && title.title.trim(), `${row.key} evidence title is invalid`);
      assert(typeof title.normalizedTitle === "string" && title.normalizedTitle, `${row.key} normalized title is invalid`);
      assert(normalizeTextNeedle(title.title) === title.normalizedTitle, `${row.key} evidence normalized title is invalid`);
      assert(normalizeSourceLookupKey(title.title) === title.normalizedIdentityTitle, `${row.key} normalized identity title is invalid`);
    }
    const titleMatches = row.titles.some((title) => title.normalizedIdentityTitle === stored.normalizedIdentityTitle);
    const stableIdentifierMatches = (row.identifiers.doi && row.identifiers.doi === stored.doi)
      || (row.identifiers.pmid && row.identifiers.pmid === stored.pmid);
    if (row.identityMatchBasis === "title_and_identifier") {
      assert(titleMatches, `${row.key} evidence title does not identify the stored work`);
    } else {
      assert(row.identityMatchBasis === "stable_identifier_with_independent_review"
        && row.wave === "independently-reviewed-residual" && stableIdentifierMatches, `${row.key} title mismatch lacks independently reviewed stable-identifier identity`);
    }
    if (row.identifiers.doi && stored.doi) assert(row.identifiers.doi === stored.doi, `${row.key} evidence DOI contradicts stored DOI`);
    if (row.identifiers.pmid && stored.pmid) assert(row.identifiers.pmid === stored.pmid, `${row.key} evidence PMID contradicts stored PMID`);
    assert(Array.isArray(row.provenance) && row.provenance.length > 0, `${row.key} provenance is missing`);
    const expectedKind = row.wave === "deterministic-high-confidence" ? "fetched" : "inspected";
    assert(row.provenance.every((entry) => entry.kind === expectedKind), `${row.key} evidence provenance kind is invalid`);
    assert(row.provenance.every((entry) => typeof entry.source === "string" && entry.source && typeof entry.provider === "string" && entry.provider), `${row.key} evidence provenance source/provider is invalid`);
    assert(row.provenance.every((entry) => Array.isArray(entry.authoritativeDomains)), `${row.key} evidence domains are invalid`);
    if (expectedKind === "fetched") {
      const providers = [...new Set(row.provenance.map((entry) => entry.provider))].sort();
      assert(JSON.stringify(providers) === JSON.stringify([...wave.referenceProviders[row.key]].sort()), `${row.key} fetched providers disagree with lineage`);
      assert(row.identifiers.doi || row.identifiers.pmid, `${row.key} fetched evidence lacks a stable identifier`);
    } else {
      assert(row.provenance.some((entry) => entry.source === "citation-author-repair:review-result")
        && row.provenance.some((entry) => entry.source === "citation-author-repair:independent-refutation"), `${row.key} inspected evidence lacks both independent lanes`);
    }
    const source = row.sourceBinding;
    assert(source?.proposalArtifactSha256 === wave.proposalArtifactSha256, `${row.key} proposal binding mismatch`);
    assert(source?.auditFileSha256 === wave.sourceArtifacts.audit.fileSha256, `${row.key} audit binding mismatch`);
    assert(source?.approvalFileSha256 === wave.sourceArtifacts.approval.fileSha256, `${row.key} approval binding mismatch`);
    assert(SHA256_PATTERN.test(source?.mutationSha256), `${row.key} mutation binding is invalid`);
    if (expectedKind === "inspected") {
      assert(SHA256_PATTERN.test(source.reviewResultSha256)
        && SHA256_PATTERN.test(source.reviewResultArtifactSha256)
        && SHA256_PATTERN.test(source.refutationArtifactSha256), `${row.key} review/refutation bindings are invalid`);
      assert(typeof source.primaryReviewerIdentifier === "string" && source.primaryReviewerIdentifier.trim(), `${row.key} primary reviewer is missing`);
      assert(typeof source.refutationReviewerIdentifier === "string" && source.refutationReviewerIdentifier.trim(), `${row.key} refutation reviewer is missing`);
      assert(source.primaryReviewerIdentifier.trim().toLowerCase() !== source.refutationReviewerIdentifier.trim().toLowerCase(), `${row.key} reviewers are not independent`);
    }
    rowsByKey.set(row.key, row);
  }
  for (const wave of manifest.waves) {
    const waveRows = bundle.rows.filter((row) => row.wave === wave.name);
    assert(waveRows.length === EXPECTED_WAVES.get(wave.name), `${wave.name} evidence coverage mismatch`);
    assert(JSON.stringify(waveRows.map((row) => row.key).sort()) === JSON.stringify(Object.keys(wave.referenceProviders).sort()), `${wave.name} evidence keys disagree with lineage`);
    if (verifyFiles) {
      const auditPath = resolveArtifactPath(wave.sourceArtifacts.audit.path);
      if (fs.existsSync(auditPath)) {
        const audit = readJson(auditPath);
        for (const mutation of audit.mutations ?? []) {
          const key = `${mutation.slug}::${mutation.referenceId}`;
          const row = rowsByKey.get(key);
          assert(row && sha256Json(mutation) === row.sourceBinding.mutationSha256, `${key} tracked mutation digest mismatch`);
          assert(JSON.stringify(mutation.proposedAuthors) === JSON.stringify(row.authors), `${key} tracked evidence authors disagree with audit`);
        }
      }
      const proposalBinding = wave.sourceArtifacts.proposal;
      const proposalPath = proposalBinding ? resolveArtifactPath(proposalBinding.path) : null;
      if (proposalPath && fs.existsSync(proposalPath)) {
        const proposal = readJson(proposalPath);
        assert(proposal.artifactSha256 === wave.proposalArtifactSha256, `${wave.name} reviewed proposal digest mismatch`);
        const proposalRows = new Map((proposal.highConfidence ?? []).map((row) => [row.key, row]));
        assert(proposalRows.size === wave.successfulMutationCount, `${wave.name} reviewed proposal coverage mismatch`);
        for (const row of waveRows) {
          const proposalRow = proposalRows.get(row.key);
          assert(proposalRow && proposalRow.expectedReferenceSha256 === row.sourceBinding.expectedReferenceSha256, `${row.key} expected-reference binding mismatch`);
          assert(sha256Json(proposalRow.expectedReference) === row.sourceBinding.expectedReferenceSha256, `${row.key} expected-reference digest mismatch`);
          assert(proposalRow.expectedReference.title === row.storedIdentity.title
            && (normalizeDoi(proposalRow.expectedReference.doi) || null) === row.storedIdentity.doi
            && (normalizePmid(proposalRow.expectedReference.pmid) || null) === row.storedIdentity.pmid, `${row.key} stored identity disagrees with reviewed proposal`);
          assert(JSON.stringify(proposalRow.proposedAuthors) === JSON.stringify(row.authors), `${row.key} authors disagree with reviewed proposal`);
        }
      }
    }
  }
  checkedArtifacts.push({ checked: true, path: binding.path });
  return bundle;
}

export function validateCitationAuthorRepairLineage(manifest, { verifyFiles = true } = {}) {
  assert(manifest?.artifactType === "citation_author_repair_lineage_manifest", "unexpected artifactType");
  assert(manifest?.artifactVersion === 2, "unexpected artifactVersion");
  assert(typeof manifest.mutationSetCanonicalization === "string", "mutation-set canonicalization is undocumented");
  assert(Array.isArray(manifest.waves) && manifest.waves.length === EXPECTED_WAVES.size, "unexpected wave count");
  const canonicalMetadataProvenanceBackfill = validateCanonicalProvenanceBackfill(manifest);

  const allKeys = new Set();
  const checkedArtifacts = [];
  if (verifyFiles) {
    checkedArtifacts.push(validateArtifactBinding(
      manifest.canonicalMetadataProvenanceBackfill.completedAudit,
      "canonical metadata provenance completed audit",
    ));
  }
  const waveSummaries = [];
  for (const wave of manifest.waves) {
    const expectedCount = EXPECTED_WAVES.get(wave.name);
    assert(expectedCount !== undefined, `unexpected wave ${wave.name}`);
    assert(wave.successfulMutationCount === expectedCount, `${wave.name} successfulMutationCount must be ${expectedCount}`);
    assert(wave.referenceProviders && !Array.isArray(wave.referenceProviders), `${wave.name} referenceProviders is invalid`);
    const keys = Object.keys(wave.referenceProviders);
    assert(keys.length === expectedCount, `${wave.name} must contain ${expectedCount} unique references`);
    assert(keys.every((key) => key.includes("::")), `${wave.name} contains an invalid reference key`);
    for (const key of keys) {
      assert(!allKeys.has(key), `reference key overlaps waves: ${key}`);
      allKeys.add(key);
      const providers = wave.referenceProviders[key];
      assert(Array.isArray(providers), `${key} providers must be an array`);
      assert(providers.every((provider) => typeof provider === "string" && provider.length > 0), `${key} contains an invalid provider`);
    }
    assert(mutationSetSha256(wave.referenceProviders) === wave.mutationSetSha256, `${wave.name} mutationSetSha256 mismatch`);
    validateManualEvidence(wave, keys);

    if (verifyFiles) {
      for (const [artifactName, binding] of Object.entries(wave.sourceArtifacts ?? {})) {
        checkedArtifacts.push(validateArtifactBinding(binding, `${wave.name} ${artifactName}`));
      }
      const auditBinding = wave.sourceArtifacts?.audit;
      const auditPath = auditBinding ? resolveArtifactPath(auditBinding.path) : null;
      if (auditPath && fs.existsSync(auditPath)) {
        const audit = readJson(auditPath);
        assert(audit.proposalArtifactSha256 === wave.proposalArtifactSha256, `${wave.name} audit proposal digest mismatch`);
        assert(JSON.stringify(auditKeys(audit, wave.name)) === JSON.stringify([...keys].sort()), `${wave.name} audit coverage mismatch`);
      }
    }
    waveSummaries.push({ name: wave.name, references: keys.length, manualEvidence: Object.keys(wave.manualEvidence ?? {}).length });
  }

  assert(allKeys.size === 759, "combined repair coverage must be 759 unique references");
  const bundle = validateEvidenceBundle(manifest, { verifyFiles, checkedArtifacts });
  return {
    valid: true,
    references: allKeys.size,
    evidenceRows: bundle.rows.length,
    evidenceBundleDigest: bundle.bundleDigest,
    canonicalMetadataProvenanceBackfill,
    waves: waveSummaries,
    artifactsChecked: checkedArtifacts.filter(({ checked }) => checked).length,
    artifactsUnavailable: checkedArtifacts.filter(({ checked }) => !checked).map(({ path: artifactPath }) => artifactPath),
  };
}

export function validateLineageFile(filePath = DEFAULT_LINEAGE_MANIFEST, options) {
  return validateCitationAuthorRepairLineage(readJson(filePath), options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_LINEAGE_MANIFEST;
  try {
    console.log(JSON.stringify(validateLineageFile(filePath), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
