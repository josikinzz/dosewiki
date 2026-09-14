// Marker-only citation workflow over the citable article surface.
//
// The citable/excluded section lists come from formal-citations-section-config
// (the single owner of the citable article surface) and the citation-only edit
// rule lives in citation-only-validator (ADR-0001). This module composes the
// two into section/article packet building and validation.

import {
  CITABLE_ARTICLE_SURFACE,
  EXCLUDED_CITATION_SURFACE,
  isCitableSection,
} from "./formal-citations-section-config.mjs";
import {
  CITE_MARKER_PATTERN,
  collectCitationMarkersFromValue,
  stripCitationMarkersFromValue,
  strippedValuesEqual,
  validateCitationOnlyEdit,
} from "./citation-only-validator.mjs";

// Stable names for existing importers; the canonical definitions live in the
// modules above.
export const CITABLE_ARTICLE_SECTIONS = CITABLE_ARTICLE_SURFACE;
export const EXCLUDED_CITATION_SECTIONS = EXCLUDED_CITATION_SURFACE;
export {
  CITE_MARKER_PATTERN,
  stripCitationMarkersFromValue,
};

function clone(value) {
  return structuredClone(value);
}

function diagnostic(code, message, extra = {}) {
  return { code, message, severity: "error", ...extra };
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

function assertCitableSectionKey(sectionKey) { if (!isCitableSection(sectionKey)) {
  throw new Error(`${sectionKey} is not in the citable article surface.`);
} }

function validateMarkerValue({
  sectionKey,
  originalValue,
  candidateValue,
  references,
  rootPath = sectionKey,
  enforceSectionSurface = true,
}) {
  const diagnostics = [];

  if (enforceSectionSurface && !isCitableSection(sectionKey)) {
    diagnostics.push(diagnostic(
      "section_not_citable",
      `${sectionKey} is not in the citable article surface.`,
      { sectionKey },
    ));
  }

  const edit = validateCitationOnlyEdit(originalValue, candidateValue, {
    knownReferenceIds: referenceIdsFrom(references),
    path: rootPath,
  });
  diagnostics.push(...edit.diagnostics.map((entry) => ({ ...entry, sectionKey })));

  return {
    ok: diagnostics.length === 0,
    sectionKey,
    markerCount: edit.markerCount,
    markers: edit.markers,
    newMarkers: edit.newMarkers,
    strippedValue: edit.strippedValue,
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

    if (!strippedValuesEqual(originalArticle?.[sectionKey], candidateArticle?.[sectionKey])) {
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





