export type ArticleValidationResult =
  | { success: true; data: unknown[] }
  | { success: false; error: unknown };

export function getPayloadByteLength(rawBody: unknown): number;
export function validateArticlesPayload(
  articlesData: unknown,
): ArticleValidationResult;
