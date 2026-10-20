export type CitationToken = {
  id: string;
  index: number;
  raw: string;
};

export const CITE_TOKEN_PATTERN: RegExp;
export function extractCitationTokens(text: unknown): CitationToken[];
