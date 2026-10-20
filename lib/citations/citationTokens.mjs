export const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

export function extractCitationTokens(text) {
  if (typeof text !== "string" || !text.includes("[cite:")) return [];
  return Array.from(text.matchAll(CITE_TOKEN_PATTERN), (match) => ({
    id: match[1],
    index: match.index ?? 0,
    raw: match[0],
  }));
}
