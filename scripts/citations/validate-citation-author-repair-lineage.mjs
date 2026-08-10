#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

export function validateCitationAuthorRepairLineage(manifest, { verifyFiles = true } = {}) {
  assert(manifest?.artifactType === "citation_author_repair_lineage_manifest", "unexpected artifactType");
  assert(manifest?.artifactVersion === 2, "unexpected artifactVersion");
  assert(typeof manifest.mutationSetCanonicalization === "string", "mutation-set canonicalization is undocumented");
  assert(Array.isArray(manifest.waves) && manifest.waves.length === EXPECTED_WAVES.size, "unexpected wave count");

  const allKeys = new Set();
  const checkedArtifacts = [];
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
  return {
    valid: true,
    references: allKeys.size,
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
