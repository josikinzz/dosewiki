#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, postgresFingerprintFromUrl, resolvePostgresSource } from "../lib/data-client.ts";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  hasUnsafeReferenceMarkup,
  normalizeDoi,
  normalizePmid,
  normalizeReferenceMetadataProvenance,
  stripReferenceHtmlMarkup,
} from "../../lib/citations/referenceIdentity.mjs";
import { backupBeforeWrite,
getFlagValue,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import {
  enrichKnownReferenceCandidatesWithDiagnostics,
  sanitizeAllowedReferenceForArticle,
} from "./formal-citations-reference-enrichment.mjs";
import { normalizeSourceLookupKey } from "./formal-citations-source-utils.mjs";

const OPERATION = "repair-malformed-reference-metadata";
const CONFIRMATION_FLAG = "--confirm-malformed-reference-repair";
const ARTIFACT_TYPE = "malformed_reference_metadata_repair";
const ARTIFACT_VERSION = 1;
const CITE_TOKEN_PATTERN = /\[cite:([^\]\s]+)\]/g;
const REFERENCE_METADATA_KEYS = new Set([
  "references",
  "citations",
  "source_citations",
  "editorial_review",
]);

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function proposalPayload(proposal) {
  const { artifactSha256: _artifactSha256, ...payload } = proposal;
  return payload;
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stripDataFields(article) {
  const { _id: _id, _creationTime: _creationTime, ...stored } = article;
  return stored;
}

export function isMalformedReference(reference) {
  return hasUnsafeReferenceMarkup(reference?.title)
    || hasUnsafeReferenceMarkup(reference?.apaText);
}

export function collectUsedReferenceIds(article) {
  const referenceIds = new Set((article?.references ?? []).map((reference) => reference?.id).filter(Boolean));
  const used = new Set();
  const seen = new WeakSet();

  const visit = (value) => {
    if (typeof value === "string") {
      if (referenceIds.has(value)) used.add(value);
      for (const match of value.matchAll(CITE_TOKEN_PATTERN)) {
        if (referenceIds.has(match[1])) used.add(match[1]);
      }
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!REFERENCE_METADATA_KEYS.has(key)) visit(child);
    }
  };

  visit(article);
  return used;
}

function providerLaneMap(candidates, result) {
  const lanes = new Map();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const reference = result.references[index];
    const normalizedReference = reference
      ? { ...reference, title: stripReferenceHtmlMarkup(reference.title) }
      : reference;
    const diagnostics = result.diagnostics[index];
    const successful = diagnostics?.providers?.some((provider) => provider.status === "success") === true;
    lanes.set(candidate.id, { reference: normalizedReference, diagnostics, successful });
  }
  return lanes;
}

function safeProviderLane(lane) {
  return lane?.successful
    && lane.reference?.title
    && !hasUnsafeReferenceMarkup(lane.reference.title)
    ? lane
    : null;
}

function canonicalRepair(reference, lane) {
  const providerReference = sanitizeAllowedReferenceForArticle(lane.reference);
  const metadataProvenance = normalizeReferenceMetadataProvenance([
    ...(reference.metadataProvenance ?? []),
    ...(providerReference.metadataProvenance ?? []),
    {
      kind: "inspected",
      source: OPERATION,
      provider: lane.diagnostics?.providers?.find(({ status }) => status === "success")?.provider,
      fields: ["title", "authors", "siteName", "publisher", "containerTitle", "year"],
    },
  ]);
  const repaired = {
    ...reference,
    type: reference.type === "unknown" ? providerReference.type : reference.type,
    title: providerReference.title,
    authors: providerReference.authors,
    siteName: providerReference.siteName ?? reference.siteName ?? null,
    publisher: lane.reference.publisher ?? reference.publisher ?? null,
    containerTitle: reference.containerTitle ?? providerReference.siteName ?? null,
    year: lane.reference.year ?? reference.year ?? null,
    url: reference.url ?? providerReference.url ?? null,
    doi: reference.doi ?? providerReference.doi ?? null,
    pmid: reference.pmid ?? providerReference.pmid ?? null,
    isbn: reference.isbn ?? providerReference.isbn ?? null,
    sourceType: providerReference.sourceType,
    quality: providerReference.quality,
    ...(metadataProvenance.length > 0 ? { metadataProvenance } : {}),
  };
  if (hasUnsafeReferenceMarkup(repaired.apaText)) delete repaired.apaText;
  return repaired;
}

function normalizedProviderTitle(value) {
  return normalizeSourceLookupKey(
    String(value ?? "")
      .replaceAll("α", " alpha ")
      .replaceAll("β", " beta ")
      .replaceAll("γ", " gamma ")
      .replaceAll("δ", " delta ")
      .replaceAll("κ", " kappa ")
      .replaceAll("μ", " mu "),
  ).replace(/\s+/g, "");
}

function strictProviderLane(reference, doiLane, pmidLane) {
  const doi = safeProviderLane(doiLane);
  const pmid = safeProviderLane(pmidLane);
  if (!doi && !pmid) {
    throw new Error(`${reference.id}: no authoritative DOI, PMID, or ISBN metadata resolved.`);
  }
  if (doi && pmid) {
    const doiTitle = normalizedProviderTitle(doi.reference.title);
    const pmidTitle = normalizedProviderTitle(pmid.reference.title);
    if (
      !doiTitle
      || (
        doiTitle !== pmidTitle
        && !doiTitle.startsWith(pmidTitle)
        && !pmidTitle.startsWith(doiTitle)
      )
    ) {
      throw new Error(`${reference.id}: Crossref and PubMed titles disagree.`);
    }
  }
  return doi ?? pmid;
}

export async function buildMalformedReferenceRepairProposal(
  articles,
  {
    enrich = enrichKnownReferenceCandidatesWithDiagnostics,
    sourceDeployment,
    now = () => new Date().toISOString(),
  } = {},
) {
  assertCitationSourceIdentity(sourceDeployment);
  const malformedUses = [];
  const articleAudits = [];

  for (const article of articles) {
    const malformed = (article.references ?? []).filter(isMalformedReference);
    if (malformed.length === 0) continue;
    const usedIds = collectUsedReferenceIds(article);
    const used = malformed.filter((reference) => usedIds.has(reference.id));
    const unused = malformed.filter((reference) => !usedIds.has(reference.id));
    articleAudits.push({ article, malformed, used, unused });
    malformedUses.push(...used);
  }

  const doiCandidates = malformedUses.filter((reference) => normalizeDoi(reference.doi) || normalizeDoi(reference.url));
  const pmidCandidates = malformedUses.filter((reference) => normalizePmid(reference.pmid) || normalizePmid(reference.url));
  const doiResult = doiCandidates.length > 0
    ? await enrich(doiCandidates, { identifierLane: "doi" })
    : { references: [], diagnostics: [] };
  const pmidResult = pmidCandidates.length > 0
    ? await enrich(pmidCandidates, { identifierLane: "pmid" })
    : { references: [], diagnostics: [] };
  const doiLanes = providerLaneMap(doiCandidates, doiResult);
  const pmidLanes = providerLaneMap(pmidCandidates, pmidResult);

  const rows = [];
  let repairedReferenceCount = 0;
  let removedReferenceCount = 0;
  for (const { article, malformed, used, unused } of articleAudits) {
    const repairsById = new Map();
    const repairs = [];
    for (const reference of used) {
      const lane = strictProviderLane(
        reference,
        doiLanes.get(reference.id),
        pmidLanes.get(reference.id),
      );
      const proposed = canonicalRepair(reference, lane);
      if (isMalformedReference(proposed)) {
        throw new Error(`${article.slug}::${reference.id}: provider repair still contains raw markup.`);
      }
      repairsById.set(reference.id, proposed);
      repairs.push({
        referenceId: reference.id,
        expectedTitle: reference.title,
        proposedTitle: proposed.title,
        identifiers: {
          doi: normalizeDoi(reference.doi) || null,
          pmid: normalizePmid(reference.pmid) || null,
        },
        providers: lane.diagnostics?.providers ?? [],
      });
    }

    const unusedIds = new Set(unused.map((reference) => reference.id));
    const proposedReferences = (article.references ?? []).flatMap((reference) => {
      if (unusedIds.has(reference.id)) return [];
      return [repairsById.get(reference.id) ?? reference];
    });
    if (proposedReferences.some(isMalformedReference)) {
      throw new Error(`${article.slug}: malformed reference remained after proposal construction.`);
    }

    repairedReferenceCount += repairs.length;
    removedReferenceCount += unused.length;
    rows.push({
      slug: article.slug,
      expectedReferences: article.references ?? [],
      proposedReferences,
      repairs,
      removals: unused.map((reference) => ({
        referenceId: reference.id,
        title: reference.title,
        reason: "unused_malformed_reference",
      })),
      malformedReferenceCount: malformed.length,
    });
  }

  const payload = {
    artifactType: ARTIFACT_TYPE,
    artifactVersion: ARTIFACT_VERSION,
    generatedAt: now(),
    sourceDeployment,
    summary: {
      articleCount: articles.length,
      affectedArticleCount: rows.length,
      malformedReferenceCount: repairedReferenceCount + removedReferenceCount,
      repairedReferenceCount,
      removedReferenceCount,
    },
    rows,
  };
  return { ...payload, artifactSha256: sha256Json(payload) };
}

export function validateMalformedReferenceRepairProposal(proposal) {
  if (proposal?.artifactType !== ARTIFACT_TYPE || proposal?.artifactVersion !== ARTIFACT_VERSION) {
    throw new Error("The malformed-reference proposal type or version is invalid.");
  }
  if (sha256Json(proposalPayload(proposal)) !== proposal.artifactSha256) {
    throw new Error("The malformed-reference proposal hash is invalid.");
  }
  assertCitationSourceIdentity(proposal.sourceDeployment);
  if (!Array.isArray(proposal.rows) || proposal.rows.length === 0) {
    throw new Error("The malformed-reference proposal has no affected articles.");
  }
  for (const row of proposal.rows) {
    if (!row?.slug || !Array.isArray(row.expectedReferences) || !Array.isArray(row.proposedReferences)) {
      throw new Error("A malformed-reference proposal row is incomplete.");
    }
    if (row.proposedReferences.some(isMalformedReference)) {
      throw new Error(`${row.slug}: proposed references still contain raw markup.`);
    }
  }
  return proposal;
}

function readProposal(path) {
  if (!path) throw new Error("--proposal=<path> is required for apply mode.");
  return validateMalformedReferenceRepairProposal(
    JSON.parse(readFileSync(resolve(path), "utf8")),
  );
}

export function isMalformedReferenceRepairRowApplied(references, row) {
  const referencesById = new Map(
    (Array.isArray(references) ? references : []).map((reference) => [
      reference.id,
      reference,
    ]),
  );
  if (row.removals.some(({ referenceId }) => referencesById.has(referenceId))) {
    return false;
  }
  return row.repairs.every((repair) => {
    const reference = referencesById.get(repair.referenceId);
    if (!reference || reference.title !== repair.proposedTitle) return false;
    if (repair.identifiers.doi && normalizeDoi(reference.doi ?? reference.url) !== repair.identifiers.doi) {
      return false;
    }
    if (repair.identifiers.pmid && normalizePmid(reference.pmid) !== repair.identifiers.pmid) {
      return false;
    }
    return !isMalformedReference(reference);
  });
}

function pendingProposalRows(articlesBySlug, proposal) {
  return proposal.rows.flatMap((row) => {
    const article = articlesBySlug.get(row.slug);
    if (!article) throw new Error(`${row.slug}: article not found.`);
    if (isMalformedReferenceRepairRowApplied(article.references, row)) return [];
    if (!sameJson(article.references ?? [], row.expectedReferences)) {
      throw new Error(`${row.slug}: REFERENCE_CONFLICT: live references changed after proposal generation.`);
    }
    return [{ row, article }];
  });
}

async function buildProposal(command, argv, dependencies) {
  const env = dependencies.env ?? process.env;
  const sourceUrl = resolvePostgresSource({ argv, env }).url;
  if (!sourceUrl) throw new Error("Select a Postgres source with --source-url, SOURCE_POSTGRES_URL, or a target URL.");
  const client = dependencies.client ?? createDataClient({ target: sourceUrl, argv, env }).client;
  const queryApi = dependencies.api ?? api;
  const articles = await getAllSubstanceDocuments(client, queryApi.substanceIndex.getFullDocumentPage);
  const proposal = await buildMalformedReferenceRepairProposal(articles, {
    enrich: dependencies.enrich,
    sourceDeployment: postgresFingerprintFromUrl(sourceUrl),
  });
  const outPath = getFlagValue(argv, "--out");
  if (outPath) writeFileSync(resolve(outPath), `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(JSON.stringify(proposal.summary, null, 2));
  if (outPath) console.log(`Proposal: ${resolve(outPath)}`);
  return { status: "proposal_built", proposal };
}

async function applyProposal(command, argv, dependencies) {
  const proposal = readProposal(getFlagValue(argv, "--proposal"));
  if (proposal.sourceDeployment !== postgresFingerprintFromUrl(command.targetUrl)) {
    throw new Error("The proposal source deployment does not match the explicit target deployment.");
  }
  const client = dependencies.client ?? createDataClient({ target: command.targetUrl, argv, env: dependencies.env ?? process.env }).client;
  const queryApi = dependencies.api ?? api;
  const articles = await getAllSubstanceDocuments(client, queryApi.substanceIndex.getFullDocumentPage);
  const articlesBySlug = new Map(articles.map((article) => [article.slug, article]));
  const pending = pendingProposalRows(articlesBySlug, proposal);
  console.log(`Affected articles: ${proposal.rows.length}; pending: ${pending.length}; already applied: ${proposal.rows.length - pending.length}.`);
  console.log(`References: ${proposal.summary.repairedReferenceCount} authoritative metadata repairs; ${proposal.summary.removedReferenceCount} unused malformed removals.`);
  if (!command.writeRequested) return { status: "dry_run", pending: pending.length, proposal };

  assertProductionWriteAllowed(command);
  if (!argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Production malformed-reference repair requires ${CONFIRMATION_FLAG}.`);
  }
  const apiKey = dependencies.apiKey
    ?? requireProductionWriteCredential("editorArticleWrite", { env: dependencies.env ?? process.env }).token;
  const backup = dependencies.backupBeforeWrite ?? backupBeforeWrite;
  const auditWriter = dependencies.writeAuditLog ?? writeAuditLog;
  const auditUpdater = dependencies.updateAuditLog ?? updateAuditLog;
  const backups = [];
  for (const { row } of pending) {
    backups.push(await backup({
      sourceClient: client,
      queryGetAll: queryApi.substanceIndex.getBySlug,
      queryArgs: { slug: row.slug },
      label: `malformed-reference-repair-${row.slug}`,
      repoRoot: command.repoRoot,
    }));
  }
  const audit = auditWriter({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: "corpus",
    mutations: pending.map(({ row }) => ({
      slug: row.slug,
      repairs: row.repairs,
      removals: row.removals,
    })),
    repoRoot: command.repoRoot,
  });
  const results = [];
  try {
    for (const { row } of pending) {
      const fresh = await client.query(queryApi.substanceIndex.getBySlug, { slug: row.slug });
      if (!sameJson(fresh?.references ?? [], row.expectedReferences)) {
        throw new Error(`${row.slug}: REFERENCE_CONFLICT immediately before write.`);
      }
      const article = {
        ...stripDataFields(fresh),
        references: row.proposedReferences,
      };
      await client.mutation(queryApi.substanceIndex.saveSubstance, { apiKey, article });
      const verified = await client.query(queryApi.substanceIndex.getBySlug, { slug: row.slug });
      if (!isMalformedReferenceRepairRowApplied(verified?.references, row)) {
        throw new Error(`${row.slug}: post-write repair verification failed.`);
      }
      results.push({ slug: row.slug, status: "updated" });
    }
    auditUpdater(audit.path, {
      status: "completed",
      proposalArtifactSha256: proposal.artifactSha256,
      backups,
      results,
    });
  } catch (error) {
    auditUpdater(audit.path, {
      status: "failed",
      proposalArtifactSha256: proposal.artifactSha256,
      backups,
      results,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return { status: "completed", results, backups, auditLogPath: audit.path };
}

export async function runMalformedReferenceRepair(
  argv = process.argv.slice(2),
  dependencies = {},
) {
  const command = createProductionWriteCommand({
    operation: OPERATION,
    argv,
    env: dependencies.env ?? process.env,
  });
  printProductionWriteCommand(command);
  return getFlagValue(argv, "--proposal")
    ? applyProposal(command, argv, dependencies)
    : buildProposal(command, argv, dependencies);
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  runMalformedReferenceRepair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
