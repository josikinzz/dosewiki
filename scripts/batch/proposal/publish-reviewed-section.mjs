import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BackendClient } from "../../lib/data-client.ts";

import { api } from "../../../lib/postgres/runtime/api.ts"
import {
  canonicalSerialize,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
} from "../../../lib/generatedPublication/canonical.mjs";
import { citationEvidenceGateErrors } from "../../../lib/citations/citationSafety.mjs";
import { publicationFieldsForProfile } from "../../../lib/generatedPublication/profiles.mjs";
import {
  REGENERATION_ARTIFACT_KIND,
  regenerationPublicationErrors,
} from "../../../lib/generatedPublication/regeneration.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
} from "../../lib/data-ops-run-context.mjs";
import { writeAuditLog } from "../../lib/data-ops-audit.mjs";
import { requireBatchProposalTargetUrl } from "../lib/batch-targets.mjs";
import { createReviewedSectionPublisher } from "./publication-client.mjs";
import { verifyManifest } from "./core.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function valuesForFlag(argv, name) {
  const prefix = `${name}=`;
  return argv.filter((argument) => argument.startsWith(prefix)).map((argument) => argument.slice(prefix.length));
}

function requiredSingleValue(argv, name) {
  const values = valuesForFlag(argv, name);
  if (values.length !== 1 || !values[0].trim()) {
    throw new Error(`Exactly one non-empty ${name}=<value> is required.`);
  }
  return values[0].trim();
}

function optionalSingleValue(argv, name) {
  const values = valuesForFlag(argv, name);
  if (values.length > 1) {
    throw new Error(`${name} may be provided at most once.`);
  }
  return values[0]?.trim() || null;
}

export function parseReviewedPublicationArgs(argv) {
  const knownPrefixes = [
    "--proposal=",
    "--target=",
    "--actor-email=",
    "--reviewed-by=",
    "--reviewed-at=",
    "--approve-artifact=",
    "--confirm-write=",
    "--expected-deployment=",
  ];
  const knownFlags = new Set([
    "--dry-run",
    "--allow-remote",
    "--write",
    "--confirm-reviewed-publication",
    "--help",
    "-h",
  ]);
  for (const argument of argv) {
    if (knownFlags.has(argument) || knownPrefixes.some((prefix) => argument.startsWith(prefix))) continue;
    throw new Error(`Unknown argument: ${argument}`);
  }

  const proposalPath = requiredSingleValue(argv, "--proposal");
  const write = argv.includes("--write");
  const dryRun = argv.includes("--dry-run");
  if (write && dryRun) {
    throw new Error("--write and --dry-run cannot be used together.");
  }

  return {
    proposalPath,
    targetUrl: optionalSingleValue(argv, "--target"),
    actorEmail: optionalSingleValue(argv, "--actor-email"),
    reviewedBy: optionalSingleValue(argv, "--reviewed-by"),
    reviewedAt: optionalSingleValue(argv, "--reviewed-at"),
    approvedArtifactDigest: optionalSingleValue(argv, "--approve-artifact"),
    write,
    dryRun,
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function reviewedPublicationHelpText() {
  return `Publish one reviewed generated section with an explicit, section-scoped CAS mutation.\n\n` +
    `Usage:\n` +
    `  DATA_BACKEND=postgres npm run batch:publish-reviewed-section -- \\\n` +
    `    --proposal=notes-and-plans/exports/batch-proposals/<slug>/<section>/<run>/proposal.json \\\n` +
    `    --target=postgresql://localhost/dosewiki --dry-run\n\n` +
    `After reviewing the dry-run output, publish one approved artifact with:\n` +
    `  --write --confirm-reviewed-publication \\\n` +
    `  --confirm-write=publish-reviewed-section --expected-deployment=localhost/dosewiki \\\n` +
    `  --actor-email=<registered-editor-email> --reviewed-by=<reviewer> \\\n` +
    `  --reviewed-at=<UTC-ISO-8601> --approve-artifact=<artifact-digest>\n\n` +
    `Remote access additionally requires --allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname>.\n\n` +
    `The command accepts exactly one immutable proposal artifact. It requires the scoped ` +
    `DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE token and never accepts the legacy admin key.\n`;
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot && !pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("../");
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireArtifactPath(repoRoot, artifactPath, label) {
  if (typeof artifactPath !== "string" || !artifactPath.trim()) {
    throw new Error(`Proposal is missing ${label}.`);
  }
  const resolved = resolve(repoRoot, artifactPath);
  if (!isWithin(repoRoot, resolved)) {
    throw new Error(`Proposal ${label} must remain inside the repository.`);
  }
  return resolved;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function validateReviewInput({ actorEmail, reviewedBy, reviewedAt, approvedArtifactDigest, artifactDigest }) {
  if (typeof actorEmail !== "string" || !actorEmail.trim()) {
    throw new Error("--actor-email=<registered-editor-email> is required when writing.");
  }
  if (typeof reviewedBy !== "string" || !reviewedBy.trim()) {
    throw new Error("--reviewed-by=<reviewer> is required when writing.");
  }
  if (typeof reviewedAt !== "string" || !ISO_UTC_PATTERN.test(reviewedAt) || Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error("--reviewed-at must be a UTC ISO-8601 timestamp, for example 2026-07-15T15:00:00.000Z.");
  }
  if (approvedArtifactDigest !== artifactDigest) {
    throw new Error("--approve-artifact must exactly match the immutable proposal artifactDigest.");
  }
}

export function proposalIdForArtifact(artifactDigest) {
  return `reviewed-section-${requireSha256(artifactDigest, "artifactDigest")}`;
}

/**
 * Reads every immutable artifact that the proposal digest names, then verifies
 * the digest-bound content before any target query or mutation is created.
 */
export function loadAndVerifyPublicationArtifact({ proposalPath, repoRoot }) {
  const resolvedProposalPath = resolve(repoRoot, proposalPath);
  if (!isWithin(repoRoot, resolvedProposalPath)) {
    throw new Error("--proposal must remain inside the repository.");
  }

  const proposal = readJsonFile(resolvedProposalPath, "proposal artifact");
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new Error("Proposal artifact must be a JSON object.");
  }
  if (proposal.status !== "ready_for_review" || proposal.guard?.accepted !== true) {
    throw new Error("Only a ready_for_review proposal that passed the cross-section guard may be published.");
  }
  if (!Array.isArray(proposal.approvedPaths) || proposal.approvedPaths.length === 0) {
    throw new Error("A publication proposal must contain at least one approved changed path.");
  }
  if (proposal.artifactDigestVersion !== REVIEWED_ARTIFACT_DIGEST_VERSION) {
    throw new Error(`Unsupported proposal artifact digest version: ${proposal.artifactDigestVersion ?? "missing"}.`);
  }
  const artifactDigest = requireSha256(proposal.artifactDigest, "proposal artifactDigest");
  if (computeReviewedArtifactDigest(proposal) !== artifactDigest) {
    throw new Error("Proposal artifactDigest does not match the proposal's publishable content.");
  }

  const manifestPath = requireArtifactPath(repoRoot, proposal.manifestPath, "manifestPath");
  const manifest = readJsonFile(manifestPath, "target manifest");
  if (verifyManifest(manifest) !== proposal.manifestDigest) {
    throw new Error("Proposal manifestDigest does not match the immutable target manifest.");
  }
  if (manifest.deployments?.target?.fingerprint !== proposal.targetDeploymentFingerprint) {
    throw new Error("Target manifest deployment fingerprint does not match the proposal.");
  }

  const sourceArtifactPath = requireArtifactPath(
    repoRoot,
    proposal.artifactPaths?.source ?? proposal.artifactPaths?.rawResponse,
    "artifactPaths.source",
  );
  const sourceArtifact = readFileSync(sourceArtifactPath, "utf8");
  if (sha256Text(sourceArtifact) !== proposal.rawResponseHash) {
    throw new Error("Proposal rawResponseHash does not match the immutable source artifact.");
  }

  return {
    proposal,
    artifactDigest,
    proposalPath: resolvedProposalPath,
    manifestPath,
    rawResponsePath: sourceArtifactPath,
  };
}

export function buildReviewedPublicationEnvelope({ proposal, artifactDigest, reviewedBy, reviewedAt }) {
  return {
    proposalId: proposalIdForArtifact(artifactDigest),
    slug: proposal.slug,
    profile: proposal.profile,
    hashVersion: proposal.hashVersion,
    baseArticle: proposal.baseArticle,
    proposedArticle: proposal.proposedArticle,
    approvedPaths: proposal.approvedPaths,
    expectedOwnedHash: proposal.expectedOwnedHash,
    proposedOwnedHash: proposal.proposedOwnedHash,
    manifestDigest: proposal.manifestDigest,
    rawResponseHash: proposal.rawResponseHash,
    targetDeploymentFingerprint: proposal.targetDeploymentFingerprint,
    artifactDigestVersion: proposal.artifactDigestVersion,
    artifactDigest,
    ...(proposal.sourceArtifactKind ? { sourceArtifactKind: proposal.sourceArtifactKind } : {}),
    ...(proposal.correctionAudit ? { correctionAudit: proposal.correctionAudit } : {}),
    ...(proposal.regenerationAudit !== undefined ? { regenerationAudit: proposal.regenerationAudit } : {}),
    ...(proposal.markerChanges ? { markerChanges: proposal.markerChanges } : {}),
    ...(proposal.claimEvidence ? { claimEvidence: proposal.claimEvidence } : {}),
    review: {
      status: "approved",
      reviewedBy: reviewedBy.trim(),
      reviewedAt,
      artifactDigest,
    },
  };
}

function createPublicationContext({ argv, env, repoRoot, localArtifacts }) {
  const targetUrlFlag = getFlagValue(argv, "--target");
  const envWithCliOverrides = {
    ...env,
    ...(targetUrlFlag ? { TARGET_POSTGRES_URL: targetUrlFlag } : {}),
  };
  const context = createDataOpsRunContext({
    operation: "publish reviewed section",
    intent: "generated-publication",
    argv,
    startDir: repoRoot,
    env: envWithCliOverrides,
    sourceUrlKeys: [],
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-reviewed-publication",
    selectedTables: ["substanceIndex", "generatedPublicationOperations"],
    localArtifacts,
    destructive: true,
  });
  return {
    ...context,
    env: envWithCliOverrides,
    targetUrlKey: targetUrlFlag ? "--target" : context.targetUrlKey,
  };
}

function matchesApprovedContent(liveArticle, reviewedProposal) {
  return reviewedProposal.approvedPaths.every((path) => (
    canonicalSerialize(liveArticle[path]) === canonicalSerialize(reviewedProposal.proposedArticle[path])
  ));
}

function ownedPublicationHash(proposal, article) {
  return computeSectionCasHash(
    proposal.profile,
    publicationFieldsForProfile(proposal.profile),
    article,
  );
}

function publicationCasState(liveArticle, proposal) {
  const liveOwnedHash = ownedPublicationHash(proposal, liveArticle);
  if (liveOwnedHash === proposal.expectedOwnedHash) return "ready";
  if (liveOwnedHash === proposal.proposedOwnedHash) return "already_applied";
  return "conflict";
}

export function reviewedPublicationTrustGate(proposal) {
  const regenerationErrors = regenerationPublicationErrors(proposal);
  if (regenerationErrors.length) return { accepted: false, errors: regenerationErrors };
  if (proposal.sourceArtifactKind !== "reviewed_content_correction") {
    return { accepted: true, errors: [] };
  }
  if (!Array.isArray(proposal.claimEvidence)) {
    return { accepted: false, errors: ["claimEvidence is required for reviewed content corrections"] };
  }
  const errors = proposal.claimEvidence.flatMap((row, index) => (
    citationEvidenceGateErrors(row).map((error) => `claimEvidence[${index}] ${error}`)
  ));
  return { accepted: errors.length === 0, errors };
}

export async function publishReviewedPublication({
  argv = process.argv.slice(2),
  env = process.env,
  repoRoot = process.cwd(),
  Client = BackendClient,
  postgresApi = api,
  logger = console,
} = {}) {
  const options = parseReviewedPublicationArgs(argv);
  const verified = loadAndVerifyPublicationArtifact({ proposalPath: options.proposalPath, repoRoot });
  const trustGate = reviewedPublicationTrustGate(verified.proposal);
  if (!trustGate.accepted && (
    verified.proposal.sourceArtifactKind === REGENERATION_ARTIFACT_KIND ||
    verified.proposal.regenerationAudit !== undefined
  )) {
    throw new Error(`Publication regeneration trust gate failed: ${trustGate.errors.join("; ")}`);
  }
  const context = createPublicationContext({
    argv,
    env,
    repoRoot,
    localArtifacts: [relative(repoRoot, verified.proposalPath)],
  });
  const targetUrl = requireBatchProposalTargetUrl(context);

  if (verified.proposal.targetDeploymentFingerprint !== context.deploymentFingerprint) {
    throw new Error(
      `Proposal target deployment ${verified.proposal.targetDeploymentFingerprint} does not match ` +
      `the explicit target deployment ${context.deploymentFingerprint}.`,
    );
  }

  const client = new Client(targetUrl);
  const liveArticle = await client.query(postgresApi.substanceIndex.getBySlug, { slug: verified.proposal.slug });
  if (!liveArticle) {
    throw new Error(`No live target article found for ${verified.proposal.slug}.`);
  }
  if (verified.proposal.sourceArtifactKind === REGENERATION_ARTIFACT_KIND) {
    const errors = regenerationPublicationErrors(verified.proposal, { liveArticle });
    if (errors.length) throw new Error(`Publication regeneration trust gate failed: ${errors.join("; ")}`);
  }

  const casState = publicationCasState(liveArticle, verified.proposal);
  const reviewReady = options.write;
  let reviewedProposal = null;
  if (reviewReady) {
    validateReviewInput({
      actorEmail: options.actorEmail,
      reviewedBy: options.reviewedBy,
      reviewedAt: options.reviewedAt,
      approvedArtifactDigest: options.approvedArtifactDigest,
      artifactDigest: verified.artifactDigest,
    });
    reviewedProposal = buildReviewedPublicationEnvelope({
      proposal: verified.proposal,
      artifactDigest: verified.artifactDigest,
      reviewedBy: options.reviewedBy,
      reviewedAt: options.reviewedAt,
    });
  }

  printDataOpsRunContext(context, { logger });
  logger.log(`Proposal: ${relative(repoRoot, verified.proposalPath)}`);
  logger.log(`Artifact digest: ${verified.artifactDigest}`);
  logger.log(`Slug / profile: ${verified.proposal.slug} / ${verified.proposal.profile}`);
  logger.log(`Approved paths: ${verified.proposal.approvedPaths.join(", ")}`);
  logger.log(`Owned-section CAS state: ${casState}`);
  logger.log(`Citation trust gate: ${trustGate.accepted ? "passed" : "blocked"}`);
  for (const error of trustGate.errors) logger.log(`  - ${error}`);
  logger.log(`Live target already matches proposal: ${matchesApprovedContent(liveArticle, verified.proposal) ? "yes" : "no"}`);

  if (!options.write) {
    logger.log("No writes performed. Review the artifact and re-run with the complete explicit publication ceremony.");
    return {
      status: "dry_run",
      artifactDigest: verified.artifactDigest,
      proposalId: proposalIdForArtifact(verified.artifactDigest),
      liveTargetMatchesProposal: matchesApprovedContent(liveArticle, verified.proposal),
      casState,
      trustGate,
    };
  }

  if (!trustGate.accepted) {
    throw new Error(`Publication citation trust gate failed: ${trustGate.errors.join("; ")}`);
  }
  if (casState === "conflict") {
    throw new Error("Publication is stale: a profile-owned target field changed after review. Regenerate and re-review the proposal.");
  }
  if (casState === "already_applied") {
    logger.log("No mutation invoked: the live owned section already matches the approved proposal.");
    return {
      status: "already_applied",
      artifactDigest: verified.artifactDigest,
      proposalId: reviewedProposal.proposalId,
      liveTargetMatchesProposal: true,
      casState,
    };
  }

  assertDataOpsWriteAllowed(context);

  const { path: auditLogPath } = writeAuditLog({
    operation: "reviewed-section-publication",
    intent: "generatedPublicationWrite",
    slug: reviewedProposal.slug,
    mutations: reviewedProposal.approvedPaths.map((path) => ({
      path,
      action: "section-cas-patch",
      artifactDigest: reviewedProposal.artifactDigest,
      proposalId: reviewedProposal.proposalId,
    })),
    repoRoot,
  });
  logger.log(`Audit log: ${auditLogPath}`);

  const publish = createReviewedSectionPublisher({
    context,
    actorEmail: options.actorEmail.trim(),
    env: context.env,
    mutate: (args) => client.mutation(postgresApi.substanceIndex.publishReviewedSection, args),
  });
  const result = await publish(reviewedProposal);
  const publishedArticle = await client.query(postgresApi.substanceIndex.getBySlug, { slug: reviewedProposal.slug });
  if (!publishedArticle || !matchesApprovedContent(publishedArticle, reviewedProposal)) {
    throw new Error("Post-publication verification failed: the live article does not match the approved section content.");
  }

  logger.log(`Publication result: ${result.status}`);
  logger.log(`Post-publication verification: passed`);
  return {
    ...result,
    artifactDigest: verified.artifactDigest,
    proposalId: reviewedProposal.proposalId,
    auditLogPath,
  };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(reviewedPublicationHelpText());
    return;
  }

  const result = await publishReviewedPublication();
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
