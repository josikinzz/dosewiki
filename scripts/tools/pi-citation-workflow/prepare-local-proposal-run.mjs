#!/usr/bin/env node
/**
 * Prepare one permanently local citation-workbench run from an immutable
 * section proposal. This script reads repository-local proposal artifacts and
 * an existing workbench input packet; it never contacts Postgres, applies a
 * draft, or updates queue/tracker state.
 */

import { COPYFILE_EXCL } from "node:constants";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  canonicalHash,
  changedTopLevelFields,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  diffValues,
  sha256Text,
  topLevelFieldHashes,
  verifyManifest,
} from "../../batch/proposal/core.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORKBENCH_ENV = "DOSEWIKI_CITATION_WORKBENCH";

function requireWorkbench(explicit) {
  const value = explicit ?? process.env[WORKBENCH_ENV];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${WORKBENCH_ENV} is not set. Point it at the citation workbench directory or pass --workbench.`);
  }
  return value;
}
const PROPOSAL_ROOT_RELATIVE = "notes-and-plans/exports/batch-proposals";
const CITABLE_SECTIONS = Object.freeze([
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
]);
const FORBIDDEN_FLAGS = /^(?:--)?(?:write|confirm(?:ation)?|confirm-[^=]*|queue|apply)(?:=|$)/i;
const CITE_MARKER = /\[cite:[^\]\r\n]+\]/i;
const LOCAL_REASON = "Local proposal citation drafts are review artifacts only.";
const LOCAL_PROPOSAL_BRIDGE_VERSION = "dosewiki_local_proposal_bridge_v3";
const ATTEMPT_RESERVATION_LIMIT = 16;

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonBytes(path, label) {
  const bytes = readFileSync(path);
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sameJson(left, right) {
  return canonicalHash(left) === canonicalHash(right);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function resolveContainedFile({ repoRoot, exportRoot, requestedPath, label }) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    throw new Error(`${label} path is required.`);
  }
  const absolute = resolve(repoRoot, requestedPath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist: ${absolute}`);
  const sourceStat = lstatSync(absolute);
  if (sourceStat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link.`);
  const realExportRoot = realpathSync(exportRoot);
  const realFile = realpathSync(absolute);
  if (!isInside(repoRoot, realFile) || !isInside(realExportRoot, realFile)) {
    throw new Error(`${label} resolves outside ${PROPOSAL_ROOT_RELATIVE}.`);
  }
  if ((sourceStat.mode & 0o222) !== 0) throw new Error(`${label} must be read-only.`);
  return realFile;
}

function assertExactList(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length ||
      value.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${label} must equal ${JSON.stringify(expected)}.`);
  }
}

function containsCitationMarker(value) {
  if (typeof value === "string") return CITE_MARKER.test(value);
  if (Array.isArray(value)) return value.some(containsCitationMarker);
  if (value && typeof value === "object") return Object.values(value).some(containsCitationMarker);
  return false;
}

function stripDataMetadata(article) {
  const copy = structuredClone(article);
  delete copy._id;
  delete copy._creationTime;
  return copy;
}

function publicationFieldsFor(proposal) {
  if (proposal.publicationProfile === "pharmacology" || proposal.profile === "pharmacology") {
    return ["pharmacology", "dosage", "duration"];
  }
  return [proposal.section];
}

function referenceIdentity(reference) {
  if (reference?.doi) return `doi:${String(reference.doi).toLowerCase()}`;
  if (reference?.pmid) return `pmid:${reference.pmid}`;
  if (reference?.isbn) return `isbn:${reference.isbn}`;
  if (reference?.url) return `url:${String(reference.url).toLowerCase().replace(/\/+$/, "")}`;
  return reference?.id ? `id:${reference.id}` : null;
}

/**
 * Match the workbench's task-candidate traversal and canonical identity order.
 * Later discovery references that identify an earlier allowed/Wikipedia source
 * are remapped to the first candidate id, preventing proactive-scan collisions
 * without changing source prose or dropping discovery metadata.
 */
export function canonicalizeSourcePacketReferenceIds(sourcePacket = {}) {
  const normalized = structuredClone(sourcePacket);
  const canonicalByIdentity = new Map();
  const remaps = [];
  const referenceLists = [
    ["sourcePacket.allowedReferences", normalized.allowedReferences],
    ["sourcePacket.wikipediaCitationPacket.references", normalized.wikipediaCitationPacket?.references],
  ];
  const discoveryPackets = normalized.discoveryPackets;
  if (discoveryPackets && typeof discoveryPackets === "object" && !Array.isArray(discoveryPackets)) {
    for (const [packetName, packet] of Object.entries(discoveryPackets)) {
      referenceLists.push([`sourcePacket.discoveryPackets.${packetName}.references`, packet?.references]);
    }
  }

  for (const [path, references] of referenceLists) {
    if (!Array.isArray(references)) continue;
    for (let index = 0; index < references.length; index += 1) {
      const reference = references[index];
      if (!reference || typeof reference !== "object" || Array.isArray(reference) || !reference.id) continue;
      const identity = referenceIdentity(reference);
      if (!identity) continue;
      const canonicalId = canonicalByIdentity.get(identity);
      if (!canonicalId) {
        canonicalByIdentity.set(identity, reference.id);
        continue;
      }
      if (canonicalId === reference.id) continue;
      remaps.push({ path: `${path}[${index}]`, identity, from: reference.id, to: canonicalId });
      reference.id = canonicalId;
    }
  }

  return { sourcePacket: normalized, remaps };
}

function assertProposalIntegrity({ proposal, proposalPath, repoRoot, exportRoot }) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new Error("proposal.json must contain an object.");
  }
  if (proposal.schemaVersion !== "section-proposal-v1") {
    throw new Error('proposal.schemaVersion must be "section-proposal-v1".');
  }
  if (proposal.status !== "ready_for_review") {
    throw new Error('proposal.status must be "ready_for_review".');
  }
  if (proposal.guard?.accepted !== true) throw new Error("proposal.guard.accepted must be true.");
  if (!CITABLE_SECTIONS.includes(proposal.section)) {
    throw new Error(`proposal.section is not citable: ${proposal.section ?? "missing"}.`);
  }
  if (typeof proposal.slug !== "string" || !proposal.slug.trim()) throw new Error("proposal.slug is required.");
  if (proposal.baseArticle?.slug !== proposal.slug || proposal.proposedArticle?.slug !== proposal.slug) {
    throw new Error("Proposal slug does not match both base and proposed article slugs.");
  }

  assertExactList(proposal.approvedPaths, [proposal.section], "proposal.approvedPaths");
  assertExactList(proposal.observedChangedTopLevelFields, [proposal.section], "proposal.observedChangedTopLevelFields");
  assertExactList(proposal.guard?.allowedTopLevelFields, [proposal.section], "proposal.guard.allowedTopLevelFields");
  assertExactList(proposal.guard?.rejectionReasons, [], "proposal.guard.rejectionReasons");
  assertExactList(changedTopLevelFields(proposal.baseArticle, proposal.proposedArticle), [proposal.section], "recomputed changed top-level fields");

  if (proposal.after?.present !== true || !Object.hasOwn(proposal.after, "value")) {
    throw new Error("proposal.after must contain a present value.");
  }
  if (!sameJson(proposal.after.value, proposal.proposedArticle[proposal.section])) {
    throw new Error("proposal.after.value does not match proposedArticle[section].");
  }
  if (!sameJson(proposal.before, {
    present: Object.hasOwn(proposal.baseArticle, proposal.section),
    ...(Object.hasOwn(proposal.baseArticle, proposal.section) ? { value: proposal.baseArticle[proposal.section] } : {}),
  })) {
    throw new Error("proposal.before does not match baseArticle[section].");
  }
  if (containsCitationMarker(proposal.after.value)) {
    throw new Error("The proposed section contains a pre-existing [cite:…] marker.");
  }
  if (!sameJson(proposal.differences, diffValues(proposal.baseArticle, proposal.proposedArticle))) {
    throw new Error("proposal.differences does not recompute.");
  }

  const expectedSectionHashBefore = canonicalHash(proposal.before);
  const expectedSectionHashAfter = canonicalHash(proposal.after);
  if (proposal.sectionHashBefore !== expectedSectionHashBefore) throw new Error("proposal.sectionHashBefore does not recompute.");
  if (proposal.sectionHashAfter !== expectedSectionHashAfter) throw new Error("proposal.sectionHashAfter does not recompute.");
  if (proposal.wholeArticleHashBefore !== canonicalHash(proposal.baseArticle)) throw new Error("proposal.wholeArticleHashBefore does not recompute.");
  if (proposal.wholeArticleHashAfter !== canonicalHash(proposal.proposedArticle)) throw new Error("proposal.wholeArticleHashAfter does not recompute.");

  const profile = proposal.publicationProfile ?? proposal.profile;
  if (!profile || proposal.profile !== profile || proposal.hashVersion !== "section-cas-v1") {
    throw new Error("Proposal publication profile/hash version is invalid.");
  }
  const ownedFields = publicationFieldsFor(proposal);
  if (proposal.expectedOwnedHash !== computeSectionCasHash(profile, ownedFields, proposal.baseArticle)) {
    throw new Error("proposal.expectedOwnedHash does not recompute.");
  }
  if (proposal.proposedOwnedHash !== computeSectionCasHash(profile, ownedFields, proposal.proposedArticle)) {
    throw new Error("proposal.proposedOwnedHash does not recompute.");
  }
  if (proposal.artifactDigestVersion !== REVIEWED_ARTIFACT_DIGEST_VERSION) {
    throw new Error(`proposal.artifactDigestVersion must be ${REVIEWED_ARTIFACT_DIGEST_VERSION}.`);
  }
  if (proposal.artifactDigest !== computeReviewedArtifactDigest(proposal)) {
    throw new Error("proposal.artifactDigest does not recompute.");
  }

  const proposalArtifactPath = resolveContainedFile({
    repoRoot,
    exportRoot,
    requestedPath: proposal.artifactPaths?.json,
    label: "Proposal artifact",
  });
  if (proposalArtifactPath !== proposalPath) throw new Error("proposal.artifactPaths.json does not identify the selected proposal.");
  const manifestPath = resolveContainedFile({
    repoRoot,
    exportRoot,
    requestedPath: proposal.artifactPaths?.manifest ?? proposal.manifestPath,
    label: "Proposal manifest",
  });
  const declaredManifestPath = resolveContainedFile({
    repoRoot,
    exportRoot,
    requestedPath: proposal.manifestPath,
    label: "Declared proposal manifest",
  });
  if (manifestPath !== declaredManifestPath) throw new Error("Proposal manifest paths do not match.");
  const rawResponsePath = resolveContainedFile({
    repoRoot,
    exportRoot,
    requestedPath: proposal.artifactPaths?.rawResponse,
    label: "Proposal raw response",
  });

  const { bytes: manifestBytes, value: manifest } = readJsonBytes(manifestPath, "Proposal manifest");
  const recomputedManifestDigest = verifyManifest(manifest);
  if (proposal.manifestDigest !== recomputedManifestDigest) throw new Error("proposal.manifestDigest does not match the manifest.");
  if (manifest.slug !== proposal.slug || manifest.section !== proposal.section) throw new Error("Manifest slug/section does not match the proposal.");
  if (manifest.deployments?.target?.fingerprint !== proposal.targetDeploymentFingerprint) {
    throw new Error("Manifest target deployment does not match the proposal.");
  }
  if (manifest.targetArticleHash !== canonicalHash(manifest.targetArticle)) throw new Error("manifest.targetArticleHash does not recompute.");
  const manifestTargetContent = stripDataMetadata(manifest.targetArticle);
  if (manifest.targetArticleContentHash !== canonicalHash(manifestTargetContent)) {
    throw new Error("manifest.targetArticleContentHash does not recompute.");
  }
  if (!sameJson(manifestTargetContent, proposal.baseArticle)) throw new Error("Manifest target article does not match proposal.baseArticle.");
  if (!sameJson(manifest.targetTopLevelFieldHashes, topLevelFieldHashes(manifest.targetArticle))) {
    throw new Error("manifest.targetTopLevelFieldHashes does not recompute.");
  }
  if (manifest.prompt?.contentHash !== sha256Text(manifest.prompt?.exactContent ?? "")) {
    throw new Error("manifest.prompt.contentHash does not recompute.");
  }
  if (manifest.messages?.systemHash !== sha256Text(manifest.messages?.system ?? "") ||
      manifest.messages?.userHash !== sha256Text(manifest.messages?.user ?? "")) {
    throw new Error("Manifest message hashes do not recompute.");
  }

  const rawResponseBytes = readFileSync(rawResponsePath);
  if (proposal.rawResponseHash !== sha256Bytes(rawResponseBytes)) {
    throw new Error("proposal.rawResponseHash does not match the raw response bytes.");
  }

  return { manifest, manifestBytes, manifestPath, rawResponseBytes, rawResponsePath };
}

export function parseLocalProposalArgs(argv) {
  for (const argument of argv) {
    const normalized = argument.replace(/^--/, "");
    if (FORBIDDEN_FLAGS.test(normalized)) {
      throw new Error(`Forbidden local-proposal flag: ${argument}. This bridge has no write, confirmation, queue, or apply capability.`);
    }
  }

  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      values.help = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const [key, inline] = argument.slice(2).split("=", 2);
    if (!["proposal", "workbench"].includes(key)) throw new Error(`Unknown argument: ${argument}`);
    const value = inline ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    if (values[key] !== undefined) throw new Error(`--${key} may be passed only once.`);
    values[key] = value;
  }
  if (!values.help && (typeof values.proposal !== "string" || !values.proposal.trim())) {
    throw new Error("Exactly one explicit --proposal <path> is required.");
  }
  return values;
}

function writeReadonlyJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o444 });
  chmodSync(path, 0o444);
}

function copyReadonly(source, destination) {
  copyFileSync(source, destination, COPYFILE_EXCL);
  chmodSync(destination, 0o444);
}

/**
 * `mkdir` is the run lock. A retry must never reuse an existing attempt,
 * including the astronomically unlikely UUID collision or a concurrently
 * reserved name. Retrying the reservation is safe because no files exist in a
 * directory that this invocation did not create.
 */
function reserveAttemptDirectory({ runsRoot, runIdPrefix }) {
  for (let attempt = 0; attempt < ATTEMPT_RESERVATION_LIMIT; attempt += 1) {
    const runId = `${runIdPrefix}--attempt-${randomUUID()}`;
    const runPath = resolve(runsRoot, runId);
    try {
      mkdirSync(runPath, { recursive: false, mode: 0o755 });
      return { runId, runPath };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error(`Unable to reserve an isolated proposal attempt after ${ATTEMPT_RESERVATION_LIMIT} names.`);
}

export function prepareLocalProposalRun({
  proposalPath: requestedProposalPath,
  repoRoot: requestedRepoRoot = PROJECT_ROOT,
  workbench: requestedWorkbench = null,
} = {}) {
  const repoRoot = realpathSync(resolve(requestedRepoRoot));
  const exportRoot = resolve(repoRoot, PROPOSAL_ROOT_RELATIVE);
  if (!existsSync(exportRoot)) throw new Error(`Proposal export root does not exist: ${exportRoot}`);
  const proposalPath = resolveContainedFile({
    repoRoot,
    exportRoot,
    requestedPath: requestedProposalPath,
    label: "Proposal",
  });
  const { bytes: proposalBytes, value: proposal } = readJsonBytes(proposalPath, "Proposal");
  const verified = assertProposalIntegrity({ proposal, proposalPath, repoRoot, exportRoot });

  const workbench = realpathSync(resolve(requireWorkbench(requestedWorkbench)));
  const packagePath = resolve(workbench, "package.json");
  if (!existsSync(packagePath)) throw new Error(`Workbench package.json does not exist: ${packagePath}`);
  const templatePath = resolve(workbench, "inputs", `${proposal.slug}-full.json`);
  if (!existsSync(templatePath)) throw new Error(`Workbench source packet does not exist: ${templatePath}`);
  if (lstatSync(templatePath).isSymbolicLink()) throw new Error("Workbench source packet must not be a symbolic link.");
  const template = readJsonBytes(templatePath, "Workbench source packet").value;
  if (template.article?.slug !== proposal.slug) throw new Error("Workbench source packet slug does not match the proposal.");
  if (typeof template.article?.title !== "string" || !template.article.title.trim()) {
    throw new Error("Workbench source packet title is missing.");
  }

  const normalizedSourcePacket = canonicalizeSourcePacketReferenceIds(template.sourcePacket ?? {});
  const allowLiveWebResearch = typeof template.allowLiveWebResearch === "boolean"
    ? template.allowLiveWebResearch
    : template.instructions?.allowLiveWebResearch === true;
  const bridgeInputDigest = canonicalHash({
    schemaVersion: LOCAL_PROPOSAL_BRIDGE_VERSION,
    proposalArtifactDigest: proposal.artifactDigest,
    title: template.article.title,
    sourcePacket: normalizedSourcePacket.sourcePacket,
    instructions: template.instructions ?? {},
    allowLiveWebResearch,
  });
  const digestPrefix = proposal.artifactDigest.slice(0, 12);
  const bridgeDigestPrefix = bridgeInputDigest.slice(0, 12);
  // The immutable proposal binding identifies the content, not one mutable
  // workbench directory. Reserve a fresh attempt directory atomically so a
  // retry (or a concurrent coordinator) cannot attach to another attempt.
  const requestedRunsRoot = resolve(workbench, "runs");
  mkdirSync(requestedRunsRoot, { recursive: true });
  const runsRoot = realpathSync(requestedRunsRoot);
  if (!isInside(workbench, runsRoot)) {
    throw new Error("Workbench runs directory must remain inside the selected workbench.");
  }
  const { runId, runPath } = reserveAttemptDirectory({
    runsRoot,
    runIdPrefix: `${proposal.slug}--proposal-${proposal.section}--${digestPrefix}--${bridgeDigestPrefix}`,
  });

  const sourcePath = relative(repoRoot, proposalPath);
  const binding = {
    schemaVersion: "dosewiki_local_proposal_binding_v1",
    kind: "local_section_proposal",
    slug: proposal.slug,
    section: proposal.section,
    artifactDigestVersion: proposal.artifactDigestVersion,
    artifactDigest: proposal.artifactDigest,
    manifestDigest: proposal.manifestDigest,
    proposalJsonSha256: sha256Bytes(proposalBytes),
    sectionHashAfter: proposal.sectionHashAfter,
    sourcePath,
  };
  const citableSections = Object.fromEntries(
    CITABLE_SECTIONS.map((section) => [section, section === proposal.section ? structuredClone(proposal.after.value) : null]),
  );
  const task = {
    schemaVersion: template.schemaVersion ?? "dosewiki_citation_task_v1",
    taskId: runId,
    bridge: {
      schemaVersion: LOCAL_PROPOSAL_BRIDGE_VERSION,
      inputDigest: bridgeInputDigest,
      canonicalReferenceRemaps: normalizedSourcePacket.remaps,
    },
    provenance: {
      source: "local_section_proposal",
      taskMode: "local_experiment",
      applyBound: false,
    },
    promotion: {
      allowed: false,
      policy: "never",
      reason: LOCAL_REASON,
    },
    inputBinding: binding,
    allowLiveWebResearch,
    article: {
      slug: proposal.slug,
      title: template.article.title,
      citableSections,
    },
    sourcePacket: normalizedSourcePacket.sourcePacket,
    instructions: structuredClone(template.instructions ?? {}),
  };

  try {
    const inputDir = resolve(runPath, "proposal-input");
    mkdirSync(inputDir, { mode: 0o755 });
    copyReadonly(proposalPath, resolve(inputDir, "proposal.json"));
    copyReadonly(verified.manifestPath, resolve(inputDir, "target-manifest.json"));
    copyReadonly(verified.rawResponsePath, resolve(inputDir, "openrouter-response.txt"));
    writeReadonlyJson(resolve(inputDir, "binding.json"), binding);
    writeReadonlyJson(resolve(runPath, "citation-task.json"), task);
  } catch (error) {
    // This invocation has already reserved runPath with mkdir. It is therefore
    // safe to remove only that incomplete attempt; no existing/concurrent run
    // can be affected.
    rmSync(runPath, { recursive: true, force: true });
    throw error;
  }

  return { runId, runPath, binding, task };
}

export function localProposalHelpText() {
  return `Prepare a permanently local citation run from one immutable proposal.\n\n` +
    `Usage:\n  node scripts/tools/pi-citation-workflow/prepare-local-proposal-run.mjs \\\n    --proposal notes-and-plans/exports/batch-proposals/<slug>/<section>/<digest>/proposal.json\n\n` +
    `The bridge creates a review-only workbench run and has no write, confirmation, queue, or apply flags.\n`;
}

async function main() {
  const options = parseLocalProposalArgs(process.argv.slice(2));
  if (options.help) {
    console.log(localProposalHelpText());
    return;
  }
  const result = prepareLocalProposalRun({
    proposalPath: options.proposal,
    workbench: options.workbench,
  });
  console.log(JSON.stringify({
    runId: result.runId,
    runPath: result.runPath,
    outcome: "prepared_local_review_only",
    promotionAllowed: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
