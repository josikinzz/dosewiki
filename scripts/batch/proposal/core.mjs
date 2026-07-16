import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

import {
  canonicalHash,
  canonicalSerialize,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  hashPresenceAwareField,
  presenceAwareValue,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
} from "../../../lib/generatedPublication/canonical.mjs";

export {
  canonicalHash,
  canonicalSerialize,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  hashPresenceAwareField,
  presenceAwareValue,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
};

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function escapeJsonPointerSegment(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function diffEntry(path, beforeObject, afterObject, key) {
  const before = presenceAwareValue(beforeObject, key);
  const after = presenceAwareValue(afterObject, key);
  return { path, before, after };
}

export function diffValues(before, after, path = "") {
  if (canonicalHash(before) === canonicalHash(after)) return [];

  if (Array.isArray(before) || Array.isArray(after) || !isPlainObject(before) || !isPlainObject(after)) {
    return [{
      path: path || "/",
      before: { present: true, value: before },
      after: { present: true, value: after },
    }];
  }

  const differences = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
    const beforePresent = own(before, key);
    const afterPresent = own(after, key);
    if (!beforePresent || !afterPresent) {
      differences.push(diffEntry(childPath, before, after, key));
      continue;
    }
    differences.push(...diffValues(before[key], after[key], childPath));
  }
  return differences;
}

export function changedTopLevelFields(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.filter((key) => hashPresenceAwareField(before, key) !== hashPresenceAwareField(after, key));
}

export function replaceTopLevelSection(targetArticle, sectionKey, generatedValue) {
  const candidate = structuredClone(targetArticle);
  candidate[sectionKey] = generatedValue;
  return candidate;
}

export function buildSectionProposal({
  slug,
  targetDeploymentFingerprint,
  targetArticle,
  sectionKey,
  generatedValue,
  manifestDigest,
  manifestPath,
  rawResponse,
  usage = null,
  candidateBuilder = replaceTopLevelSection,
  publicationProfile = sectionKey,
  publicationFields = [sectionKey],
}) {
  const beforeArticle = structuredClone(targetArticle);
  const afterArticle = candidateBuilder(structuredClone(targetArticle), sectionKey, generatedValue);
  const observedChangedTopLevelFields = changedTopLevelFields(beforeArticle, afterArticle);
  const acceptedChangeSet =
    observedChangedTopLevelFields.length === 0 ||
    (observedChangedTopLevelFields.length === 1 && observedChangedTopLevelFields[0] === sectionKey);
  const rejectionReasons = acceptedChangeSet ? [] : ["unexpected_cross_section_change"];
  const beforeSection = presenceAwareValue(beforeArticle, sectionKey);
  const afterSection = presenceAwareValue(afterArticle, sectionKey);
  const status = rejectionReasons.length > 0
    ? "rejected"
    : observedChangedTopLevelFields.length === 0
      ? "no_change"
      : "ready_for_review";

  const proposal = {
    schemaVersion: "section-proposal-v1",
    status,
    slug,
    manifestDigest,
    manifestPath,
    rawResponseHash: sha256Text(rawResponse),
    targetDeploymentFingerprint,
    usage,
    section: sectionKey,
    profile: publicationProfile,
    publicationProfile,
    hashVersion: "section-cas-v1",
    baseArticle: beforeArticle,
    proposedArticle: afterArticle,
    approvedPaths: observedChangedTopLevelFields,
    expectedOwnedHash: computeSectionCasHash(publicationProfile, publicationFields, beforeArticle),
    proposedOwnedHash: computeSectionCasHash(publicationProfile, publicationFields, afterArticle),
    before: beforeSection,
    after: afterSection,
    sectionHashBefore: canonicalHash(beforeSection),
    sectionHashAfter: canonicalHash(afterSection),
    wholeArticleHashBefore: canonicalHash(beforeArticle),
    wholeArticleHashAfter: canonicalHash(afterArticle),
    differences: diffValues(beforeArticle, afterArticle),
    observedChangedTopLevelFields,
    guard: {
      accepted: acceptedChangeSet,
      allowedTopLevelFields: [sectionKey],
      rejectionReasons,
    },
  };

  return {
    ...proposal,
    artifactDigestVersion: REVIEWED_ARTIFACT_DIGEST_VERSION,
    artifactDigest: computeReviewedArtifactDigest(proposal),
  };
}

function manifestPayload(manifest) {
  const { manifestDigest: _manifestDigest, ...payload } = manifest;
  return payload;
}

export function attachManifestDigest(manifest) {
  return {
    ...manifestPayload(manifest),
    manifestDigest: canonicalHash(manifestPayload(manifest)),
  };
}

export function verifyManifest(manifest) {
  const expected = canonicalHash(manifestPayload(manifest));
  if (manifest.manifestDigest !== expected) {
    throw new Error(`Manifest digest mismatch: expected ${expected}, received ${manifest.manifestDigest ?? "missing"}.`);
  }
  return expected;
}

export function writeImmutableManifest(manifestPath, manifest) {
  const withDigest = attachManifestDigest(manifest);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(withDigest, null, 2)}\n`, { flag: "wx", mode: 0o444 });
  chmodSync(manifestPath, 0o444);
  const persisted = JSON.parse(readFileSync(manifestPath, "utf8"));
  verifyManifest(persisted);
  return persisted;
}

export function topLevelFieldHashes(article) {
  return Object.fromEntries(
    Object.keys(article).sort().map((key) => [key, {
      present: true,
      hash: hashPresenceAwareField(article, key),
    }]),
  );
}

export function deploymentFingerprint(url) {
  const parsed = new URL(url);
  const suffix = ".convex.cloud";
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(suffix)) {
    throw new Error("Proposal Convex URLs must be HTTPS .convex.cloud deployments.");
  }
  const fingerprint = parsed.hostname.slice(0, -suffix.length);
  if (!fingerprint || fingerprint.includes(".")) {
    throw new Error("Proposal Convex URLs must identify one exact deployment.");
  }
  return fingerprint;
}

export function proposalOutputDirectory({ rootDir, slug, section, capturedAt, manifestDigest }) {
  const timestamp = capturedAt.replace(/[:.]/g, "-");
  return resolve(rootDir, slug, section, `${timestamp}-${manifestDigest}`);
}

export function writeRawResponseArtifact(outputDir, rawResponse) {
  mkdirSync(outputDir, { recursive: true });
  const rawResponsePath = resolve(outputDir, "openrouter-response.txt");
  writeFileSync(rawResponsePath, rawResponse, { flag: "wx", mode: 0o444 });
  chmodSync(rawResponsePath, 0o444);
  return rawResponsePath;
}

export function writeProposalArtifacts({ outputDir, manifestPath, proposal, rawResponse, repoRoot }) {
  mkdirSync(outputDir, { recursive: true });
  const rawResponsePath = resolve(outputDir, "openrouter-response.txt");
  const proposalJsonPath = resolve(outputDir, "proposal.json");
  const proposalMarkdownPath = resolve(outputDir, "proposal.md");
  const linkedProposal = {
    ...proposal,
    artifactPaths: {
      manifest: relative(repoRoot, manifestPath),
      rawResponse: relative(repoRoot, rawResponsePath),
      json: relative(repoRoot, proposalJsonPath),
      markdown: relative(repoRoot, proposalMarkdownPath),
    },
  };

  if (existsSync(rawResponsePath)) {
    if (readFileSync(rawResponsePath, "utf8") !== rawResponse) {
      throw new Error("Existing raw response artifact does not match the proposal response.");
    }
  } else {
    writeFileSync(rawResponsePath, rawResponse, { flag: "wx", mode: 0o444 });
  }
  chmodSync(rawResponsePath, 0o444);
  writeFileSync(proposalJsonPath, `${JSON.stringify(linkedProposal, null, 2)}\n`, { flag: "wx", mode: 0o444 });
  writeFileSync(proposalMarkdownPath, renderProposalMarkdown(linkedProposal), { flag: "wx", mode: 0o444 });
  chmodSync(proposalJsonPath, 0o444);
  chmodSync(proposalMarkdownPath, 0o444);

  return { proposal: linkedProposal, rawResponsePath, proposalJsonPath, proposalMarkdownPath };
}

export function renderProposalMarkdown(proposal) {
  const changed = proposal.observedChangedTopLevelFields.length > 0
    ? proposal.observedChangedTopLevelFields.map((field) => `\`${field}\``).join(", ")
    : "None";
  const reasons = proposal.guard.rejectionReasons.length > 0
    ? proposal.guard.rejectionReasons.map((reason) => `- ${reason}`).join("\n")
    : "- None";

  return `# Section regeneration proposal\n\n` +
    `- **Status:** ${proposal.status}\n` +
    `- **Section:** \`${proposal.section}\`\n` +
    `- **Manifest digest:** \`${proposal.manifestDigest}\`\n` +
    `- **Reviewed artifact digest:** \`${proposal.artifactDigest}\`\n` +
    `- **Target deployment:** \`${proposal.targetDeploymentFingerprint}\`\n` +
    `- **Before section hash:** \`${proposal.sectionHashBefore}\`\n` +
    `- **After section hash:** \`${proposal.sectionHashAfter}\`\n` +
    `- **Changed top-level fields:** ${changed}\n` +
    `- **Cross-section guard:** ${proposal.guard.accepted ? "passed" : "rejected"}\n\n` +
    `## Rejection reasons\n\n${reasons}\n\n` +
    `## Before\n\n\`\`\`json\n${JSON.stringify(proposal.before, null, 2)}\n\`\`\`\n\n` +
    `## Proposed\n\n\`\`\`json\n${JSON.stringify(proposal.after, null, 2)}\n\`\`\`\n\n` +
    `## Exact field-level diff\n\n\`\`\`json\n${JSON.stringify(proposal.differences, null, 2)}\n\`\`\`\n`;
}
