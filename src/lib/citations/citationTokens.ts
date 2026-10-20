import { CITE_TOKEN_PATTERN } from "../../../lib/citations/citationTokens.mjs";

export { CITE_TOKEN_PATTERN, extractCitationTokens, type CitationToken } from "../../../lib/citations/citationTokens.mjs";

export const CITATION_NEEDED_TOKEN = "[citation-needed]";

export const CITATION_MARKER_PATTERN = new RegExp(`${CITE_TOKEN_PATTERN.source}|\\[citation-needed\\]`, "g");

export function stripCitationTokens(text: string): string {
  return text.replace(CITATION_MARKER_PATTERN, "").replace(/\s+/g, " ").trim();
}

export type CitationMarkerSpan = {
  kind: "cite" | "needed";
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

export function substanceHasCitationNeeded(substance: unknown): boolean {
  try {
    return JSON.stringify(substance)?.includes(CITATION_NEEDED_TOKEN) ?? false;
  } catch {
    return false;
  }
}
