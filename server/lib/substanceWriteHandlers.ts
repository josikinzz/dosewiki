import { PostgresError } from "../../lib/postgres/runtime/values"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import {
  applyEditableFieldWrite,
  applyIupacNameWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  isEditableArticleFieldPath,
} from "./articleFieldWrites";
import { ingestSubstanceArticle, ingestSubstanceArticles } from "./substanceIngestion";
import { contentHash } from "../../lib/proposals/contentHash";
import { articleChangePatch, articleConflict, articleDocument, validateArticleChange } from "./articleLifecycleValidation";
import { articleBaseHash, loadArticle, recordArticleRevision } from "./articleRevisionJournal";

/**
 * Every handler here writes a published article directly, so all of them sit
 * on the admin floor: an editor's changes reach production only through an
 * approved change proposal (`changeProposals.approveAndApply`), which calls
 * `saveSubstancesHandler` with the approving admin as the actor.
 */
type EditorArgs = { apiKey?: string; actorEmail?: string };
type SubstanceArticleInput = {
  id: number | null;
  title: string;
  slug?: string;
} & Record<string, unknown>;

export async function saveSubstanceHandler(
  ctx: MutationCtx,
  args: EditorArgs & { article: SubstanceArticleInput },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  const outcome = await ingestSubstanceArticle({ db: ctx.db, article: args.article });
  if (outcome.action === "skipped") {
    throw new Error(outcome.error ?? "Unable to save substance.");
  }
  return {
    updated: outcome.action === "updated",
    id: outcome.dataId,
    outcome,
    affectedPaths: outcome.affectedPaths,
  };
}

export async function saveSubstancesHandler(
  ctx: MutationCtx,
  args: EditorArgs & { articles: SubstanceArticleInput[] },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  return ingestSubstanceArticles({ db: ctx.db, articles: args.articles });
}

export type EditableFieldValue =
  | string
  | { min: number | null; max: number | null; unit: string };

export async function setArticleFieldHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    slug: string;
    path: string;
    value: EditableFieldValue;
    expected: EditableFieldValue;
    baseHash: string;
    changeId: string;
  },
) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  if (!isEditableArticleFieldPath(args.path)) {
    throw new PostgresError({
      code: "FIELD_NOT_EDITABLE",
      message: `Field "${args.path}" is not inline-editable.`,
    });
  }
  if (
    typeof args.value === "string" &&
    args.value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH
  ) {
    throw new PostgresError({
      code: "FIELD_VALUE_INVALID",
      message: `Field value exceeds ${EDITABLE_ARTICLE_FIELD_MAX_LENGTH} characters.`,
    });
  }
  const article = await loadArticle(ctx, args.slug);
  const before = articleDocument(article);
  const prior = await ctx.db.query("articleRevisions").withIndex("by_actor_change", (q) => q.eq("actorEmail", actor.email).eq("changeId", args.changeId)).unique();
  if (prior) {
    const replay = applyEditableFieldWrite(prior.before as Record<string, unknown>, args.path, args.value, { expected: args.expected });
    if (prior.slug !== args.slug || prior.baseHash !== args.baseHash || !replay.ok ||
        contentHash({ ...prior.before, [replay.topLevelKey]: replay.topLevelValue }) !== contentHash(prior.after)) {
      throw new PostgresError({ code: "ARTICLE_CHANGE_REUSED", message: "That change ID already names another edit." });
    }
    return { slug: args.slug, path: args.path, value: args.value, topLevelKey: replay.topLevelKey, topLevelValue: replay.topLevelValue, id: article.id, title: article.title, baseHash: prior.resultHash };
  }
  if (args.baseHash !== await articleBaseHash(ctx, before)) articleConflict();
  if (!args.changeId.trim()) throw new PostgresError({ code: "ARTICLE_CHANGE_ID", message: "A stable change ID is required." });
  const result = applyEditableFieldWrite(
    article as unknown as Record<string, unknown>,
    args.path,
    args.value,
    { expected: args.expected },
  );
  if (result.ok === false) {
    throw new PostgresError({
      code: result.conflict === true ? "FIELD_CONFLICT" : "FIELD_WRITE_REJECTED",
      message: result.reason,
    });
  }
  const after = validateArticleChange(before, { ...before, [result.topLevelKey]: result.topLevelValue });
  await ctx.db.patch(article._id, articleChangePatch(before, after));
  const revision = await recordArticleRevision(ctx, { before, after, actor, changeId: args.changeId, baseHash: args.baseHash, summary: `Inline edit — ${args.path}` });
  return {
    slug: args.slug,
    path: args.path,
    value: result.value,
    topLevelKey: result.topLevelKey,
    topLevelValue: result.topLevelValue,
    id: article.id,
    title: article.title,
    baseHash: revision.baseHash,
  };
}

export async function setIupacNameHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    slug: string;
    value: string;
    expected: string;
  },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new PostgresError({
      code: "ARTICLE_NOT_FOUND",
      message: `No substance found for slug "${args.slug}".`,
    });
  }

  const result = applyIupacNameWrite(
    article as unknown as Record<string, unknown>,
    args.value,
    args.expected,
  );
  if (result.ok === false) {
    throw new PostgresError({
      code: result.conflict === true ? "FIELD_CONFLICT" : "FIELD_WRITE_REJECTED",
      message: result.reason,
    });
  }

  await ctx.db.patch(article._id, {
    identification: result.topLevelValue,
  });
  return {
    slug: args.slug,
    path: "identification.iupac_name",
    value: result.value,
    id: article.id,
    title: article.title,
  };
}

export async function deleteSubstanceHandler(
  ctx: MutationCtx,
  args: EditorArgs & { id: number },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  const existing = await ctx.db
    .query("substanceIndex")
    .withIndex("by_article_id", (query) => query.eq("id", args.id))
    .first();
  if (!existing) return { deleted: false };
  await ctx.db.delete(existing._id);
  return { deleted: true };
}
