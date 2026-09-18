#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  getReferenceIdentityKeys,
  normalizeDoi,
  normalizePmid,
} from "../../lib/citations/referenceIdentity.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  hasFlag,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { drainDataPageQuery } from "../lib/data-pagination.mjs";
import { enrichKnownReferenceCandidatesWithDiagnostics } from "./formal-citations-reference-enrichment.mjs";
import { normalizeTextNeedle } from "./formal-citations-source-utils.mjs";

const MARKER_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;
const ARTIFACT_VERSION = 1;
const DEFAULT_OUTPUT_DIRECTORY = "tmp/citation-author-repair-proposals";
const ORGANIZATIONAL_AUTHOR_PATTERN = /\b(consortium|collaboration|collaborators|committee|group|initiative|network|organization|organisation|agency|association|society|study team|task force|working party|working group)\b/i;
const AMBIGUOUS_AUTHOR_PATTERN = /\b(et\s+al\.?|anonymous|unknown)\b/i;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function collectMarkerIds(value, ids = new Set(), key = null) {
  if (key === "references" || key === "editorial_review") return ids;
  if (typeof value === "string") {
    for (const match of value.matchAll(MARKER_PATTERN)) ids.add(match[1]);
    return ids;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMarkerIds(item, ids);
    return ids;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collectMarkerIds(child, ids, childKey);
  }
  return ids;
}

function hasAuthors(reference) {
  return Array.isArray(reference?.authors) && reference.authors.some((author) => String(author ?? "").trim());
}

function isScholarlyReference(reference) {
  return Boolean(
    normalizeDoi(reference?.doi)
    || normalizePmid(reference?.pmid)
    || reference?.journal
    || reference?.containerTitle
    || reference?.volume
    || reference?.issue
    || reference?.pages
    || reference?.type === "journal_article"
    || reference?.template === "cite_journal",
  );
}

function duplicateReferenceIds(references, candidate) {
  const candidateKeys = new Set(getReferenceIdentityKeys(candidate));
  if (candidateKeys.size === 0) return [];
  return references
    .filter((reference) => reference !== candidate)
    .filter((reference) => getReferenceIdentityKeys(reference).some((key) => candidateKeys.has(key)))
    .map((reference) => reference.id)
    .filter(Boolean)
    .sort();
}

export function selectMarkerLinkedAuthorlessReferences(article) {
  const markerIds = collectMarkerIds(article);
  const references = article?.references ?? [];
  return references
    .filter((reference) => markerIds.has(reference?.id))
    .filter((reference) => !hasAuthors(reference))
    .filter(isScholarlyReference)
    .map((reference) => ({
      slug: article.slug,
      articleTitle: article.title,
      reference,
      duplicateReferenceIds: duplicateReferenceIds(references, reference),
    }));
}

function normalizeAuthors(authors) {
  const seen = new Set();
  const result = [];
  for (const author of Array.isArray(authors) ? authors : []) {
    const normalized = String(author ?? "").replace(/\s+/g, " ").trim();
    const key = normalized.toLocaleLowerCase("en-US");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function authorKind(authors) {
  if (authors.some((author) => ORGANIZATIONAL_AUTHOR_PATTERN.test(author))) return "institutional";
  if (authors.some((author) => AMBIGUOUS_AUTHOR_PATTERN.test(author))) return "ambiguous";
  return "individual";
}

function sameTitle(left, right) {
  const a = normalizeTextNeedle(left);
  const b = normalizeTextNeedle(right);
  return Boolean(a && b && a === b);
}

function sameAuthors(left, right) {
  const normalize = (authors) => normalizeAuthors(authors).map((author) => normalizeTextNeedle(author)).sort();
  return canonicalJson(normalize(left)) === canonicalJson(normalize(right));
}

function identifierSnapshot(reference) {
  return {
    doi: normalizeDoi(reference?.doi) || null,
    pmid: normalizePmid(reference?.pmid) || null,
  };
}

async function enrichByStableIdentifiers(reference, enrich) {
  const identifiers = identifierSnapshot(reference);
  const requests = [];
  if (identifiers.doi) requests.push({ providerLane: "doi", candidate: { ...reference, doi: identifiers.doi, pmid: null } });
  if (identifiers.pmid) requests.push({ providerLane: "pmid", candidate: { ...reference, doi: null, pmid: identifiers.pmid } });
  const lanes = [];
  for (const request of requests) {
    try {
      const result = await enrich([request.candidate], { identifierLane: request.providerLane });
      lanes.push({
        providerLane: request.providerLane,
        reference: result?.references?.[0] ?? null,
        diagnostics: result?.diagnostics?.[0] ?? null,
      });
    } catch (error) {
      lanes.push({
        providerLane: request.providerLane,
        reference: null,
        diagnostics: { issues: [{ code: "provider_failure", message: error instanceof Error ? error.message : String(error) }] },
      });
    }
  }
  return lanes;
}

export function classifyAuthorRepairCandidate({ reference, lanes }) {
  const identifiers = identifierSnapshot(reference);
  if (!identifiers.doi && !identifiers.pmid) {
    return { classification: "residual", reasonCodes: ["missing_stable_identifier"], proposedAuthors: [] };
  }
  const successful = lanes.filter((lane) => lane.reference);
  const issueCodes = lanes.flatMap((lane) => lane.diagnostics?.issues ?? []).map((issue) => issue.code);
  if (successful.length === 0) {
    return { classification: "residual", reasonCodes: ["provider_failure"], proposedAuthors: [] };
  }
  if (issueCodes.some((code) => ["provider_failure", "primary_provider_failed", "fallback_provider_failed"].includes(code))) {
    return { classification: "residual", reasonCodes: ["provider_failure"], proposedAuthors: [] };
  }
  const identityConflict = successful.some(({ reference: enriched }) => {
    const fetched = identifierSnapshot(enriched);
    return (fetched.doi && identifiers.doi && fetched.doi !== identifiers.doi)
      || (fetched.pmid && identifiers.pmid && fetched.pmid !== identifiers.pmid);
  });
  if (identityConflict) {
    return { classification: "residual", reasonCodes: ["identifier_conflict"], proposedAuthors: [] };
  }
  if (successful.some(({ reference: enriched }) => !sameTitle(reference.title, enriched.title))) {
    return { classification: "residual", reasonCodes: ["title_conflict"], proposedAuthors: [] };
  }
  if (successful.length > 1 && (!sameTitle(successful[0].reference.title, successful[1].reference.title)
      || !sameAuthors(successful[0].reference.authors, successful[1].reference.authors))) {
    return { classification: "residual", reasonCodes: ["provider_disagreement"], proposedAuthors: [] };
  }
  if (issueCodes.includes("provider_title_disagreement")) {
    return { classification: "residual", reasonCodes: ["provider_disagreement"], proposedAuthors: [] };
  }
  const proposedAuthors = normalizeAuthors(successful.find(({ reference: enriched }) => enriched.authors?.length)?.reference.authors);
  if (proposedAuthors.length === 0) {
    return { classification: "residual", reasonCodes: ["no_authors_returned"], proposedAuthors: [] };
  }
  const kind = authorKind(proposedAuthors);
  if (kind !== "individual") {
    return {
      classification: "residual",
      reasonCodes: [kind === "institutional" ? "institutional_authorship" : "ambiguous_authorship"],
      proposedAuthors,
    };
  }
  return { classification: "high_confidence", reasonCodes: ["identifier_and_title_match"], proposedAuthors };
}

function proposalRow({ slug, articleTitle, reference, lanes, duplicateReferenceIds = [] }) {
  const classification = duplicateReferenceIds.length > 0
    ? { classification: "residual", reasonCodes: ["duplicate_reference"], proposedAuthors: [] }
    : classifyAuthorRepairCandidate({ reference, lanes });
  const expectedReference = structuredClone(reference);
  return {
    key: `${slug}::${reference.id}`,
    slug,
    articleTitle,
    referenceId: reference.id,
    classification: classification.classification,
    reasonCodes: classification.reasonCodes,
    identifiers: identifierSnapshot(reference),
    storedTitle: reference.title ?? null,
    expectedReference,
    expectedReferenceSha256: sha256Json(expectedReference),
    expectedAuthors: Array.isArray(reference.authors) ? reference.authors : [],
    proposedAuthors: classification.proposedAuthors,
    duplicateReferenceIds,
    providerLanes: lanes.map((lane) => ({
      providerLane: lane.providerLane,
      title: lane.reference?.title ?? null,
      authors: normalizeAuthors(lane.reference?.authors),
      identifiers: lane.reference ? identifierSnapshot(lane.reference) : { doi: null, pmid: null },
      metadataProvenance: lane.reference?.metadataProvenance ?? lane.diagnostics?.providers ?? [],
      metadataDiagnostics: lane.reference?.metadataDiagnostics ?? lane.diagnostics?.issues ?? [],
    })),
  };
}

export async function buildCitationAuthorRepairProposal({
  articles,
  sourceDeployment,
  generatedAt,
  limit = Infinity,
  enrich = enrichKnownReferenceCandidatesWithDiagnostics,
}) {
  assertCitationSourceIdentity(sourceDeployment);
  const selected = articles.flatMap(selectMarkerLinkedAuthorlessReferences).slice(0, limit);
  const rows = [];
  for (const candidate of selected) {
    const identifiers = identifierSnapshot(candidate.reference);
    const needsManualReview = candidate.duplicateReferenceIds.length > 0
      || (!identifiers.doi && !identifiers.pmid);
    const lanes = needsManualReview ? [] : await enrichByStableIdentifiers(candidate.reference, enrich);
    rows.push(proposalRow({ ...candidate, lanes }));
  }
  rows.sort((left, right) => left.key.localeCompare(right.key));
  const highConfidence = rows.filter((row) => row.classification === "high_confidence");
  const residual = rows.filter((row) => row.classification === "residual");
  const reasonCounts = residual.flatMap((row) => row.reasonCodes).reduce((counts, reason) => {
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
  const proposal = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: ARTIFACT_VERSION,
    generatedAt,
    sourceDeployment,
    mode: "dry_run",
    summary: {
      articleCount: new Set(rows.map((row) => row.slug)).size,
      candidateCount: rows.length,
      highConfidenceCount: highConfidence.length,
      residualCount: residual.length,
      residualReasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    highConfidence,
    residual,
  };
  return { ...proposal, artifactSha256: sha256Json(proposal) };
}

function parsePositiveInteger(value, label, fallback = Infinity) {
  if (value == null) return fallback;
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function defaultOutputPath(repoRoot, generatedAt) {
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  return resolve(repoRoot, DEFAULT_OUTPUT_DIRECTORY, `citation-author-repairs-${timestamp}.json`);
}

export function writeImmutableProposal(path, proposal) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx");
  try {
    writeFileSync(fd, `${JSON.stringify(proposal, null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
}

export async function runCitationAuthorRepairProposal(argv = process.argv.slice(2), dependencies = {}) {
  if (hasFlag(argv, "--write") || hasFlag(argv, "--execute")) {
    throw new Error("This proposal command is read-only and does not accept --write or --execute.");
  }
  const context = createDataOpsRunContext({
    operation: "Plan citation author repairs",
    intent: "citationMetadataRead",
    argv,
    env: dependencies.env ?? process.env,
    selectedTables: ["substanceIndex"],
    localArtifacts: [DEFAULT_OUTPUT_DIRECTORY],
    destructive: false,
  });
  printDataOpsRunContext(context, { logger: dependencies.logger ?? console });
  const sourceUrl = context.sourceUrl;
  if (!sourceUrl) throw new Error("No read-only Postgres source URL is configured.");
  const client = dependencies.client ?? createDataClient({ target: sourceUrl, argv, env: dependencies.env ?? process.env }).client;
  const queryApi = dependencies.api ?? api;
  const slug = getFlagValue(argv, "--slug");
  const limit = parsePositiveInteger(getFlagValue(argv, "--limit"), "--limit");
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const articles = [];
  if (slug) {
    const article = await client.query(queryApi.substanceIndex.getBySlug, { slug });
    if (article) articles.push(article);
  } else {
    const lookup = await drainDataPageQuery({
      client,
      query: queryApi.substanceIndex.getLookupPage,
    });
    for (const item of lookup) {
      if (!item?.slug) continue;
      const article = await client.query(queryApi.substanceIndex.getBySlug, { slug: item.slug });
      if (article) articles.push(article);
    }
  }
  const proposal = await buildCitationAuthorRepairProposal({
    articles,
    sourceDeployment: postgresFingerprintFromUrl(sourceUrl),
    generatedAt,
    limit,
    enrich: dependencies.enrich,
  });
  const outputPath = resolve(context.repoRoot, getFlagValue(argv, "--output") ?? relative(context.repoRoot, defaultOutputPath(context.repoRoot, generatedAt)));
  (dependencies.writeProposal ?? writeImmutableProposal)(outputPath, proposal);
  (dependencies.logger ?? console).log(`Wrote immutable dry-run proposal: ${outputPath}`);
  (dependencies.logger ?? console).log(JSON.stringify(proposal.summary));
  return { proposal, outputPath };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  runCitationAuthorRepairProposal().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
