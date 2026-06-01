import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  applyWorkbenchCitationPlacement,
  getWorkbenchCitationSection,
  getWorkbenchCitationSeverity,
} from "../../lib/citations/citationPlacement.js";
import { buildCitationPromotionPlan } from "./citation-promotion-applicator.mjs";

const DEFAULT_DRAFT_PATH = `${homedir()}/.codex/dosewiki-citation-workbench/runs/2c-b/citation-draft.json`;

const REFERENCE_SOURCE_TYPE_MAP = new Map([
  ["observational_study", "primary_literature"],
  ["primary", "primary_literature"],
  ["review", "review_literature"],
  ["review_or_chapter", "review_literature"],
  ["chapter", "review_literature"],
  ["government", "government_or_regulatory"],
  ["regulatory", "government_or_regulatory"],
]);

const REFERENCE_TYPE_MAP = new Map([
  ["chapter", "book_chapter"],
  ["database", "database_entry"],
  ["database_record", "database_entry"],
  ["government", "report"],
  ["government_document", "report"],
  ["government_report", "report"],
  ["primary", "journal_article"],
  ["regulatory", "report"],
  ["review", "journal_article"],
  ["web", "webpage"],
  ["website", "webpage"],
]);

const VALID_REFERENCE_TYPES = new Set([
  "journal_article",
  "book",
  "book_chapter",
  "webpage",
  "database_entry",
  "report",
  "unknown",
]);

const VALID_REFERENCE_SOURCE_TYPES = new Set([
  "primary_literature",
  "review_literature",
  "book",
  "government_or_regulatory",
  "medical_database",
  "drug_database",
  "community_wiki",
  "experience_archive",
  "harm_reduction_org",
  "news_media",
  "vendor_or_commercial",
  "unknown",
]);

const VALID_REFERENCE_QUALITIES = new Set(["high", "medium", "low", "fallback"]);
const VALID_WORKBENCH_EVIDENCE_STATUSES = new Set(["supported", "needs_review", "needs_source"]);

function clone(value) {
  return structuredClone(value);
}

function stripConvexStorageFields(article) {
  delete article._id;
  delete article._creationTime;
  return article;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Workbench citation draft must include ${label} as an array.`);
  }
}

function assertPromotableWorkbenchDraft(workbenchDraft) {
  if (!workbenchDraft || typeof workbenchDraft !== "object" || Array.isArray(workbenchDraft)) {
    throw new Error("Workbench citation draft must be an object.");
  }
  assertArray(workbenchDraft.references, "references");
  assertArray(workbenchDraft.evidence, "evidence");

  for (const [index, evidence] of workbenchDraft.evidence.entries()) {
    if (!normalizeString(evidence?.claimKey)) {
      throw new Error(`Workbench citation draft evidence row ${index} is missing claimKey.`);
    }
    if (!normalizeString(evidence?.fieldPath)) {
      throw new Error(`Workbench citation draft evidence row ${index} is missing fieldPath.`);
    }
    if (!VALID_WORKBENCH_EVIDENCE_STATUSES.has(evidence?.status)) {
      throw new Error(`Workbench citation draft evidence row ${index} has unsupported status: ${evidence?.status}`);
    }
    if (evidence?.supports !== undefined && !Array.isArray(evidence.supports)) {
      throw new Error(`Workbench citation draft evidence row ${index} must include supports as an array when present.`);
    }
    if (evidence.status === "supported" && !Array.isArray(evidence.supports)) {
      throw new Error(`Workbench citation draft evidence row ${index} must include supports as an array.`);
    }
    if (evidence.status === "needs_source" && Array.isArray(evidence.supports) && evidence.supports.length > 0) {
      throw new Error(`Workbench citation draft evidence row ${index} must not include supports for needs_source.`);
    }
    if (evidence.status === "needs_source" && Array.isArray(evidence.referenceIds) && evidence.referenceIds.length > 0) {
      throw new Error(`Workbench citation draft evidence row ${index} must not include referenceIds for needs_source.`);
    }
  }
}

function recordChange(changes, path, before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  changes.push({ path, before, after });
}

function normalizeReferenceSourceType(sourceType) {
  const normalized = normalizeString(sourceType);
  const mapped = REFERENCE_SOURCE_TYPE_MAP.get(normalized) ?? normalized;
  return VALID_REFERENCE_SOURCE_TYPES.has(mapped) ? mapped : "unknown";
}

function normalizeReferenceType(type) {
  const normalized = normalizeString(type);
  const mapped = REFERENCE_TYPE_MAP.get(normalized) ?? normalized;
  return VALID_REFERENCE_TYPES.has(mapped) ? mapped : "unknown";
}

function normalizeReferenceQuality(quality) {
  const normalized = normalizeString(quality);
  return VALID_REFERENCE_QUALITIES.has(normalized) ? normalized : "fallback";
}

export function normalizeWorkbenchReference(reference) {
  return {
    id: normalizeString(reference?.id),
    type: normalizeReferenceType(reference?.type),
    title: normalizeString(reference?.title),
    authors: Array.isArray(reference?.authors) ? reference.authors.map(normalizeString).filter(Boolean) : [],
    year: reference?.year ?? null,
    date: reference?.date ?? null,
    containerTitle: reference?.containerTitle ?? null,
    siteName: reference?.siteName ?? null,
    publisher: reference?.publisher ?? null,
    volume: reference?.volume ?? null,
    issue: reference?.issue ?? null,
    pages: reference?.pages ?? null,
    articleNumber: reference?.articleNumber ?? null,
    doi: reference?.doi ?? null,
    pmid: reference?.pmid ?? null,
    isbn: reference?.isbn ?? null,
    url: reference?.url ?? null,
    accessedAt: reference?.accessedAt ?? null,
    sourceType: normalizeReferenceSourceType(reference?.sourceType),
    quality: normalizeReferenceQuality(reference?.quality),
    apaText: reference?.apaText ?? null,
  };
}

function mergeReferences(existingReferences = [], draftReferences = []) {
  const byId = new Map();
  for (const reference of existingReferences) {
    if (reference?.id) {
      byId.set(reference.id, reference);
    }
  }
  for (const reference of draftReferences) {
    const normalized = normalizeWorkbenchReference(reference);
    if (normalized.id) {
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function gapDiagnostics(workbenchDraft, claimKey) {
  return (workbenchDraft.gaps ?? [])
    .filter((gap) => gap?.claimKey === claimKey || gap?.referenceId === claimKey)
    .map((gap) => ({
      code: "workbench_gap",
      message: normalizeString(gap.note ?? gap.missingAspect ?? gap.description ?? JSON.stringify(gap)),
      severity: "warning",
      claimKey,
    }))
    .filter((diagnostic) => diagnostic.message);
}

function sourceTypeForSupport(referencesById, referenceId) {
  return referencesById.get(referenceId)?.sourceType ?? "unknown";
}

function qualityForSupport(referencesById, referenceId) {
  return referencesById.get(referenceId)?.quality ?? "fallback";
}

function sortEvidenceSupports(supports) {
  return [...supports].sort((left, right) => (
    left.referenceId.localeCompare(right.referenceId) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.supportingQuote.localeCompare(right.supportingQuote) ||
    left.rationale.localeCompare(right.rationale)
  ));
}

function buildEvidenceRow(workbenchDraft, evidence, referencesById) {
  const supports = evidence.status === "supported"
    ? sortEvidenceSupports((evidence.supports ?? []).map((support) => ({
        sourceId: normalizeString(support.sourceId),
        sourceName: normalizeString(support.sourceName),
        referenceId: normalizeString(support.referenceId),
        sourceType: sourceTypeForSupport(referencesById, support.referenceId),
        quality: qualityForSupport(referencesById, support.referenceId),
        supportingQuote: normalizeString(support.supportingQuote),
        rationale: normalizeString(support.rationale),
        verifiedQuote: {
          sourceId: normalizeString(support.sourceId),
          matchType: "normalized_whitespace",
          startOffset: null,
          endOffset: null,
        },
      })).filter((support) => support.sourceId && support.sourceName && support.referenceId && support.supportingQuote))
    : [];

  return {
    section: getWorkbenchCitationSection(evidence),
    claimKey: evidence.claimKey,
    claimText: evidence.claimText,
    fieldPath: evidence.fieldPath,
    referenceIds: supports.length > 0
      ? supports.map((support) => support.referenceId)
      : Array.isArray(evidence.referenceIds) ? evidence.referenceIds : [],
    sourceName: supports.length === 1 ? supports[0].sourceName : undefined,
    sourceType: supports.length === 1 ? supports[0].sourceType : undefined,
    quality: supports.length === 1 ? supports[0].quality : undefined,
    status: evidence.status,
    statusReason: evidence.status === "needs_review"
      ? "Workbench evidence marked this claim for editorial review; no supported citation was applied."
      : normalizeString(evidence.statusReason),
    severity: getWorkbenchCitationSeverity(evidence.claimKey),
    confidence: evidence.status === "supported" ? 0.85 : 0.35,
    supportingSnippet: supports.length === 1 ? supports[0].supportingQuote : undefined,
    supportRationale: supports.length === 1 ? supports[0].rationale : undefined,
    supports,
    diagnostics: gapDiagnostics(workbenchDraft, evidence.claimKey),
    provenance: {
      source: "dosewiki-citation-workbench",
      taskId: workbenchDraft.taskId ?? null,
      generatedAt: workbenchDraft.generatedAt ?? null,
      adapter: "scripts/citations/apply-workbench-draft.mjs",
    },
  };
}

function applySupportedClaim(article, changes, evidence) {
  applyWorkbenchCitationPlacement(article, changes, evidence);
}

export function buildArticleFromWorkbenchDraft({ article, workbenchDraft }) {
  const nextArticle = stripConvexStorageFields(clone(article));
  const changes = [];
  nextArticle.references = mergeReferences(nextArticle.references ?? [], workbenchDraft.references ?? []);

  for (const evidence of workbenchDraft.evidence ?? []) {
    if (evidence.status === "supported") {
      applySupportedClaim(nextArticle, changes, evidence);
    }
  }

  recordChange(changes, "references", article.references ?? [], nextArticle.references);
  return { article: nextArticle, changes };
}

export function buildEvidenceFromWorkbenchDraft(workbenchDraft) {
  const referencesById = new Map(
    (workbenchDraft.references ?? [])
      .map(normalizeWorkbenchReference)
      .filter((reference) => reference.id)
      .map((reference) => [reference.id, reference]),
  );

  return (workbenchDraft.evidence ?? []).map((evidence) =>
    buildEvidenceRow(workbenchDraft, evidence, referencesById),
  );
}

export function buildWorkbenchApplyDraft({ article, workbenchDraft }) {
  return buildWorkbenchPromotionPlan({ article, workbenchDraft });
}

export function buildWorkbenchPromotionPlan({
  article,
  workbenchDraft,
  approvedWriteMode = "preserve",
}) {
  assertPromotableWorkbenchDraft(workbenchDraft);
  const articleDraft = buildArticleFromWorkbenchDraft({ article, workbenchDraft });
  const evidence = buildEvidenceFromWorkbenchDraft(workbenchDraft);
  const staleClaimKeys = [];
  const summary = {
    references: articleDraft.article.references?.length ?? 0,
    evidenceRows: evidence.length,
    supportedEvidenceRows: workbenchDraft.evidence.filter((row) => row.status === "supported").length,
    reviewEvidenceRows: workbenchDraft.evidence.filter((row) => row.status === "needs_review").length,
    articleChanges: articleDraft.changes.length,
  };

  return buildCitationPromotionPlan({
    source: "workbench",
    slug: workbenchDraft.article?.slug ?? article.slug,
    title: article.title,
    article: articleDraft.article,
    evidence,
    changes: articleDraft.changes,
    references: articleDraft.article.references ?? [],
    gaps: workbenchDraft.gaps ?? [],
    staleClaimKeys,
    approvedWriteMode,
    summary,
  });
}

export function loadWorkbenchDraft(path = DEFAULT_DRAFT_PATH) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export { DEFAULT_DRAFT_PATH };
