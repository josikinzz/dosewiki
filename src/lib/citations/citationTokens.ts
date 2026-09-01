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
    // Circular structure — impossible for Convex data; fail toward the
    // stored banner rather than crashing the route.
    return false;
  }
}
