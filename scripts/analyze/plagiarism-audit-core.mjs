const PRIORITY_SOURCE_IDS = new Set(["psychonautwiki", "erowid"]);

export const DEFAULT_AUDIT_THRESHOLDS = {
  minComparableWords: 8,
  needsReviewWords: 8,
  needsReviewCoverage: 0.35,
  likelyWords: 12,
  likelyCoverage: 0.55,
  veryLongExactWords: 18,
  maxExactWords: 80,
  excerptWords: 24,
};

export const DOSE_TABLE_TOLERANCE_SCOPE_FIELDS = [
  "dosage.routes[].notes",
  "dosage.routes[].bioavailability_notes",
  "dosage.plateau_dosing.notes",
  "dosage.plateau_dosing.*.effects",
  "tolerance.full_tolerance",
  "tolerance.half_tolerance",
  "tolerance.baseline_tolerance",
  "tolerance.cross_tolerance[]",
];

export const OTHER_ALLOWED_SCOPE_FIELDS = [
  "summary",
  "comparisons[].comparison",
  "pharmacology.summary",
  "pharmacology.pharmacodynamics",
  "pharmacology.pharmacokinetics",
  "pharmacology.bioavailability_notes",
  "pharmacology.route_bioavailability_notes.*",
  "pharmacology.route_half_life_notes.*",
  "duration.routes[].half_life_notes",
  "harm_potential.*.description",
  "harm_potential.toxicity.lethal_dosage.notes",
  "harm_potential.toxicity.organ_toxicity[].findings",
  "history_culture.content",
  "history_culture.sections[].content",
  "history_culture.sections[].subsections[].content",
  "legality.countries.*.notes",
];

const STATUS_RANK = {
  likely_plagiarism: 5,
  needs_review: 4,
  clear: 3,
  no_source_text: 2,
  too_short: 1,
  no_scoped_content: 0,
};

const STATUS_LABELS = {
  likely_plagiarism: "Likely plagiarism",
  needs_review: "Needs review",
  clear: "Clear",
  no_source_text: "No source text",
  too_short: "Too short",
  no_scoped_content: "No scoped content",
};

const BASE = 16_777_619;
const TOKEN_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu;

export function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .toLowerCase();
}

function tokenizeWithOffsets(text) {
  const source = String(text ?? "");
  const tokens = [];
  let match;

  while ((match = TOKEN_RE.exec(source)) !== null) {
    const value = normalizeToken(match[0]);
    if (!value) continue;
    tokens.push({
      value,
      start: match.index,
      end: match.index + match[0].length,
      hash: hashToken(value),
    });
  }

  return tokens;
}

export function extractScopedFields(article) {
  const fields = [];
  const dosageRoutes = Array.isArray(article?.dosage?.routes) ? article.dosage.routes : [];

  dosageRoutes.forEach((route, routeIndex) => {
    const routeLabel = route?.route ? ` (${route.route})` : "";
    pushTextField(fields, {
      section: "dose_table_notes",
      fieldPath: `dosage.routes[${routeIndex}].notes`,
      label: `Dose notes${routeLabel}`,
      value: route?.notes,
    });
    pushTextField(fields, {
      section: "dose_table_notes",
      fieldPath: `dosage.routes[${routeIndex}].bioavailability_notes`,
      label: `Bioavailability notes${routeLabel}`,
      value: route?.bioavailability_notes,
    });
  });

  const plateau = article?.dosage?.plateau_dosing;
  if (plateau && typeof plateau === "object") {
    pushTextField(fields, {
      section: "dose_table_notes",
      fieldPath: "dosage.plateau_dosing.notes",
      label: "Plateau dosing notes",
      value: plateau.notes,
    });

    for (const key of ["first_plateau", "second_plateau", "third_plateau", "fourth_plateau", "fifth_plateau"]) {
      pushTextField(fields, {
        section: "dose_table_notes",
        fieldPath: `dosage.plateau_dosing.${key}.effects`,
        label: `${key.replace(/_/g, " ")} effects note`,
        value: plateau[key]?.effects,
      });
    }
  }

  for (const key of ["full_tolerance", "half_tolerance", "baseline_tolerance"]) {
    pushTextField(fields, {
      section: "tolerance",
      fieldPath: `tolerance.${key}`,
      label: key.replace(/_/g, " "),
      value: article?.tolerance?.[key],
    });
  }

  const crossTolerance = Array.isArray(article?.tolerance?.cross_tolerance) ? article.tolerance.cross_tolerance : [];
  crossTolerance.forEach((value, index) => {
    pushTextField(fields, {
      section: "tolerance",
      fieldPath: `tolerance.cross_tolerance[${index}]`,
      label: `cross tolerance ${index + 1}`,
      value,
    });
  });

  return fields;
}

export function extractOtherAllowedFields(article) {
  const fields = [];
  walkOtherAllowedFields(article, [], fields);
  return fields;
}

function buildSourceIndex(source) {
  const tokens = tokenizeWithOffsets(source.text);
  const tokenHashes = tokens.map((token) => token.hash);
  const prefix = buildPrefix(tokenHashes);
  const pow = buildPowers(tokens.length);
  const ngramCache = new Map();

  return {
    ...source,
    tokens,
    prefix,
    pow,
    getNgramPositions(size) {
      if (ngramCache.has(size)) return ngramCache.get(size);
      const positions = new Map();
      if (size <= 0 || size > tokens.length) {
        ngramCache.set(size, positions);
        return positions;
      }

      for (let index = 0; index <= tokens.length - size; index++) {
        const hash = segmentHash(prefix, pow, index, index + size);
        const existing = positions.get(hash);
        if (existing) {
          existing.push(index);
        } else {
          positions.set(hash, [index]);
        }
      }

      ngramCache.set(size, positions);
      return positions;
    },
  };
}

export function compareFieldToSources(field, sources, thresholds = DEFAULT_AUDIT_THRESHOLDS) {
  const sourceIndexes = sources.map((source) => (Array.isArray(source.tokens) ? source : buildSourceIndex(source)));
  const fieldTokens = tokenizeWithOffsets(field.value);
  const fieldIndex = {
    text: field.value,
    tokens: fieldTokens,
    prefix: buildPrefix(fieldTokens.map((token) => token.hash)),
  };

  if (fieldTokens.length < thresholds.minComparableWords) {
    return createFieldResult(field, {
      status: "too_short",
      fieldWordCount: fieldTokens.length,
      sourceCount: sourceIndexes.length,
      prioritySourcesAvailable: availablePrioritySources(sourceIndexes),
    });
  }

  if (sourceIndexes.length === 0) {
    return createFieldResult(field, {
      status: "no_source_text",
      fieldWordCount: fieldTokens.length,
      sourceCount: 0,
      prioritySourcesAvailable: [],
    });
  }

  let bestMatch = null;
  for (const sourceIndex of sourceIndexes) {
    const match = findLongestExactMatch(fieldIndex, sourceIndex, thresholds);
    if (!match) continue;
    if (!bestMatch || compareMatches(match, bestMatch) > 0) {
      bestMatch = match;
    }
  }

  if (!bestMatch) {
    return createFieldResult(field, {
      status: "clear",
      fieldWordCount: fieldTokens.length,
      sourceCount: sourceIndexes.length,
      prioritySourcesAvailable: availablePrioritySources(sourceIndexes),
      bestMatch: null,
    });
  }

  const exactCoverage = bestMatch.wordCount / fieldTokens.length;
  const prioritySource = PRIORITY_SOURCE_IDS.has(bestMatch.sourceId);
  let status = "clear";

  if (
    bestMatch.wordCount >= thresholds.veryLongExactWords ||
    (bestMatch.wordCount >= thresholds.likelyWords && exactCoverage >= thresholds.likelyCoverage)
  ) {
    status = "likely_plagiarism";
  } else if (
    bestMatch.wordCount >= thresholds.likelyWords ||
    (bestMatch.wordCount >= thresholds.needsReviewWords && exactCoverage >= thresholds.needsReviewCoverage) ||
    (prioritySource && bestMatch.wordCount >= thresholds.needsReviewWords)
  ) {
    status = "needs_review";
  }

  const { sourceText: _sourceText, sourceTokens: _sourceTokens, ...serializableMatch } = bestMatch;

  return createFieldResult(field, {
    status,
    fieldWordCount: fieldTokens.length,
    sourceCount: sourceIndexes.length,
    prioritySourcesAvailable: availablePrioritySources(sourceIndexes),
    bestMatch: {
      ...serializableMatch,
      exactCoverage,
      prioritySource,
      matchedPhrase: excerptFromTokenRange(field.value, fieldTokens, bestMatch.fieldStart, bestMatch.fieldEnd, 0, thresholds),
      sourceExcerpt: excerptFromTokenRange(
        bestMatch.sourceText,
        bestMatch.sourceTokens,
        bestMatch.sourceStart,
        bestMatch.sourceEnd,
        0,
        thresholds,
      ),
    },
  });
}

export function auditArticle(article, sources, thresholds = DEFAULT_AUDIT_THRESHOLDS, options = {}) {
  const fields = extractFieldsForScope(article, options.scope);
  const sourceIndexes = sources
    .filter((source) => typeof source.text === "string" && source.text.trim())
    .map((source) => buildSourceIndex(source));

  const fieldResults = fields.map((field) => compareFieldToSources(field, sourceIndexes, thresholds));
  const status = getArticleStatus(fieldResults);
  const strongestMatch = fieldResults
    .filter((result) => result.bestMatch)
    .sort((a, b) => compareMatches(b.bestMatch, a.bestMatch))[0]?.bestMatch ?? null;

  return {
    slug: article.slug ?? slugify(article.title),
    title: article.title ?? article.slug ?? "Untitled",
    status,
    hasPlagiarismConcern: status === "likely_plagiarism" || status === "needs_review",
    scopedFieldCount: fields.length,
    comparableFieldCount: fieldResults.filter((result) => result.fieldWordCount >= thresholds.minComparableWords).length,
    sourceCount: sourceIndexes.length,
    prioritySourcesAvailable: availablePrioritySources(sourceIndexes),
    strongestMatch,
    fieldResults,
  };
}

function extractFieldsForScope(article, scope = "dose_table_tolerance") {
  if (scope === "other_sections") {
    return extractOtherAllowedFields(article);
  }
  return extractScopedFields(article);
}

export function summarizeAuditResults(results) {
  const statusCounts = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, 0]));
  let scopedFieldCount = 0;
  let comparableFieldCount = 0;
  let likelyFieldCount = 0;
  let reviewFieldCount = 0;

  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    scopedFieldCount += result.scopedFieldCount;
    comparableFieldCount += result.comparableFieldCount;
    likelyFieldCount += result.fieldResults.filter((field) => field.status === "likely_plagiarism").length;
    reviewFieldCount += result.fieldResults.filter((field) => field.status === "needs_review").length;
  }

  return {
    articleCount: results.length,
    statusCounts,
    scopedFieldCount,
    comparableFieldCount,
    likelyFieldCount,
    reviewFieldCount,
    concernArticleCount: results.filter((result) => result.hasPlagiarismConcern).length,
  };
}

export function sortAuditResults(results) {
  return [...results].sort((a, b) => {
    const statusDiff = (STATUS_RANK[b.status] ?? -1) - (STATUS_RANK[a.status] ?? -1);
    if (statusDiff !== 0) return statusDiff;
    return a.title.localeCompare(b.title);
  });
}

function pushTextField(fields, field) {
  const value = typeof field.value === "string" ? field.value.trim() : "";
  if (!value) return;
  fields.push({ ...field, value });
}

function walkOtherAllowedFields(value, pathParts, fields) {
  if (typeof value === "string") {
    if (shouldIncludeOtherAllowedField(pathParts, value)) {
      const fieldPath = formatFieldPath(pathParts);
      pushTextField(fields, {
        section: String(pathParts[0] ?? "article"),
        fieldPath,
        label: fieldPath,
        value,
      });
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkOtherAllowedFields(entry, [...pathParts, index], fields));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    walkOtherAllowedFields(nestedValue, [...pathParts, key], fields);
  }
}

function shouldIncludeOtherAllowedField(pathParts, value) {
  if (!String(value ?? "").trim()) return false;
  const topLevel = String(pathParts[0] ?? "");
  if (EXCLUDED_OTHER_TOP_LEVEL_FIELDS.has(topLevel)) return false;
  if (pathParts.some((part) => EXCLUDED_OTHER_PATH_SEGMENTS.has(String(part)))) return false;

  const last = String(pathParts[pathParts.length - 1] ?? "");
  if (OTHER_PROSE_LAST_SEGMENTS.has(last)) return true;
  return pathParts.some((part) => OTHER_PROSE_CONTAINER_SEGMENTS.has(String(part)));
}

const EXCLUDED_OTHER_TOP_LEVEL_FIELDS = new Set([
  "id",
  "title",
  "slug",
  "priority",
  "index_categories",
  "identification",
  "classification",
  "dosage",
  "tolerance",
  "subjective_effects",
  "interactions",
  "reagent_testing",
  "references",
  "source_citations",
  "citations",
  "editorial_review",
]);

const EXCLUDED_OTHER_PATH_SEGMENTS = new Set([
  "reference_ids",
  "date_range",
  "heading",
  "route",
  "unit",
  "status",
  "level",
  "evidence",
  "source",
  "url",
  "drug",
  "receptor",
  "tag",
  "affinity",
  "efficacy",
  "metabolites",
  "protein_binding",
  "volume_of_distribution",
  "half_life",
]);

const OTHER_PROSE_LAST_SEGMENTS = new Set([
  "summary",
  "content",
  "description",
  "notes",
  "comparison",
  "findings",
  "pharmacodynamics",
  "pharmacokinetics",
  "bioavailability_notes",
  "half_life_notes",
]);

const OTHER_PROSE_CONTAINER_SEGMENTS = new Set([
  "route_bioavailability_notes",
  "route_half_life_notes",
]);

function formatFieldPath(pathParts) {
  return pathParts.reduce((fieldPath, part, index) => {
    if (typeof part === "number") return `${fieldPath}[${part}]`;
    if (/^[A-Za-z_$][\w$]*$/.test(part)) return index === 0 ? part : `${fieldPath}.${part}`;
    return `${fieldPath}[${JSON.stringify(part)}]`;
  }, "");
}

function hashToken(token) {
  let hash = 2_166_136_261;
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function buildPrefix(hashes) {
  const prefix = new Uint32Array(hashes.length + 1);
  for (let index = 0; index < hashes.length; index++) {
    prefix[index + 1] = (Math.imul(prefix[index], BASE) + hashes[index]) >>> 0;
  }
  return prefix;
}

function buildPowers(length) {
  const pow = new Uint32Array(length + 1);
  pow[0] = 1;
  for (let index = 0; index < length; index++) {
    pow[index + 1] = Math.imul(pow[index], BASE) >>> 0;
  }
  return pow;
}

function segmentHash(prefix, pow, start, end) {
  return (prefix[end] - Math.imul(prefix[start], pow[end - start])) >>> 0;
}

function findLongestExactMatch(fieldIndex, sourceIndex, thresholds) {
  const maxSize = Math.min(fieldIndex.tokens.length, sourceIndex.tokens.length, thresholds.maxExactWords);
  if (maxSize < thresholds.minComparableWords) return null;

  let low = thresholds.minComparableWords;
  let high = maxSize;
  let best = null;

  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const match = findExactMatchOfSize(fieldIndex, sourceIndex, size);
    if (match) {
      best = match;
      low = size + 1;
    } else {
      high = size - 1;
    }
  }

  return best ? extendMatch(best, fieldIndex, sourceIndex) : null;
}

function findExactMatchOfSize(fieldIndex, sourceIndex, size) {
  const sourcePositions = sourceIndex.getNgramPositions(size);
  if (sourcePositions.size === 0) return null;

  for (let fieldStart = 0; fieldStart <= fieldIndex.tokens.length - size; fieldStart++) {
    const hash = segmentHash(fieldIndex.prefix, sourceIndex.pow, fieldStart, fieldStart + size);
    const positions = sourcePositions.get(hash);
    if (!positions) continue;

    for (const sourceStart of positions) {
      if (tokenRangesEqual(fieldIndex.tokens, fieldStart, sourceIndex.tokens, sourceStart, size)) {
        return {
          sourceId: sourceIndex.sourceId,
          sourceDisplayName: sourceIndex.displayName ?? sourceIndex.sourceId,
          sourceOrigin: sourceIndex.origin,
          sourceText: sourceIndex.text,
          sourceTokens: sourceIndex.tokens,
          fieldStart,
          fieldEnd: fieldStart + size,
          sourceStart,
          sourceEnd: sourceStart + size,
          wordCount: size,
        };
      }
    }
  }

  return null;
}

function tokenRangesEqual(left, leftStart, right, rightStart, size) {
  for (let offset = 0; offset < size; offset++) {
    if (left[leftStart + offset].value !== right[rightStart + offset].value) return false;
  }
  return true;
}

function extendMatch(match, fieldIndex, sourceIndex) {
  let fieldStart = match.fieldStart;
  let sourceStart = match.sourceStart;
  let fieldEnd = match.fieldEnd;
  let sourceEnd = match.sourceEnd;

  while (
    fieldStart > 0 &&
    sourceStart > 0 &&
    fieldIndex.tokens[fieldStart - 1].value === sourceIndex.tokens[sourceStart - 1].value
  ) {
    fieldStart--;
    sourceStart--;
  }

  while (
    fieldEnd < fieldIndex.tokens.length &&
    sourceEnd < sourceIndex.tokens.length &&
    fieldIndex.tokens[fieldEnd].value === sourceIndex.tokens[sourceEnd].value
  ) {
    fieldEnd++;
    sourceEnd++;
  }

  return {
    ...match,
    fieldStart,
    sourceStart,
    fieldEnd,
    sourceEnd,
    wordCount: fieldEnd - fieldStart,
  };
}

function compareMatches(left, right) {
  const leftPriority = PRIORITY_SOURCE_IDS.has(left.sourceId) ? 1 : 0;
  const rightPriority = PRIORITY_SOURCE_IDS.has(right.sourceId) ? 1 : 0;
  if (left.wordCount !== right.wordCount) return left.wordCount - right.wordCount;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return String(left.sourceId).localeCompare(String(right.sourceId));
}

function excerptFromTokenRange(text, tokens, start, end, paddingWords, thresholds) {
  if (!tokens.length || start >= end) return "";
  const paddedStart = Math.max(0, start - paddingWords);
  const paddedEnd = Math.min(tokens.length, end + paddingWords);
  const raw = text.slice(tokens[paddedStart].start, tokens[paddedEnd - 1].end).replace(/\s+/g, " ").trim();
  return truncateWords(raw, thresholds.excerptWords);
}

function truncateWords(text, limit) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return words.join(" ");
  return `${words.slice(0, limit).join(" ")} ...`;
}

function createFieldResult(field, values) {
  return {
    section: field.section,
    fieldPath: field.fieldPath,
    label: field.label,
    status: values.status,
    fieldWordCount: values.fieldWordCount,
    sourceCount: values.sourceCount,
    prioritySourcesAvailable: values.prioritySourcesAvailable,
    bestMatch: values.bestMatch ?? null,
  };
}

function availablePrioritySources(sourceIndexes) {
  return [...new Set(sourceIndexes.map((source) => source.sourceId).filter((sourceId) => PRIORITY_SOURCE_IDS.has(sourceId)))];
}

function getArticleStatus(fieldResults) {
  if (fieldResults.length === 0) return "no_scoped_content";
  return fieldResults.reduce((best, result) => {
    return (STATUS_RANK[result.status] ?? -1) > (STATUS_RANK[best] ?? -1) ? result.status : best;
  }, "no_scoped_content");
}
