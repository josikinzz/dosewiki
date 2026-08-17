export const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

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
  return text.replace(CITE_TOKEN_PATTERN, "").replace(/\s+/g, " ").trim();
}
