export const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

/**
 * Sentinel the citation campaign writes in place of a stripped `[cite:x]`
 * marker. It is not a reference: it never participates in numbering and
 * renders as a compact caution marker (see `CitationNeededMarker` in
 * `CitedText`, which also suppresses redundant flags).
 */
export const CITATION_NEEDED_TOKEN = "[citation-needed]";

/**
 * Matches both marker kinds in one pass: capture group 1 is the reference id
 * for `[cite:<id>]`, and is `undefined` for a `[citation-needed]` token.
 */
export const CITATION_MARKER_PATTERN =
  /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]|\[citation-needed\]/g;

export type CitationToken = {
  id: string;
  index: number;
  raw: string;
};

export function extractCitationTokens(text: unknown): CitationToken[] {
  if (typeof text !== "string" || !text.includes("[cite:")) return [];

  return Array.from(text.matchAll(CITE_TOKEN_PATTERN), (match) => ({
    id: match[1],
    index: match.index ?? 0,
    raw: match[0],
  }));
}

export function stripCitationTokens(text: string): string {
  return text.replace(CITATION_MARKER_PATTERN, "").replace(/\s+/g, " ").trim();
}

/**
 * Every marker in one field's raw text, in the order it appears, with the
 * offsets a write needs to replace or remove exactly one of them.
 *
 * `ordinal` counts within the marker's own kind, because that is how a render
 * site can address a marker it drew: the prose renderer collapses and
 * suppresses flags, so the nth flag on screen is not the nth marker overall.
 */
export type CitationMarkerSpan = {
  kind: "cite" | "needed";
  /** Reference id for a `[cite:<id>]` marker, `null` for a flag. */
  id: string | null;
  ordinal: number;
  start: number;
  end: number;
};

export function parseCitationMarkers(text: unknown): CitationMarkerSpan[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const spans: CitationMarkerSpan[] = [];
  let cites = 0;
  let flags = 0;
  for (const match of text.matchAll(CITATION_MARKER_PATTERN)) {
    const start = match.index ?? 0;
    const isCite = match[1] !== undefined;
    spans.push({
      kind: isCite ? "cite" : "needed",
      id: isCite ? match[1] : null,
      ordinal: isCite ? cites++ : flags++,
      start,
      end: start + match[0].length,
    });
  }
  return spans;
}

/**
 * True when any text field in the substance record carries the
 * `[citation-needed]` sentinel — i.e. the citation audit has stripped at least
 * one refuted marker on this article. Serializing the whole record is the
 * honest check: the sentinel can sit in any prose field (summary, subsections,
 * legality notes, dose-range strings), and this runs server-side at ISR time,
 * not per request. The token's bracketed spelling cannot occur in JSON
 * structure, only inside a string value.
 */
export function substanceHasCitationNeeded(substance: unknown): boolean {
  try {
    return JSON.stringify(substance)?.includes(CITATION_NEEDED_TOKEN) ?? false;
  } catch {
    // Circular structure — impossible for Postgres data; fail toward the
    // stored banner rather than crashing the route.
    return false;
  }
}
