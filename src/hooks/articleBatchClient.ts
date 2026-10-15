import { z } from "zod";
import type { SaveArticlePayload, SaveArticleResult } from "./useApiMutations";

const articleIdentity = z.object({ id: z.number().nullable(), title: z.string(), slug: z.string().min(1) }).passthrough();
const pendingPublicationSchema = z.object({
  operationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{7,159}$/),
  articles: z.array(articleIdentity).optional(),
  articleAdmissions: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("create"), slug: z.string().min(1) }),
    z.object({ kind: z.literal("replace-existing"), slug: z.string().min(1), baseHash: z.string().min(1) }),
  ])).optional(),
  indexLayouts: z.array(z.object({ type: z.enum(["psychoactive", "chemical", "mechanism"]), version: z.number(), categories: z.array(z.unknown()), expected: z.unknown(), expectedRevision: z.number().int().nonnegative() })).optional(),
  changelog: z.object({ markdown: z.string(), articles: z.array(z.object({ id: z.number(), title: z.string(), slug: z.string() })) }).optional(),
}).strict();

export function parsePendingArticleBatch(input: unknown, operationId: string): SaveArticlePayload & { operationId: string } {
  const parsed = pendingPublicationSchema.safeParse(input);
  if (!parsed.success || parsed.data.operationId !== operationId ||
      (parsed.data.articles?.length ?? 0) !== (parsed.data.articleAdmissions?.length ?? 0)) throw new ArticleSaveUnconfirmedError();
  return input as SaveArticlePayload & { operationId: string };
}

const batchSuccessSchema = z.object({
  success: z.literal(true), version: z.literal(1), operationId: z.string().min(8),
  requestId: z.string().min(1), savedItems: z.array(z.string()), warnings: z.array(z.string()),
  submittedBy: z.string(), revalidatedPaths: z.array(z.string()),
  layoutReceipts: z.array(z.object({ operationId: z.string().min(8), type: z.enum(["psychoactive", "chemical", "mechanism"]), receipt: z.object({ updated: z.boolean(), revision: z.number().int().nonnegative(), replayed: z.boolean(), unchanged: z.boolean(), id: z.string().optional() }) })),
  articleReceipts: z.array(z.object({ slug: z.string().min(1), baseHash: z.string().min(1), unchanged: z.boolean(), changeId: z.string().min(8), revisionId: z.string().nullable() })),
  articleResult: z.object({ created: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), errors: z.array(z.string()) }),
  verification: z.array(z.object({ target: z.string(), found: z.boolean(), previousSlug: z.string().nullable(), requestedSlug: z.string().nullable(), storedSlug: z.string().nullable(), storedTitle: z.string().nullable(), titleMatches: z.boolean(), slugMatches: z.boolean() })),
  entry: z.object({ id: z.string().min(1), createdAt: z.string().min(1), commit: z.object({ sha: z.string(), url: z.string(), message: z.string() }), articles: z.array(z.object({ id: z.number(), title: z.string(), slug: z.string() })), markdown: z.string(), submittedBy: z.string().nullable() }).optional(),
});

export class ArticleSaveUnconfirmedError extends Error {
  constructor() { super("The save is unconfirmed. Retry publishing to confirm the original batch. Newer edits remain staged."); }
}

export function parseArticleBatchSuccess(input: unknown, payload: SaveArticlePayload & { operationId: string }): SaveArticleResult {
  const parsed = batchSuccessSchema.safeParse(input);
  if (!parsed.success || parsed.data.operationId !== payload.operationId) throw new ArticleSaveUnconfirmedError();
  const result = parsed.data;
  const expectedArticles = payload.articleAdmissions?.map(article => article.slug) ?? [];
  const expectedLayouts = payload.indexLayouts?.map(layout => layout.type) ?? [];
  const exactTargets = (expected: string[], actual: string[]) => expected.length === actual.length && new Set(actual).size === actual.length && expected.every(value => actual.includes(value));
  const counts = result.articleResult;
  if (!exactTargets(expectedArticles, result.articleReceipts.map(article => article.slug)) ||
      !exactTargets(expectedLayouts, result.layoutReceipts.map(layout => layout.type)) ||
      !exactTargets(expectedArticles, result.verification.map(article => article.storedSlug ?? "")) ||
      result.verification.some(article => !article.found || !article.slugMatches || !article.titleMatches) ||
      counts.created + counts.updated + counts.skipped !== expectedArticles.length || counts.errors.length > 0 ||
      result.articleReceipts.filter(article => article.unchanged).length !== counts.skipped) throw new ArticleSaveUnconfirmedError();
  return result;
}
