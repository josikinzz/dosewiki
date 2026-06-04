export const CITABLE_ARTICLE_SECTIONS = Object.freeze([
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
]);

export const EXCLUDED_CITATION_SECTIONS = Object.freeze([
  "dosage",
  "duration",
  "subjective_effects",
  "comparisons",
  "reagent_testing",
  "interactions",
  "identification",
  "classification",
]);

export const CITE_MARKER_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

const MARKER_LIKE_PATTERN = /\[cite:[^\]\s]*(?:\]|$)/g;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

function clone(value) {
  return structuredClone(value);
}

function diagnostic(code, message, extra = {}) {
  return { code, message, severity: "error", ...extra };
}

function pathWithChild(path, child) {
  if (typeof child === "number") return `${path}[${child}]`;
  return path ? `${path}.${child}` : child;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObjectRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function markerIdentity(marker) {
  return `${marker.path}\u0000${marker.index}\u0000${marker.marker}`;
}

function markerIdentityCounts(markers) {
  const counts = new Map();
  for (const marker of markers) {
    const identity = markerIdentity(marker);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

function consumeMarkerIdentity(counts, marker) {
  const identity = markerIdentity(marker);
  const count = counts.get(identity) ?? 0;
  if (count <= 0) return false;
  if (count === 1) {
    counts.delete(identity);
  } else {
    counts.set(identity, count - 1);
  }
  return true;
}

function referenceIdsFrom(references) {
  return new Set(
    (references ?? [])
      .map((reference) => (typeof reference === "string" ? reference : reference?.id))
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim()),
  );
}

function isCitableSection(sectionKey) {
  return CITABLE_ARTICLE_SECTIONS.includes(sectionKey);
}

function isExcludedSection(sectionKey) {
  return EXCLUDED_CITATION_SECTIONS.includes(sectionKey);
}

export function assertCitableSectionKey(sectionKey) {
  if (!isCitableSection(sectionKey)) {
    throw new Error(`${sectionKey} is not in the citable article surface.`);
  }
}

export function collectCitationMarkersFromText(value, path = "") {
  if (typeof value !== "string" || !value.includes("[cite:")) return [];
  return Array.from(value.matchAll(CITE_MARKER_PATTERN), (match) => ({
    marker: match[0],
    referenceId: match[1],
    index: match.index ?? 0,
    path,
  }));
}

export function collectCitationMarkersFromValue(value, path = "") {
  if (typeof value === "string") return collectCitationMarkersFromText(value, path);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => (
      collectCitationMarkersFromValue(entry, pathWithChild(path, index))
    ));
  }
  if (isObjectRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => (
      collectCitationMarkersFromValue(entry, pathWithChild(path, key))
    ));
  }
  return [];
}

export function stripCitationMarkersFromText(value) {
  return String(value ?? "").replace(CITE_MARKER_PATTERN, "");
}

export function stripCitationMarkersFromValue(value) {
  if (typeof value === "string") return stripCitationMarkersFromText(value);
  if (Array.isArray(value)) return value.map((entry) => stripCitationMarkersFromValue(entry));
  if (isObjectRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stripCitationMarkersFromValue(entry)]),
    );
  }
  return value;
}

function findMalformedMarkers(value, path = "") {
  if (typeof value === "string") {
    const validMarkers = new Set(collectCitationMarkersFromText(value, path).map((marker) => marker.marker));
    return (value.match(MARKER_LIKE_PATTERN) ?? [])
      .filter((marker) => !validMarkers.has(marker))
      .map((marker) => ({ marker, path }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findMalformedMarkers(entry, pathWithChild(path, index)));
  }
  if (isObjectRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => (
      findMalformedMarkers(entry, pathWithChild(path, key))
    ));
  }
  return [];
}

function findMidWordMarkers(value, path = "") {
  if (typeof value === "string") {
    return collectCitationMarkersFromText(value, path).filter((marker) => {
      const previous = value[marker.index - 1] ?? "";
      const next = value[marker.index + marker.marker.length] ?? "";
      return WORD_CHARACTER_PATTERN.test(previous) && WORD_CHARACTER_PATTERN.test(next);
    });
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findMidWordMarkers(entry, pathWithChild(path, index)));
  }
  if (isObjectRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => (
      findMidWordMarkers(entry, pathWithChild(path, key))
    ));
  }
  return [];
}

function firstDifferenceMessage(expected, actual) {
  const left = stableStringify(expected);
  const right = stableStringify(actual);
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index] !== right[index]) {
      return `Text differs at serialized index ${index}: expected ${JSON.stringify(left.slice(index, index + 80))}, got ${JSON.stringify(right.slice(index, index + 80))}.`;
    }
  }
  return "Candidate changed content outside citation markers.";
}

function validateMarkerValue({
  sectionKey,
  originalValue,
  candidateValue,
  references,
  rootPath = sectionKey,
  enforceSectionSurface = true,
}) {
  const diagnostics = [];
  const knownReferenceIds = referenceIdsFrom(references);
  const markers = collectCitationMarkersFromValue(candidateValue, rootPath);

  if (enforceSectionSurface && !isCitableSection(sectionKey)) {
    diagnostics.push(diagnostic(
      "section_not_citable",
      `${sectionKey} is not in the citable article surface.`,
      { sectionKey },
    ));
  }

  for (const markerLike of findMalformedMarkers(candidateValue, rootPath)) {
    diagnostics.push(diagnostic(
      "malformed_marker",
      `Malformed citation marker: ${markerLike.marker}`,
      { path: markerLike.path, sectionKey },
    ));
  }

  for (const marker of markers) {
    if (!knownReferenceIds.has(marker.referenceId)) {
      diagnostics.push(diagnostic(
        "unknown_reference",
        `${marker.marker} points to an unknown reference.`,
        { path: marker.path, sectionKey, referenceId: marker.referenceId },
      ));
    }
  }

  for (const marker of findMidWordMarkers(candidateValue, rootPath)) {
    diagnostics.push(diagnostic(
      "mid_word_marker",
      `${marker.marker} is inserted inside a word.`,
      { path: marker.path, sectionKey, referenceId: marker.referenceId },
    ));
  }

  const strippedOriginalValue = stripCitationMarkersFromValue(originalValue);
  const strippedValue = stripCitationMarkersFromValue(candidateValue);
  if (stableStringify(strippedValue) !== stableStringify(strippedOriginalValue)) {
    diagnostics.push(diagnostic(
      "text_changed",
      firstDifferenceMessage(strippedOriginalValue, strippedValue),
      { sectionKey },
    ));
  }

  return {
    ok: diagnostics.length === 0,
    sectionKey,
    markerCount: markers.length,
    markers,
    strippedValue,
    diagnostics,
  };
}

export function validateSectionMarkerCandidate({
  sectionKey,
  originalSection,
  candidateSection,
  references,
}) {
  return validateMarkerValue({
    sectionKey,
    originalValue: originalSection,
    candidateValue: candidateSection,
    references,
    rootPath: sectionKey,
    enforceSectionSurface: true,
  });
}

export function validateArticleMarkerCandidate({
  originalArticle,
  candidateArticle,
  references,
}) {
  const diagnostics = [];
  const markers = [];

  for (const sectionKey of CITABLE_ARTICLE_SECTIONS) {
    const validation = validateMarkerValue({
      sectionKey,
      originalValue: originalArticle?.[sectionKey],
      candidateValue: candidateArticle?.[sectionKey],
      references,
      rootPath: sectionKey,
      enforceSectionSurface: true,
    });
    diagnostics.push(...validation.diagnostics);
    markers.push(...validation.markers);
  }

  for (const sectionKey of EXCLUDED_CITATION_SECTIONS) {
    const originalMarkers = collectCitationMarkersFromValue(originalArticle?.[sectionKey], sectionKey);
    const originalMarkerCounts = markerIdentityCounts(originalMarkers);
    const excludedMarkers = collectCitationMarkersFromValue(candidateArticle?.[sectionKey], sectionKey);
    for (const marker of excludedMarkers) {
      if (consumeMarkerIdentity(originalMarkerCounts, marker)) continue;
      diagnostics.push(diagnostic(
        "marker_outside_citable_surface",
        `${marker.marker} appears in excluded citation surface ${sectionKey}.`,
        { path: marker.path, sectionKey, referenceId: marker.referenceId },
      ));
    }
    markers.push(...excludedMarkers);

    const originalValue = originalArticle?.[sectionKey];
    const originalStripped = stripCitationMarkersFromValue(originalValue);
    const candidateStripped = stripCitationMarkersFromValue(candidateArticle?.[sectionKey]);
    if (stableStringify(candidateStripped) !== stableStringify(originalStripped)) {
      diagnostics.push(diagnostic(
        "excluded_text_changed",
        `${sectionKey} changed during marker-only citation workflow.`,
        { sectionKey },
      ));
    }
  }

  return {
    ok: diagnostics.length === 0,
    markerCount: markers.length,
    markers,
    strippedArticle: stripCitationMarkersFromValue(candidateArticle),
    diagnostics,
  };
}

export function buildSectionCitationPacket({ article, sectionKey }) {
  assertCitableSectionKey(sectionKey);
  return {
    kind: "section_citation_packet",
    sectionKey,
    article: {
      slug: article?.slug ?? null,
      title: article?.title ?? null,
    },
    section: clone(article?.[sectionKey]),
  };
}

export function buildArticleWideCitationPacket({
  article,
  acceptedSections = {},
  failedSectionKeys = [],
  failedArtifacts = [],
}) {
  const sections = {};
  for (const sectionKey of CITABLE_ARTICLE_SECTIONS) {
    sections[sectionKey] = clone(
      Object.hasOwn(acceptedSections, sectionKey)
        ? acceptedSections[sectionKey]
        : article?.[sectionKey],
    );
  }

  return {
    kind: "citable_article_packet",
    article: {
      slug: article?.slug ?? null,
      title: article?.title ?? null,
    },
    sections,
    failedSectionKeys: [...failedSectionKeys],
    failedArtifactCount: failedArtifacts.length,
  };
}

export function mergeValidatedMarkedSectionsIntoArticle({ article, markedSections }) {
  const nextArticle = clone(article);
  for (const sectionKey of CITABLE_ARTICLE_SECTIONS) {
    if (Object.hasOwn(markedSections ?? {}, sectionKey)) {
      nextArticle[sectionKey] = clone(markedSections[sectionKey]);
    }
  }
  return nextArticle;
}

export function isCitableArticleSection(sectionKey) {
  return isCitableSection(sectionKey);
}

export function isExcludedCitationSection(sectionKey) {
  return isExcludedSection(sectionKey);
}
