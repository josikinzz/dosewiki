// Citation-only edit validator (ADR-0001).
//
// One rule is load-bearing for the marker-only citation workflow: stripping
// `[cite:reference-id]` markers from a marked candidate must restore the
// original text exactly (punctuation, capitalization, whitespace). This module
// owns that rule plus marker syntax validation, so callers never re-implement
// marker grammar, stripping, or text-safety comparison.

export const CITE_MARKER_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

const MARKER_LIKE_PATTERN = /\[cite:[^\]\s]*(?:\]|$)/g;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

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

function diagnostic(code, message, extra = {}) {
  return { code, message, severity: "error", ...extra };
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

function collectAnchoredCitationMarkersFromText(value, path = "") {
  if (typeof value !== "string" || !value.includes("[cite:")) return [];

  let removedLength = 0;
  return Array.from(value.matchAll(CITE_MARKER_PATTERN), (match) => {
    const marker = match[0];
    const index = match.index ?? 0;
    const anchoredMarker = {
      marker,
      referenceId: match[1],
      path,
      anchorIndex: index - removedLength,
    };
    removedLength += marker.length;
    return anchoredMarker;
  });
}

function collectAnchoredCitationMarkersFromValue(value, path = "") {
  if (typeof value === "string") return collectAnchoredCitationMarkersFromText(value, path);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => (
      collectAnchoredCitationMarkersFromValue(entry, pathWithChild(path, index))
    ));
  }
  if (isObjectRecord(value)) {
    return Object.entries(value).flatMap(([key, entry]) => (
      collectAnchoredCitationMarkersFromValue(entry, pathWithChild(path, key))
    ));
  }
  return [];
}

function anchoredMarkerIdentity(marker) {
  return `${marker.path}\u0000${marker.anchorIndex}\u0000${marker.marker}`;
}

function unmatchedAnchoredMarkers(sourceValue, comparisonValue, path = "") {
  const comparisonCounts = new Map();
  for (const marker of collectAnchoredCitationMarkersFromValue(comparisonValue, path)) {
    const identity = anchoredMarkerIdentity(marker);
    comparisonCounts.set(identity, (comparisonCounts.get(identity) ?? 0) + 1);
  }

  return collectAnchoredCitationMarkersFromValue(sourceValue, path).filter((marker) => {
    const identity = anchoredMarkerIdentity(marker);
    const count = comparisonCounts.get(identity) ?? 0;
    if (count <= 0) return true;
    if (count === 1) comparisonCounts.delete(identity);
    else comparisonCounts.set(identity, count - 1);
    return false;
  });
}

function findRemovedOrMovedMarkers(originalValue, markedValue, path = "") {
  return unmatchedAnchoredMarkers(originalValue, markedValue, path);
}

function findNewMarkers(originalValue, markedValue, path = "") {
  return unmatchedAnchoredMarkers(markedValue, originalValue, path);
}

export function stripCitationMarkers(value) {
  return String(value ?? "").replace(CITE_MARKER_PATTERN, "");
}


export function stripCitationMarkersFromValue(value) {
  if (typeof value === "string") return stripCitationMarkers(value);
  if (Array.isArray(value)) return value.map((entry) => stripCitationMarkersFromValue(entry));
  if (isObjectRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stripCitationMarkersFromValue(entry)]),
    );
  }
  return value;
}

function findMalformedMarkers(value, path = "") { if (typeof value === "string") {
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
return []; }

// A contiguous run of markers (optionally separated only by whitespace) that
// repeats the same reference id is never intentional — it is the signature of a
// double-insertion bug. Stripping markers leaves identical text, so the
// text_changed check cannot catch it; this rule can.
function findDuplicateReferenceInCluster(value, path = "") { if (typeof value === "string") {
  const found = [];
  for (const cluster of value.matchAll(/(?:\[cite:[^\]\s]+\]\s*)+/g)) {
    const ids = Array.from(cluster[0].matchAll(CITE_MARKER_PATTERN), (m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) found.push({ referenceId: id, path });
      seen.add(id);
    }
  }
  return found;
}
if (Array.isArray(value)) {
  return value.flatMap((entry, index) => findDuplicateReferenceInCluster(entry, pathWithChild(path, index)));
}
if (isObjectRecord(value)) {
  return Object.entries(value).flatMap(([key, entry]) => (
    findDuplicateReferenceInCluster(entry, pathWithChild(path, key))
  ));
}
return []; }

function findMidWordMarkers(value, path = "") { if (typeof value === "string") {
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
return []; }

// Marker-insensitive equality between two values (strings or nested
// structures). Object key order is ignored; text must otherwise match exactly.
export function strippedValuesEqual(left, right) {
  return stableStringify(stripCitationMarkersFromValue(left))
    === stableStringify(stripCitationMarkersFromValue(right));
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

// Validate that `markedValue` is the original value plus citation markers and
// nothing else. Accepts strings or nested structures (arrays/objects of
// strings). When `knownReferenceIds` is provided, every marker must point at a
// known reference id.
export function validateCitationOnlyEdit(originalValue, markedValue, {
  knownReferenceIds = null,
  path = "",
} = {}) {
  const diagnostics = [];
  const markers = collectCitationMarkersFromValue(markedValue, path);

  for (const markerLike of findMalformedMarkers(markedValue, path)) {
    diagnostics.push(diagnostic(
      "malformed_marker",
      `Malformed citation marker: ${markerLike.marker}`,
      { path: markerLike.path },
    ));
  }

  if (knownReferenceIds) {
    const known = knownReferenceIds instanceof Set ? knownReferenceIds : new Set(knownReferenceIds);
    for (const marker of markers) {
      if (!known.has(marker.referenceId)) {
        diagnostics.push(diagnostic(
          "unknown_reference",
          `${marker.marker} points to an unknown reference.`,
          { path: marker.path, referenceId: marker.referenceId },
        ));
      }
    }
  }

  for (const marker of findMidWordMarkers(markedValue, path)) {
    diagnostics.push(diagnostic(
      "mid_word_marker",
      `${marker.marker} is inserted inside a word.`,
      { path: marker.path, referenceId: marker.referenceId },
    ));
  }

  for (const dup of findDuplicateReferenceInCluster(markedValue, path)) {
    diagnostics.push(diagnostic(
      "duplicate_marker_in_cluster",
      `[cite:${dup.referenceId}] appears more than once in a single marker cluster (double-insertion).`,
      { path: dup.path, referenceId: dup.referenceId },
    ));
  }

  for (const marker of findRemovedOrMovedMarkers(originalValue, markedValue, path)) {
    diagnostics.push(diagnostic(
      "existing_marker_removed_or_moved",
      `${marker.marker} existing marker was removed or moved from its original text anchor.`,
      {
        path: marker.path,
        referenceId: marker.referenceId,
        anchorIndex: marker.anchorIndex,
      },
    ));
  }

  const strippedOriginalValue = stripCitationMarkersFromValue(originalValue);
  const strippedValue = stripCitationMarkersFromValue(markedValue);
  if (stableStringify(strippedValue) !== stableStringify(strippedOriginalValue)) {
    diagnostics.push(diagnostic(
      "text_changed",
      firstDifferenceMessage(strippedOriginalValue, strippedValue),
    ));
  }

  const ok = diagnostics.length === 0;
  return {
    ok,
    accepted: ok,
    markerCount: markers.length,
    markers,
    newMarkers: findNewMarkers(originalValue, markedValue, path),
    strippedValue,
    diagnostics,
  };
}
