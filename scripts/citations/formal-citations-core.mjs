import {
  canonicalizeArticleReferences,
  collectFormalCitationReferences,
  normalizeReferenceForArticle,
} from "./formal-citations-reference-catalog.mjs";
import { getFormalCitationSectionConfig } from "./formal-citations-section-config.mjs";
import { buildFormalCitationTargets } from "./formal-citations-targets.mjs";

export {
  classifyQuality,
  classifySourceType,
  collectFormalCitationReferences,
  legacyCitationToReference,
} from "./formal-citations-reference-catalog.mjs";
export {
  FORMAL_CITATION_SECTION_CONFIG,
  FORMAL_CITATION_SECTIONS,
  getFormalCitationSectionConfig,
  hasCitableTolerance,
  normalizeFormalCitationSectionKey,
  resolveFormalCitationSections,
} from "./formal-citations-section-config.mjs";
export { buildFormalCitationTargets } from "./formal-citations-targets.mjs";

function extractCitationIds(value) {
  if (typeof value !== "string") return [];
  return Array.from(
    value.matchAll(/\[cite:([^\]]+)\]/g),
    (match) => match[1],
  );
}

// NOTE: This is intentionally NOT the marker-only stripping from
// citation-only-validator.mjs. The legacy claim-key sync flow removes tokens
// together with their leading whitespace, collapses whitespace runs, and trims
// because syncCitationTokens() re-appends a sorted token cluster at the end of
// the value. It also accepts a looser token grammar ([cite:<anything>]). The
// validator's stripping must instead restore original text byte-for-byte.
function stripCitationTokens(value) {
  if (typeof value !== "string") {
    return {
      text: value,
      existingReferenceIds: [],
    };
  }

  const existingReferenceIds = dedupeStrings(extractCitationIds(value));
  const text = value
    .replace(/\s*\[cite:[^\]]+\]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

  return {
    text,
    existingReferenceIds,
  };
}

function sortSupports(supports = []) {
  return [...supports].sort((left, right) => (
    String(left?.referenceId ?? "").localeCompare(String(right?.referenceId ?? "")) ||
    String(left?.sourceId ?? "").localeCompare(String(right?.sourceId ?? "")) ||
    String(left?.supportingQuote ?? "").localeCompare(String(right?.supportingQuote ?? "")) ||
    String(left?.rationale ?? "").localeCompare(String(right?.rationale ?? ""))
  ));
}

function normalizeSupportEntries(supports = []) {
  const deduped = [];
  const seen = new Set();
  for (const support of sortSupports(supports)) {
    const referenceId = typeof support?.referenceId === "string" ? support.referenceId.trim() : "";
    if (!referenceId) continue;
    const signature = JSON.stringify([
      referenceId,
      String(support?.sourceId ?? "").trim(),
      String(support?.supportingQuote ?? "").trim(),
      String(support?.rationale ?? "").trim(),
    ]);
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push({
      sourceId: typeof support?.sourceId === "string" ? support.sourceId.trim() : "",
      sourceName: typeof support?.sourceName === "string" ? support.sourceName.trim() : "",
      referenceId,
      sourceType: typeof support?.sourceType === "string" && support.sourceType.trim()
        ? support.sourceType.trim()
        : null,
      quality: typeof support?.quality === "string" && support.quality.trim()
        ? support.quality.trim()
        : null,
      supportingQuote: typeof support?.supportingQuote === "string" ? support.supportingQuote.trim() : "",
      rationale: typeof support?.rationale === "string" ? support.rationale.trim() : "",
      verifiedQuote: support?.verifiedQuote ?? null,
    });
  }
  return deduped;
}

function dedupeStrings(values = []) {
  const seen = new Set();
  const deduped = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function syncCitationTokens(value, referenceIds) {
  const desiredReferenceIds = dedupeStrings(referenceIds).sort((left, right) => left.localeCompare(right));
  const { text, existingReferenceIds } = stripCitationTokens(value);
  const existing = new Set(existingReferenceIds);
  const desired = new Set(desiredReferenceIds);
  const removedReferenceIds = existingReferenceIds.filter((referenceId) => !desired.has(referenceId));
  const addedReferenceIds = desiredReferenceIds.filter((referenceId) => !existing.has(referenceId));
  const updatedValue = desiredReferenceIds.length > 0
    ? `${text ? `${text} ` : ""}${desiredReferenceIds.map((referenceId) => `[cite:${referenceId}]`).join("")}`
    : text;

  return {
    updatedValue,
    existingReferenceIds,
    removedReferenceIds,
    addedReferenceIds,
  };
}

function recordStateChange(state, path, before, after) {
  const serializedBefore = JSON.stringify(before);
  const serializedAfter = JSON.stringify(after);
  if (serializedBefore === serializedAfter) {
    return;
  }

  const existingIndex = state.changes.findIndex((change) => change.path === path);
  const nextChange = { path, before, after };
  if (existingIndex >= 0) {
    state.changes[existingIndex] = nextChange;
  } else {
    state.changes.push(nextChange);
  }
}

function remapReferenceIdList(referenceIds = [], remap = new Map()) {
  const deduped = [];
  const seen = new Set();
  for (const referenceId of referenceIds ?? []) {
    const normalized = typeof referenceId === "string" ? referenceId.trim() : "";
    if (!normalized) continue;
    const mapped = remap.get(normalized) ?? normalized;
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    deduped.push(mapped);
  }
  return deduped;
}

function remapCitationTokensInText(value, remap = new Map()) {
  if (typeof value !== "string" || !value.includes("[cite:")) {
    return value;
  }
  const remapped = value.replace(/\[cite:([^\]]+)\]/g, (_token, referenceId) => {
    const mapped = remap.get(referenceId) ?? referenceId;
    return `[cite:${mapped}]`;
  });
  return remapped.replace(/(\[cite:[^\]]+\])(?:\1)+/g, "$1");
}

function applyReferenceRemapToEvidenceRows(evidenceRows = [], remap = new Map()) {
  return evidenceRows.map((row) => {
    const supports = normalizeSupportEntries(
      (Array.isArray(row?.supports) ? row.supports : []).map((support) => ({
        ...support,
        referenceId: remap.get(String(support?.referenceId ?? "").trim()) ?? String(support?.referenceId ?? "").trim(),
      })),
    );
    const primarySupport = supports.length === 1 ? supports[0] : null;
    const referenceIds = remapReferenceIdList(
      Array.isArray(row?.referenceIds) && row.referenceIds.length > 0
        ? row.referenceIds
        : supports.map((support) => support.referenceId),
      remap,
    );

    return {
      ...row,
      referenceIds,
      sourceName: primarySupport?.sourceName,
      sourceType: primarySupport?.sourceType ?? undefined,
      quality: primarySupport?.quality ?? undefined,
      supportingSnippet: primarySupport?.supportingQuote,
      supportRationale: primarySupport?.rationale,
      supports,
    };
  });
}

function applyReferenceRemapToArticle(state, remap = new Map()) {
  const visit = (node, path = "") => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "references" || key === "source_citations" || key === "citations" || key === "editorial_review") {
        continue;
      }

      const childPath = path ? `${path}.${key}` : key;
      if (key === "reference_ids" && Array.isArray(value)) {
        const remapped = remapReferenceIdList(value, remap);
        if (JSON.stringify(remapped) !== JSON.stringify(value)) {
          node[key] = remapped;
          recordStateChange(state, childPath, value, remapped);
        }
        continue;
      }

      if (typeof value === "string" && value.includes("[cite:")) {
        const remapped = remapCitationTokensInText(value, remap);
        if (remapped !== value) {
          node[key] = remapped;
          recordStateChange(state, childPath, value, remapped);
        }
        continue;
      }

      visit(value, childPath);
    }
  };

  visit(state.article);
}

function finalizeReferenceCanonicalization(state) {
  const previousReferences = Array.isArray(state.article?.references) ? structuredClone(state.article.references) : [];
  const { references, remap } = canonicalizeArticleReferences(state.references ?? []);
  state.references = references;
  state.article.references = references;
  recordStateChange(state, "references", previousReferences, references);
  applyReferenceRemapToArticle(state, remap);
  state.evidence = applyReferenceRemapToEvidenceRows(state.evidence, remap);
}

function firstSourceSnippet(articleSources, sectionKey) { const config = getFormalCitationSectionConfig(sectionKey);
const contents = articleSources?.contents ?? {};
const sources = articleSources?.sources ?? [];
const needles = config.sourceNeedles.map((needle) => needle.toLowerCase());
for (const source of sources) {
  const content = contents[source.id];
  if (typeof content !== "string" || !content.trim()) continue;
  const lower = content.toLowerCase();
  const index = needles.reduce((best, needle) => {
    const found = lower.indexOf(needle);
    if (found === -1) return best;
    if (best === -1) return found;
    return Math.min(best, found);
  }, -1);
  const start = index >= 0 ? Math.max(0, index - 120) : 0;
  return {
    sourceName: source.displayName || source.id,
    sourceId: source.id,
    snippet: content.slice(start, start + 420).replace(/\s+/g, " ").trim(),
  };
}
return null; }

function referenceForSource(references, sourceName) {
  const normalizedSourceName = String(sourceName ?? "").trim().toLowerCase();
  if (!normalizedSourceName) return references[0] ?? null;
  return references.find((reference) => {
    const haystack = `${reference.title ?? ""} ${reference.siteName ?? ""} ${reference.url ?? ""}`.toLowerCase();
    return haystack.includes(normalizedSourceName) || normalizedSourceName.includes(String(reference.title ?? "").toLowerCase());
  }) ?? references[0] ?? null;
}

function initializeDraftState(article, existingEvidence = []) {
  const draftArticle = structuredClone(article);
  draftArticle.references = collectFormalCitationReferences(article);

  return {
    slug: article.slug,
    title: article.title,
    article: draftArticle,
    changes: [],
    references: draftArticle.references,
    evidence: [],
    gaps: [],
    preservedApproved: [],
    newSupport: [],
    proposedReplacements: [],
    staleEvidence: [],
    staleReferences: [],
    existingEvidence,
  };
}

function sanitizeAllowedReferenceForArticle(reference) {
  return normalizeReferenceForArticle(reference);
}

function mergeAllowedSectionReferencesIntoState(state, sectionResults) {
  for (const result of sectionResults ?? []) {
    for (const reference of result?.sourcePacket?.allowedReferences ?? []) {
      const sanitized = sanitizeAllowedReferenceForArticle(reference);
      if (sanitized?.id) {
        state.references.push(sanitized);
      }
    }
  }
}

function pushGap(state, target, sectionConfig, reason) {
  state.gaps.push({
    section: sectionConfig.legacyKey,
    path: target.fieldPath,
    severity: sectionConfig.severity,
    reason,
  });
}

function makeEvidence({
  article,
  sectionConfig,
  target,
  supports = [],
  status = "supported",
  statusReason = "",
  diagnostics = [],
  originalStatus = null,
}) {
  const normalizedSupports = normalizeSupportEntries(supports);
  const referenceIds = normalizedSupports.map((support) => support.referenceId);
  const primarySupport = normalizedSupports.length === 1 ? normalizedSupports[0] : null;
  return {
    section: sectionConfig.legacyKey,
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    claimText: target.claimText,
    referenceIds,
    sourceName: primarySupport?.sourceName,
    sourceType: primarySupport?.sourceType ?? undefined,
    quality: primarySupport?.quality ?? undefined,
    status,
    statusReason: statusReason || undefined,
    severity: sectionConfig.severity,
    confidence: status === "supported" ? 0.65 : status === "needs_review" ? 0.35 : 0,
    supportingSnippet: primarySupport?.supportingQuote,
    supportRationale: primarySupport?.rationale,
    supports: normalizedSupports,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
    provenance: {
      generatedBy: "scripts/citations/formal-citations.mjs",
      articleId: article.id,
      promptSection: sectionConfig.key,
      originalStatus,
    },
  };
}

function isSupportedStatus(status) {
  return status === "supported" || status === "approved";
}

function normalizeClaimStatus(status) {
  switch (status) {
    case "supported":
    case "needs_review":
    case "needs_source":
      return status;
    default:
      return "needs_review";
  }
}

function claimSupportsStrictlyValidated(supports) {
  const normalizedSupports = normalizeSupportEntries(supports);
  return normalizedSupports.length > 0 && normalizedSupports.every((support) => (
    support.sourceId &&
    support.sourceName &&
    support.referenceId &&
    support.supportingQuote &&
    support.rationale &&
    support.verifiedQuote &&
    support.verifiedQuote.sourceId === support.sourceId
  ));
}

function finalizeClaimStatus(claim) {
  const normalized = normalizeClaimStatus(claim?.status);
  const supports = Array.isArray(claim?.supports) ? claim.supports : [];
  if (normalized === "supported") {
    if (claimSupportsStrictlyValidated(supports)) {
      return "supported";
    }
    return supports.length > 0 ? "needs_review" : "needs_source";
  }
  return normalized;
}

function extractClaimSupports(claim) {
  if (Array.isArray(claim?.supports) && claim.supports.length > 0) {
    return normalizeSupportEntries(claim.supports);
  }

  const legacyReferenceId = typeof claim?.referenceId === "string" ? claim.referenceId.trim() : "";
  if (!legacyReferenceId) {
    return [];
  }

  return normalizeSupportEntries([{
    sourceId: typeof claim?.sourceId === "string" ? claim.sourceId.trim() : "",
    sourceName: typeof claim?.sourceName === "string" ? claim.sourceName.trim() : "",
    referenceId: legacyReferenceId,
    supportingQuote: typeof claim?.supportingQuote === "string" ? claim.supportingQuote.trim() : "",
    rationale: typeof claim?.rationale === "string" ? claim.rationale.trim() : "",
    verifiedQuote: claim?.verifiedQuote ?? null,
  }]);
}

function normalizeExistingEvidenceRow(row, { target, sectionConfig }) {
  const supports = normalizeSupportEntries(row?.supports);
  const referenceIds = supports.length > 0
    ? supports.map((support) => support.referenceId)
    : dedupeStrings(Array.isArray(row?.referenceIds) ? row.referenceIds : []);
  const primarySupport = supports.length === 1 ? supports[0] : null;

  return {
    section: row?.section ?? sectionConfig.legacyKey,
    claimKey: target.claimKey,
    fieldPath: row?.fieldPath ?? target.fieldPath,
    claimText: row?.claimText ?? target.claimText,
    referenceIds,
    sourceName: primarySupport?.sourceName ?? row?.sourceName,
    sourceType: primarySupport?.sourceType ?? row?.sourceType,
    quality: primarySupport?.quality ?? row?.quality,
    status: row?.status ?? "needs_review",
    statusReason: row?.statusReason,
    severity: row?.severity ?? sectionConfig.severity,
    confidence: row?.confidence,
    supportingSnippet: primarySupport?.supportingQuote ?? row?.supportingSnippet,
    supportRationale: primarySupport?.rationale ?? row?.supportRationale,
    supports,
    diagnostics: Array.isArray(row?.diagnostics) ? row.diagnostics : [],
    provenance: row?.provenance,
  };
}

function comparableEvidenceRow(row = {}) {
  const supports = normalizeSupportEntries(row.supports);
  return {
    section: row.section,
    claimKey: row.claimKey,
    fieldPath: row.fieldPath,
    claimText: row.claimText ?? "",
    referenceIds: dedupeStrings(Array.isArray(row.referenceIds) ? row.referenceIds : []),
    status: row.status,
    statusReason: row.statusReason ?? "",
    severity: row.severity,
    confidence: row.confidence ?? null,
    supports,
    diagnostics: Array.isArray(row.diagnostics) ? row.diagnostics : [],
  };
}

function evidenceRowsEquivalent(left, right) {
  return JSON.stringify(comparableEvidenceRow(left)) === JSON.stringify(comparableEvidenceRow(right));
}

function summarizeEvidenceRow(row = {}) {
  return {
    claimKey: row.claimKey,
    fieldPath: row.fieldPath ?? null,
    status: row.status,
    referenceIds: Array.isArray(row.referenceIds) ? row.referenceIds : [],
    statusReason: row.statusReason ?? "",
  };
}

function getObjectAtPath(root, path) {
  let current = root;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  return current;
}

function recordStaleReferenceChange(state, target, mergeMode, existingReferenceIds, removedReferenceIds) {
  if (!Array.isArray(removedReferenceIds) || removedReferenceIds.length === 0) {
    return;
  }

  const knownReferenceIds = new Set((state.references ?? []).map((reference) => reference.id));
  state.staleReferences.push({
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    mergeMode,
    existingReferenceIds,
    removedReferenceIds,
    unknownReferenceIds: removedReferenceIds.filter((referenceId) => !knownReferenceIds.has(referenceId)),
  });
}

function applyInlineTextClaim(state, target, referenceIds) {
  const pathParts = target.fieldPath.split(".");
  let parent = state.article;
  for (const part of pathParts.slice(0, -1)) {
    parent = parent?.[part];
  }
  const key = pathParts[pathParts.length - 1];
  const original = parent?.[key];
  if (typeof original !== "string" || !original.trim()) {
    return;
  }
  const sync = syncCitationTokens(original, referenceIds);
  const updated = sync.updatedValue;
  if (updated !== original) {
    parent[key] = updated;
    recordStateChange(state, target.fieldPath, original, updated);
  }
  recordStaleReferenceChange(state, target, "inline_text", sync.existingReferenceIds, sync.removedReferenceIds);
}

function applyStructuredReferenceClaim(state, target, referenceIds) {
  const routeCollection = getObjectAtPath(state.article, target.collectionPath);
  if (!Array.isArray(routeCollection)) {
    return;
  }
  const entry = routeCollection.find((item) => item?.route === target.route);
  if (!entry) {
    return;
  }
  const before = Array.isArray(entry.reference_ids) ? [...entry.reference_ids] : [];
  const after = dedupeStrings(referenceIds).sort((left, right) => left.localeCompare(right));
  entry.reference_ids = after;
  recordStateChange(state, `${target.collectionPath}.${target.route}.reference_ids`, before, after);
  recordStaleReferenceChange(
    state,
    target,
    "structured_reference_ids",
    before,
    before.filter((referenceId) => !after.includes(referenceId)),
  );
}

function createReplacementRecord({ sectionConfig, target, existingRow, proposedRow, applied, reason }) {
  return {
    section: sectionConfig.legacyKey,
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    applied,
    reason,
    existing: summarizeEvidenceRow(existingRow),
    proposed: summarizeEvidenceRow(proposedRow),
  };
}

function createPreservedApprovedRecord({ sectionConfig, target, existingRow, proposedRow }) {
  return {
    section: sectionConfig.legacyKey,
    claimKey: target.claimKey,
    fieldPath: target.fieldPath,
    existing: summarizeEvidenceRow(existingRow),
    proposed: summarizeEvidenceRow(proposedRow),
    differsFromRerun: !evidenceRowsEquivalent(existingRow, proposedRow),
  };
}

export function buildFormalCitationDraft({ article, articleSources = null, existingEvidence = [] }) {
  const state = initializeDraftState(article, existingEvidence);

  const citeStringField = (sectionKey, path, claimText) => {
    const sectionConfig = getFormalCitationSectionConfig(sectionKey);
    const target = {
      claimKey: `${sectionConfig.legacyKey}:${path}`,
      fieldPath: path,
      claimText,
      mergeMode: "inline_text",
    };
    const source = firstSourceSnippet(articleSources, sectionKey);
    const reference = referenceForSource(state.references, source?.sourceName);
    const referenceId = reference?.id;
    if (referenceId) {
      applyInlineTextClaim(state, target, [referenceId]);
    }
    state.evidence.push(makeEvidence({
      article,
      sectionConfig,
      target,
      status: source ? "needs_review" : "needs_source",
      statusReason: source?.snippet
        ? "Initial deterministic pilot support exists for this section but still needs strict claim validation."
        : "No quotable source snippet available.",
    }));
    if (!source) {
      pushGap(state, target, sectionConfig, "No quotable source snippet available");
    }
  };

  if (typeof article?.summary === "string" && article.summary.trim()) {
    citeStringField("summary", "summary", article.summary.trim());
  }
  if (typeof article?.pharmacology?.pharmacodynamics === "string" && article.pharmacology.pharmacodynamics.trim()) {
    citeStringField("pharmacology", "pharmacology.pharmacodynamics", article.pharmacology.pharmacodynamics.trim());
  }
  if (typeof article?.pharmacology?.pharmacokinetics === "string" && article.pharmacology.pharmacokinetics.trim()) {
    citeStringField("pharmacology", "pharmacology.pharmacokinetics", article.pharmacology.pharmacokinetics.trim());
  }
  if (typeof article?.harm_potential?.summary === "string" && article.harm_potential.summary.trim()) {
    citeStringField("harm_potential", "harm_potential.summary", article.harm_potential.summary.trim());
  }
  if (typeof article?.history_culture?.content === "string" && article.history_culture.content.trim()) {
    citeStringField("history_culture", "history_culture.content", article.history_culture.content.trim());
  }

  if (article?.legality?.countries && typeof article.legality.countries === "object") {
    for (const [country, entry] of Object.entries(article.legality.countries)) {
      if (typeof entry?.notes === "string" && entry.notes.trim()) {
        citeStringField("legality", `legality.countries.${country}.notes`, entry.notes.trim());
      }
    }
  }

  for (const [field, value] of Object.entries(article?.tolerance ?? {})) {
    if (typeof value === "string" && value.trim()) {
      citeStringField("tolerance", `tolerance.${field}`, value.trim());
    }
  }

  finalizeReferenceCanonicalization(state);
  return state;
}

export function buildFormalCitationDraftFromAgent({
  article,
  articleSources: _articleSources = null,
  existingEvidence = [],
  sectionResults = [],
  approvedWriteMode = "preserve",
}) {
  const state = initializeDraftState(article, existingEvidence);
  mergeAllowedSectionReferencesIntoState(state, sectionResults);
  const selectedSections = new Set(
    sectionResults.map((result) => getFormalCitationSectionConfig(result.sectionKey).legacyKey),
  );
  const existingEvidenceByClaim = new Map(
    existingEvidence.map((row) => [row.claimKey, row]),
  );
  const targetedClaimKeys = new Set();

  const processEvidenceRow = ({ sectionConfig, target, proposedRow, gapReason }) => {
    targetedClaimKeys.add(target.claimKey);

    const existingRow = existingEvidenceByClaim.get(target.claimKey);
    const normalizedExistingRow = existingRow
      ? normalizeExistingEvidenceRow(existingRow, { target, sectionConfig })
      : null;
    const preserveApproved = (
      approvedWriteMode === "preserve" &&
      normalizedExistingRow?.status === "approved"
    );
    const effectiveRow = preserveApproved
      ? normalizedExistingRow
      : proposedRow;

    if (preserveApproved) {
      state.preservedApproved.push(createPreservedApprovedRecord({
        sectionConfig,
        target,
        existingRow: normalizedExistingRow,
        proposedRow,
      }));
      if (!evidenceRowsEquivalent(normalizedExistingRow, proposedRow)) {
        state.proposedReplacements.push(createReplacementRecord({
          sectionConfig,
          target,
          existingRow: normalizedExistingRow,
          proposedRow,
          applied: false,
          reason: "Preserving an approved evidence row for this claim during rerun.",
        }));
      }
    } else if (normalizedExistingRow) {
      if (!evidenceRowsEquivalent(normalizedExistingRow, effectiveRow)) {
        state.proposedReplacements.push(createReplacementRecord({
          sectionConfig,
          target,
          existingRow: normalizedExistingRow,
          proposedRow: effectiveRow,
          applied: true,
          reason: approvedWriteMode === "replace"
            ? "Replacing the persisted evidence row with rerun output."
            : "Refreshing the persisted evidence row with rerun output.",
        }));
      }
    } else if (isSupportedStatus(effectiveRow.status)) {
      state.newSupport.push({
        section: sectionConfig.legacyKey,
        claimKey: target.claimKey,
        fieldPath: target.fieldPath,
        status: effectiveRow.status,
        referenceIds: effectiveRow.referenceIds,
      });
    }

    if (isSupportedStatus(effectiveRow.status) && effectiveRow.referenceIds.length > 0) {
      if (target.mergeMode === "inline_text") {
        applyInlineTextClaim(state, target, effectiveRow.referenceIds);
      } else if (target.mergeMode === "structured_reference_ids") {
        applyStructuredReferenceClaim(state, target, effectiveRow.referenceIds);
      }
    } else if (target.mergeMode === "inline_text") {
      applyInlineTextClaim(state, target, []);
    } else if (target.mergeMode === "structured_reference_ids") {
      applyStructuredReferenceClaim(state, target, []);
    }

    state.evidence.push(effectiveRow);

    if (!isSupportedStatus(effectiveRow.status)) {
      pushGap(state, target, sectionConfig, gapReason);
    }
  };

  for (const result of sectionResults) {
    const sectionConfig = getFormalCitationSectionConfig(result.sectionKey);
    const decisionMap = new Map(
      (result.claims ?? []).map((claim) => [claim.claimKey, claim]),
    );
    const sectionTargets = buildFormalCitationTargets({ article, sectionKey: result.sectionKey });

    for (const target of sectionTargets) {
      const claim = decisionMap.get(target.claimKey);
      if (!claim) continue;

      const supports = extractClaimSupports(claim);
      const finalStatus = finalizeClaimStatus({
        ...claim,
        supports,
      });
      const proposedRow = makeEvidence({
        article,
        sectionConfig,
        target,
        status: finalStatus,
        statusReason: claim.statusReason?.trim() || claim.rationale?.trim() || "",
        supports: finalStatus === "needs_source" ? [] : supports,
        diagnostics: Array.isArray(claim.diagnostics) ? claim.diagnostics : [],
        originalStatus: claim.originalStatus ?? claim.status ?? null,
      });

      processEvidenceRow({
        sectionConfig,
        target,
        proposedRow,
        gapReason: claim.statusReason?.trim() || claim.rationale?.trim() || (
          finalStatus === "needs_review"
            ? "Agent marked this claim for human review."
            : "Agent could not find direct support in the bounded source packet."
        ),
      });
    }

    const missingTargets = sectionTargets.filter((target) => !decisionMap.has(target.claimKey));
    for (const target of missingTargets) {
      processEvidenceRow({
        sectionConfig,
        target,
        proposedRow: makeEvidence({
          article,
          sectionConfig,
          target,
          supports: [],
          status: "needs_source",
          statusReason: "The citation agent did not return a claim decision for this target.",
        }),
        gapReason: "Citation agent returned no decision for this target",
      });
    }
  }

  for (const row of existingEvidence) {
    if (!selectedSections.has(row.section)) {
      continue;
    }
    if (targetedClaimKeys.has(row.claimKey)) {
      continue;
    }

    state.staleEvidence.push({
      section: row.section,
      claimKey: row.claimKey,
      fieldPath: row.fieldPath ?? null,
      status: row.status,
      referenceIds: Array.isArray(row.referenceIds) ? row.referenceIds : [],
      action: approvedWriteMode === "replace" ? "delete" : "preserve",
      reason: "No current selected claim target matched this persisted evidence row during rerun.",
    });
  }

  finalizeReferenceCanonicalization(state);
  return state;
}
