import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireEditorWrite } from "./auth";
import {
  applyEditableFieldWrite,
  applyIupacNameWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  isEditableArticleFieldPath,
} from "./articleFieldWrites";
import { appendArticleReference, removeArticleReference } from "./articleReferenceWrites";
import { ingestSubstanceArticle, ingestSubstanceArticles } from "./substanceIngestion";

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
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const outcome = await ingestSubstanceArticle({ db: ctx.db, article: args.article });
  if (outcome.action === "skipped") {
    throw new Error(outcome.error ?? "Unable to save substance.");
  }
  return {
    updated: outcome.action === "updated",
    id: outcome.convexId,
    outcome,
    affectedPaths: outcome.affectedPaths,
  };
}

export async function saveSubstancesHandler(
  ctx: MutationCtx,
  args: EditorArgs & { articles: SubstanceArticleInput[] },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
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
    expected?: EditableFieldValue;
  },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  if (!isEditableArticleFieldPath(args.path)) {
    throw new ConvexError({
      code: "FIELD_NOT_EDITABLE",
      message: `Field "${args.path}" is not inline-editable.`,
    });
  }
  if (
    typeof args.value === "string" &&
    args.value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH
  ) {
    throw new ConvexError({
      code: "FIELD_VALUE_INVALID",
      message: `Field value exceeds ${EDITABLE_ARTICLE_FIELD_MAX_LENGTH} characters.`,
    });
  }
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new ConvexError({
      code: "ARTICLE_NOT_FOUND",
      message: `No substance found for slug "${args.slug}".`,
    });
  }
  const result = applyEditableFieldWrite(
    article as unknown as Record<string, unknown>,
    args.path,
    args.value,
    { expected: args.expected },
  );
  if (result.ok === false) {
    throw new ConvexError({
      code: result.conflict === true ? "FIELD_CONFLICT" : "FIELD_WRITE_REJECTED",
      message: result.reason,
    });
  }
  await ctx.db.patch(article._id, {
    [result.topLevelKey]: result.topLevelValue,
  } as Partial<typeof article>);
  return {
    slug: args.slug,
    path: args.path,
    value: result.value,
    topLevelKey: result.topLevelKey,
    topLevelValue: result.topLevelValue,
    id: article.id,
    title: article.title,
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
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new ConvexError({
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
    throw new ConvexError({
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

export async function appendArticleReferenceHandler(
  ctx: MutationCtx,
  args: EditorArgs & { slug: string; reference: unknown },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new ConvexError({
      code: "ARTICLE_NOT_FOUND",
      message: `No substance found for slug "${args.slug}".`,
    });
  }
  const result = appendArticleReference(
    article as unknown as Record<string, unknown>,
    args.reference,
  );
  if (result.ok === false) {
    throw new ConvexError({ code: "REFERENCE_WRITE_REJECTED", message: result.reason });
  }
  if (result.references) {
    await ctx.db.patch(article._id, { references: result.references } as Partial<typeof article>);
  }
  return {
    slug: args.slug,
    created: result.created,
    reference: result.reference,
    id: article.id,
    title: article.title,
  };
}

export async function removeArticleReferenceHandler(
  ctx: MutationCtx,
  args: EditorArgs & { slug: string; referenceId: string },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new ConvexError({
      code: "ARTICLE_NOT_FOUND",
      message: `No substance found for slug "${args.slug}".`,
    });
  }
  const result = removeArticleReference(
    article as unknown as Record<string, unknown>,
    args.referenceId,
  );
  if (result.ok === false) {
    throw new ConvexError({ code: "REFERENCE_WRITE_REJECTED", message: result.error });
  }
  if (result.removed === false) {
    return {
      ok: true as const,
      slug: args.slug,
      title: article.title,
      id: article.id,
      removed: false,
      markersStripped: 0,
      routeIdsStripped: 0,
      referenceTitle: null,
    };
  }
  await ctx.db.patch(article._id, result.patch as Partial<typeof article>);
  return {
    ok: true as const,
    slug: args.slug,
    title: article.title,
    id: article.id,
    removed: true,
    markersStripped: result.markersStripped,
    routeIdsStripped: result.routeIdsStripped,
    referenceTitle: result.title,
  };
}

export async function deleteSubstanceHandler(
  ctx: MutationCtx,
  args: EditorArgs & { id: number },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const existing = await ctx.db
    .query("substanceIndex")
    .withIndex("by_article_id", (query) => query.eq("id", args.id))
    .first();
  if (!existing) return { deleted: false };
  await ctx.db.delete(existing._id);
  return { deleted: true };
}
