import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyWorkbenchCitationPlacement,
  getWorkbenchCitationSection,
  getWorkbenchCitationSeverity,
} from "../../lib/citations/citationPlacement.mjs";
import { buildCitationPromotionPlan } from "./citation-promotion-applicator.mjs";
import {
  mergeReferenceCollections,
  normalizeReferenceMetadataProvenance,
} from "../../lib/citations/referenceIdentity.mjs";
import {
  CITABLE_ARTICLE_SECTIONS,
  CITE_MARKER_PATTERN,
  validateSectionMarkerCandidate,
} from "./citation-marker-workflow.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";

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
  ["journal", "journal_article"],
  ["primary", "journal_article"],
  ["regulatory", "report"],
  ["review", "journal_article"],
  ["cite_journal", "journal_article"],
  ["cite_book", "book"],
  ["cite_web", "webpage"],
  ["cite_report", "report"],
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
const VALID_REFERENCE_ACCESS = new Set(["open", "abstract_only", "paywalled", "unreachable", "unknown"]);
const VALID_REFERENCE_SUPPORT_STATUSES = new Set(["inspected", "discovery_only", "needs_review", "unknown"]);
const VALID_REFERENCE_TEMPLATES = new Set(["cite_journal", "cite_book", "cite_web", "cite_report", "cite_database", "unknown"]);
const REFERENCE_TEMPLATE_BY_TYPE = new Map([
  ["journal_article", "cite_journal"],
  ["book", "cite_book"],
  ["book_chapter", "cite_book"],
  ["webpage", "cite_web"],
  ["report", "cite_report"],
  ["database_entry", "cite_database"],
  ["unknown", "unknown"],
]);
const VALID_WORKBENCH_EVIDENCE_STATUSES = new Set(["supported", "needs_review", "needs_source"]);

function clone(value) {
  return structuredClone(value);
}

function stripDataStorageFields(article) {
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

export function assertWorkbenchDraftPromotionAllowed(workbenchDraft) {
  if (workbenchDraft?.inputBinding?.kind === "local_section_proposal" ||
      /--proposal-/.test(normalizeString(workbenchDraft?.taskId))) {
    throw new Error("Local section proposal citation drafts are permanently review-only and cannot be promoted.");
  }
  if (workbenchDraft?.provenance?.applyBound === false) {
    throw new Error("Non-apply-bound citation drafts cannot be promoted.");
  }
  if (workbenchDraft?.promotion?.allowed === false) {
    throw new Error("Citation draft promotion is explicitly forbidden.");
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

function isMarkerOnlyWorkbenchDraft(workbenchDraft) {
  return workbenchDraft?.citationMode === "marker_only" ||
    workbenchDraft?.draftMode === "marker_only" ||
    Boolean(workbenchDraft?.markedSections) ||
    Boolean(workbenchDraft?.markedArticle?.sections) ||
    Boolean(workbenchDraft?.articleWide?.markedSections);
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

function normalizeReferenceAccess(access) {
  const normalized = normalizeString(access);
  return VALID_REFERENCE_ACCESS.has(normalized) ? normalized : "unknown";
}

function normalizeReferenceSupportStatus(status) {
  const normalized = normalizeString(status);
  return VALID_REFERENCE_SUPPORT_STATUSES.has(normalized) ? normalized : "unknown";
}

function normalizeReferenceTemplate(template, type) {
  const normalized = normalizeString(template).toLowerCase().replace(/[\s-]+/g, "_");
  if (VALID_REFERENCE_TEMPLATES.has(normalized)) return normalized;
  if (normalized === "cite_book_chapter") return "cite_book";
  return REFERENCE_TEMPLATE_BY_TYPE.get(type) ?? "unknown";
}

export function normalizeWorkbenchReference(reference) {
  const type = normalizeReferenceType(reference?.type);
  return {
    id: normalizeString(reference?.id),
    type,
    template: normalizeReferenceTemplate(reference?.template, type),
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
    chapter: reference?.chapter ?? null,
    edition: reference?.edition ?? null,
    series: reference?.series ?? null,
    location: reference?.location ?? null,
    institution: reference?.institution ?? null,
    language: reference?.language ?? null,
    doi: reference?.doi ?? null,
    pmid: reference?.pmid ?? null,
    isbn: reference?.isbn ?? null,
    url: reference?.url ?? null,
    archiveUrl: reference?.archiveUrl ?? null,
    archiveDate: reference?.archiveDate ?? null,
    accessedAt: reference?.accessedAt ?? null,
    sourceType: normalizeReferenceSourceType(reference?.sourceType),
    quality: normalizeReferenceQuality(reference?.quality),
    discoverySource: reference?.discoverySource ?? null,
    access: normalizeReferenceAccess(reference?.access),
    supportStatus: normalizeReferenceSupportStatus(reference?.supportStatus),
    apaText: reference?.apaText ?? null,
    metadataProvenance: normalizeReferenceMetadataProvenance([
      ...(reference?.metadataProvenance ?? []),
      {
        kind: "inspected",
        source: "citation-workbench",
        fields: Object.entries(reference ?? {})
          .filter(([field, value]) => field !== "id" && field !== "metadataProvenance" && value != null && value !== "")
          .map(([field]) => field),
      },
    ]),
  };
}

export function mergeReferences(existingReferences = [], draftReferences = []) {
  return mergeReferenceCollections(
    existingReferences,
    draftReferences.map(normalizeWorkbenchReference),
    { allowTrustedScalarOverride: true },
  );
}

function resolveReferenceId(aliasById, referenceId) {
  const id = normalizeString(referenceId);
  return aliasById.get(id) ?? id;
}

function rewriteCitationMarkersInText(value, aliasById) {
  return value.replace(CITE_MARKER_PATTERN, (_marker, referenceId) => (
    `[cite:${resolveReferenceId(aliasById, referenceId)}]`
  ));
}

function rewriteCitationMarkersInValue(value, aliasById) {
  if (typeof value === "string") return rewriteCitationMarkersInText(value, aliasById);
  if (Array.isArray(value)) return value.map((entry) => rewriteCitationMarkersInValue(entry, aliasById));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteCitationMarkersInValue(entry, aliasById)]),
    );
  }
  return value;
}

function rewriteEvidenceReferenceIds(workbenchDraft, aliasById) {
  return {
    ...workbenchDraft,
    evidence: (workbenchDraft.evidence ?? []).map((evidence) => ({
      ...evidence,
      referenceIds: Array.isArray(evidence.referenceIds)
        ? evidence.referenceIds.map((referenceId) => resolveReferenceId(aliasById, referenceId))
        : evidence.referenceIds,
      supports: Array.isArray(evidence.supports)
        ? evidence.supports.map((support) => ({
            ...support,
            referenceId: resolveReferenceId(aliasById, support?.referenceId),
          }))
        : evidence.supports,
    })),
  };
}

function rewriteWorkbenchDraftReferenceIds(workbenchDraft, aliasById) {
  return rewriteEvidenceReferenceIds({
    ...workbenchDraft,
    markedSections: workbenchDraft.markedSections
      ? rewriteCitationMarkersInValue(workbenchDraft.markedSections, aliasById)
      : workbenchDraft.markedSections,
  }, aliasById);
}

export function normalizeSelectedSections(workbenchDraft) {
  if (workbenchDraft?.selectedSections === undefined || workbenchDraft?.selectedSections === null) {
    return null;
  }
  if (!Array.isArray(workbenchDraft.selectedSections) || workbenchDraft.selectedSections.length === 0) {
    throw new Error("Scoped citation draft selectedSections must be a non-empty array.");
  }
  const selected = new Set();
  for (const section of workbenchDraft.selectedSections) {
    if (!CITABLE_ARTICLE_SECTIONS.includes(section)) {
      throw new Error(`Scoped citation draft selectedSections entry ${section} is not in the citable article surface.`);
    }
    if (selected.has(section)) {
      throw new Error(`Scoped citation draft selectedSections contains duplicate entry ${section}.`);
    }
    selected.add(section);
  }
  return selected;
}

function assertScopedSelection(workbenchDraft, markedSections) {
  const selected = normalizeSelectedSections(workbenchDraft);
  if (!selected) return;

  for (const sectionKey of Object.keys(markedSections)) {
    if (!selected.has(sectionKey)) {
      throw new Error(`Scoped citation draft markedSections includes ${sectionKey}, which is not in selectedSections.`);
    }
  }

  for (const [index, evidence] of (workbenchDraft.evidence ?? []).entries()) {
    const section = evidencePathFor(evidence).split(".")[0];
    if (section && !selected.has(section)) {
      throw new Error(`Scoped citation draft evidence row ${index} targets ${section}, which is not in selectedSections.`);
    }
  }
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

function sourceNameForSupport(sourcesById, referencesById, support) {
  const source = sourcesById.get(normalizeString(support.sourceId));
  const reference = referencesById.get(normalizeString(support.referenceId));
  return normalizeString(
    support.sourceName
      ?? source?.sourceName
      ?? source?.title
      ?? source?.name
      ?? reference?.title
      ?? reference?.siteName
      ?? reference?.publisher,
  );
}

function buildEvidenceRow(workbenchDraft, evidence, referencesById, sourcesById) {
  const supports = evidence.status === "supported"
    ? sortEvidenceSupports((evidence.supports ?? []).map((support) => ({
        sourceId: normalizeString(support.sourceId),
        sourceName: sourceNameForSupport(sourcesById, referencesById, support),
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

  if (evidence.status === "supported" && supports.length === 0) {
    throw new Error(
      `Supported workbench evidence ${evidence.claimKey} produced no persistable source supports.`,
    );
  }

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

function markerSectionsFromDraft(workbenchDraft) {
  return workbenchDraft.markedSections ??
    workbenchDraft.markedArticle?.sections ??
    workbenchDraft.articleWide?.markedSections ??
    workbenchDraft.article?.markedSections ??
    {};
}

function supportedEvidenceRows(workbenchDraft) {
  return (workbenchDraft.evidence ?? []).filter((row) => row?.status === "supported");
}

function evidencePathFor(row) {
  if (typeof row?.fieldPath === "string" && row.fieldPath.trim()) return row.fieldPath.trim();
  if (typeof row?.markerPath === "string" && row.markerPath.trim()) return row.markerPath.trim();
  if (typeof row?.markerLocation?.fieldPath === "string" && row.markerLocation.fieldPath.trim()) {
    return row.markerLocation.fieldPath.trim();
  }
  return "";
}

function evidenceSupportsReference(row, referenceId) {
  const referenceIds = Array.isArray(row?.referenceIds) ? row.referenceIds : [];
  if (!referenceIds.includes(referenceId)) return false;
  const supports = Array.isArray(row?.supports) ? row.supports : [];
  return supports.some((support) => (
    support?.referenceId === referenceId &&
    normalizeString(support.supportingQuote) &&
    normalizeString(support.rationale)
  ));
}

function assertMarkerEvidenceCoverage(workbenchDraft, markers) {
  const rows = supportedEvidenceRows(workbenchDraft);
  const errors = [];

  for (const marker of markers) {
    const supported = rows.some((row) => (
      evidencePathFor(row) === marker.path &&
      evidenceSupportsReference(row, marker.referenceId)
    ));
    if (!supported) {
      errors.push(`${marker.marker} at ${marker.path} has no supported evidence row with quote and rationale.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Marker-only draft failed evidence coverage: ${errors.join(" ")}`);
  }
}

function buildArticleFromMarkerOnlyWorkbenchDraft({ article, workbenchDraft }) {
  const nextArticle = stripDataStorageFields(clone(article));
  const changes = [];
  const mergedReferences = mergeReferences(nextArticle.references ?? [], workbenchDraft.references ?? []);
  nextArticle.references = mergedReferences.references.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const normalizedWorkbenchDraft = rewriteWorkbenchDraftReferenceIds(workbenchDraft, mergedReferences.remap);

  const markedSections = markerSectionsFromDraft(normalizedWorkbenchDraft);
  assertScopedSelection(normalizedWorkbenchDraft, markedSections);
  const newMarkers = [];
  for (const [sectionKey, candidateSection] of Object.entries(markedSections)) {
    if (!CITABLE_ARTICLE_SECTIONS.includes(sectionKey)) {
      throw new Error(`Marker-only draft included non-citable section ${sectionKey}.`);
    }

    const validation = validateSectionMarkerCandidate({
      sectionKey,
      originalSection: article?.[sectionKey],
      candidateSection,
      references: nextArticle.references,
    });
    if (!validation.ok) {
      const messages = validation.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join("; ");
      throw new Error(`Marker-only draft failed validation for ${sectionKey}: ${messages}`);
    }

    nextArticle[sectionKey] = clone(candidateSection);
    newMarkers.push(...validation.newMarkers);
    recordChange(changes, sectionKey, article?.[sectionKey], candidateSection);
  }

  assertMarkerEvidenceCoverage(normalizedWorkbenchDraft, newMarkers);
  recordChange(changes, "references", article.references ?? [], nextArticle.references);
  return { article: nextArticle, changes };
}

function buildArticleFromWorkbenchDraft({ article, workbenchDraft }) { if (isMarkerOnlyWorkbenchDraft(workbenchDraft)) {
  return buildArticleFromMarkerOnlyWorkbenchDraft({ article, workbenchDraft });
}

const nextArticle = stripDataStorageFields(clone(article));
const changes = [];
const mergedReferences = mergeReferences(nextArticle.references ?? [], workbenchDraft.references ?? []);
nextArticle.references = mergedReferences.references.sort((left, right) => String(left.id).localeCompare(String(right.id)));
const normalizedWorkbenchDraft = rewriteWorkbenchDraftReferenceIds(workbenchDraft, mergedReferences.remap);

for (const evidence of normalizedWorkbenchDraft.evidence ?? []) {
  if (evidence.status === "supported") {
    applySupportedClaim(nextArticle, changes, evidence);
  }
}

recordChange(changes, "references", article.references ?? [], nextArticle.references);
return { article: nextArticle, changes }; }

function buildEvidenceFromWorkbenchDraft(workbenchDraft) { const normalizedReferences = (workbenchDraft.references ?? []).map(normalizeWorkbenchReference);
const { remap: referenceIdAliasMap } = mergeReferenceCollections(
  [],
  normalizedReferences,
  { allowTrustedScalarOverride: true },
);
const referencesById = new Map(
  normalizedReferences
    .filter((reference) => reference.id)
    .map((reference) => [resolveReferenceId(referenceIdAliasMap, reference.id), reference]),
);
const normalizedWorkbenchDraft = rewriteEvidenceReferenceIds(workbenchDraft, referenceIdAliasMap);
const sourcesById = new Map(
  (normalizedWorkbenchDraft.sources ?? [])
    .filter((source) => normalizeString(source?.id))
    .map((source) => [normalizeString(source.id), source]),
);

return (normalizedWorkbenchDraft.evidence ?? []).map((evidence) => {
  const normalizedEvidence = {
    ...evidence,
    fieldPath: evidencePathFor(evidence) || evidence.fieldPath,
  };
  return buildEvidenceRow(workbenchDraft, normalizedEvidence, referencesById, sourcesById);
}); }

export function buildWorkbenchApplyDraft({ article, workbenchDraft }) {
  return buildWorkbenchPromotionPlan({ article, workbenchDraft });
}

export function buildWorkbenchPromotionPlan({
  article,
  workbenchDraft,
  approvedWriteMode = "preserve",
}) {
  assertWorkbenchDraftPromotionAllowed(workbenchDraft);
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

/** The draft a workbench run directory holds for one slug, under DOSEWIKI_CITATION_WORKBENCH. */
export function workbenchDraftPath(slug) {
  return resolve(resolveCitationWorkbenchRoot(), "runs", slug, "citation-draft.json");
}

export function loadWorkbenchDraft(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}
