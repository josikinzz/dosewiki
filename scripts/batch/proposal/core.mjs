import { postgresFingerprintFromUrl } from "../../lib/data-client.ts";
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
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  hashPresenceAwareField,
  presenceAwareValue,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
} from "../../../lib/generatedPublication/canonical.mjs";

export {
  canonicalHash,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
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

const CITATION_MARKER_PATTERN = /\[cite:[^\]\r\n]+\]/g;

function citationMarkers(value) {
  return typeof value === "string" ? value.match(CITATION_MARKER_PATTERN) ?? [] : [];
}

function containsCitationMarkers(value) {
  if (typeof value === "string") return citationMarkers(value).length > 0;
  if (Array.isArray(value)) return value.some(containsCitationMarkers);
  if (isPlainObject(value)) return Object.values(value).some(containsCitationMarkers);
  return false;
}

function withoutCitationMarkers(value) {
  return value.replace(CITATION_MARKER_PATTERN, "").replace(/[ \t]+\n/g, "\n").trim();
}

function sentenceFragments(value) {
  const fragments = [];
  const cleanValue = withoutCitationMarkers(value);
  for (const match of cleanValue.matchAll(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)) {
    const leadingWhitespace = match[0].length - match[0].trimStart().length;
    const text = match[0].trim();
    if (!text) continue;
    const start = match.index + leadingWhitespace;
    fragments.push({ text, start, end: start + text.length });
  }
  return fragments;
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(left.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  const rightTokens = new Set(right.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function markerGroupsAtBestMatchingSentences(targetValue, generatedValue, path) {
  const targetSentences = sentenceFragments(targetValue);
  const generatedSentences = sentenceFragments(generatedValue);
  const groups = new Map();

  for (const match of targetValue.matchAll(CITATION_MARKER_PATTERN)) {
    const markerPosition = withoutCitationMarkers(targetValue.slice(0, match.index)).length;
    const targetSentence = targetSentences.find((sentence) => (
      markerPosition >= sentence.start && markerPosition <= sentence.end
    )) ?? targetSentences.at(-1);
    if (!targetSentence || generatedSentences.length === 0) {
      throw new Error(`Cannot safely preserve citation markers at ${path}: no matching generated sentence.`);
    }

    let bestIndex = -1;
    let bestScore = -1;
    for (const [index, generatedSentence] of generatedSentences.entries()) {
      const score = tokenSimilarity(targetSentence.text, generatedSentence.text);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    if (bestScore < 0.25) {
      throw new Error(`Cannot safely preserve citation markers at ${path}: no semantically matching generated sentence.`);
    }

    const group = groups.get(bestIndex) ?? [];
    group.push(match[0]);
    groups.set(bestIndex, group);
  }

  return groups;
}

function sentenceEndOffsets(value) {
  return sentenceFragments(value).map((sentence) => sentence.end);
}

function insertMarkersAtCorrespondingSentences(value, groups) {
  if (groups.size === 0) return value;
  const sentenceEnds = sentenceEndOffsets(value);
  const insertions = [...groups.entries()]
    .map(([sentenceIndex, markers]) => ({
      position: sentenceEnds[sentenceIndex] ?? value.length,
      markers: markers.join(""),
    }))
    .sort((left, right) => right.position - left.position);
  let result = value;
  for (const { position, markers } of insertions) {
    result = `${result.slice(0, position)}${markers}${result.slice(position)}`;
  }
  return result;
}

function stripCitationMarkers(value) {
  if (typeof value === "string") return withoutCitationMarkers(value);
  if (Array.isArray(value)) return value.map(stripCitationMarkers);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripCitationMarkers(item)]));
  }
  return value;
}

/**
 * Generated prose cannot create, remove, or replace citation markers. Marker
 * groups remain attached to their prior sentence ordinal when a matching
 * string leaf is regenerated. A generated structure that drops or changes a
 * citation-bearing leaf fails closed for the dedicated citation workflow.
 */
function preserveCitationMarkers(targetValue, generatedValue, path) {
  if (typeof targetValue === "string") {
    if (typeof generatedValue !== "string") {
      if (citationMarkers(targetValue).length > 0) {
        throw new Error(`Cannot safely preserve citation markers at ${path}: generated value is not a string.`);
      }
      return stripCitationMarkers(generatedValue);
    }
    const markerFreeGeneratedValue = withoutCitationMarkers(generatedValue);
    return insertMarkersAtCorrespondingSentences(
      markerFreeGeneratedValue,
      markerGroupsAtBestMatchingSentences(targetValue, markerFreeGeneratedValue, path),
    );
  }

  if (Array.isArray(targetValue)) {
    if (!Array.isArray(generatedValue)) {
      if (containsCitationMarkers(targetValue)) {
        throw new Error(`Cannot safely preserve citation markers at ${path}: generated value is not an array.`);
      }
      return stripCitationMarkers(generatedValue);
    }
    if (containsCitationMarkers(targetValue) && targetValue.length !== generatedValue.length) {
      throw new Error(`Cannot safely preserve citation markers at ${path}: array length changed.`);
    }
    return generatedValue.map((item, index) => preserveCitationMarkers(
      targetValue[index],
      item,
      `${path}/${index}`,
    ));
  }

  if (isPlainObject(targetValue)) {
    if (!isPlainObject(generatedValue)) {
      if (containsCitationMarkers(targetValue)) {
        throw new Error(`Cannot safely preserve citation markers at ${path}: generated value is not an object.`);
      }
      return stripCitationMarkers(generatedValue);
    }
    for (const key of Object.keys(targetValue)) {
      if (containsCitationMarkers(targetValue[key]) && !own(generatedValue, key)) {
        throw new Error(`Cannot safely preserve citation markers at ${path}/${key}: generated field is missing.`);
      }
    }
    return Object.fromEntries(Object.entries(generatedValue).map(([key, item]) => [
      key,
      own(targetValue, key)
        ? preserveCitationMarkers(targetValue[key], item, `${path}/${escapeJsonPointerSegment(key)}`)
        : stripCitationMarkers(item),
    ]));
  }

  return stripCitationMarkers(generatedValue);
}

function replaceTopLevelSection(targetArticle, sectionKey, generatedValue) { const candidate = structuredClone(targetArticle);
candidate[sectionKey] = preserveCitationMarkers(
  targetArticle[sectionKey],
  generatedValue,
  `/${escapeJsonPointerSegment(sectionKey)}`,
);
return candidate; }

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
  if (manifest.schemaVersion === "section-proposal-manifest-v2") {
    for (const role of ["source", "target"]) {
      const deployment = manifest.deployments?.[role];
      if (
        typeof deployment?.identity !== "string" || !deployment.identity ||
        deployment.identity !== deployment.fingerprint || own(deployment, "url")
      ) {
        throw new Error(`Native proposal ${role} identity must match its credential-free Postgres fingerprint.`);
      }
    }
  }
  const expected = canonicalHash(manifestPayload(manifest));
  if (manifest.manifestDigest !== expected) {
    throw new Error(`Manifest digest mismatch: expected ${expected}, received ${manifest.manifestDigest ?? "missing"}.`);
  }
  return expected;
}

export function writeImmutableManifest(manifestPath, manifest) {
  const withDigest = attachManifestDigest(manifest);
  verifyManifest(withDigest);
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
  const fingerprint = postgresFingerprintFromUrl(url);
  if (!fingerprint) throw new Error("Proposal Postgres URLs must identify one exact host and database.");
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

function renderProposalMarkdown(proposal) { const changed = proposal.observedChangedTopLevelFields.length > 0
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
  `## Exact field-level diff\n\n\`\`\`json\n${JSON.stringify(proposal.differences, null, 2)}\n\`\`\`\n`; }
