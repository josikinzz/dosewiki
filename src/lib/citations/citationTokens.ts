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
