import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import {
  requireAdminIntent,
  requireEditorWrite,
  requireRegisteredDelegatedEditorWrite,
} from "./auth";
import {
  GeneratedPublicationError,
  publishReviewedSectionTransaction,
  requireGeneratedPublicationDeploymentFingerprint,
  type ReviewedPublicationProposal,
} from "./generatedPublication";
import {
  addHumanReviewFlag as appendHumanReviewFlag,
  assertAgentReviewFlagInput,
  deleteReviewFlagByIdentity,
  preserveEditorialReviewWithFlags,
  replaceAgentReviewFlags,
  type StoredReviewFlag,
} from "./reviewFlags";

export type ReviewFlagInput = {
  label: string;
  severity: "major" | "minor" | "note";
  note: string;
  section?:
    | "overview"
    | "classification"
    | "summary"
    | "dosage-duration"
    | "subjective-effects"
    | "reagent-testing"
    | "pharmacology"
    | "interactions"
    | "tolerance"
    | "harm-potential"
    | "history-culture"
    | "trip-reports"
    | "legality"
    | "sources"
    | "citations"
    | "editorial-review";
};

type EditorArgs = { apiKey?: string; actorEmail?: string; slug: string };

async function requireArticle(ctx: MutationCtx, args: EditorArgs) {
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
  return article;
}

function storedReview(article: { editorial_review?: unknown }): Record<string, unknown> {
  return article.editorial_review && typeof article.editorial_review === "object"
    ? (article.editorial_review as Record<string, unknown>)
    : {};
}

export async function publishReviewedSectionHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail: string; proposal: unknown },
) {
  if (!args.actorEmail.trim()) {
    throw new ConvexError({
      code: "INVALID_ACTOR",
      message: "A delegated editor actorEmail is required.",
    });
  }
  if (!args.apiKey?.trim()) {
    throw new ConvexError({
      code: "SCOPED_TOKEN_REQUIRED",
      message: "The generated-publication scoped token is required.",
    });
  }
  try {
    const credential = await requireAdminIntent(args.apiKey, "generatedPublicationWrite");
    if (credential.source !== "scoped") {
      throw new ConvexError({
        code: "SCOPED_TOKEN_REQUIRED",
        message: "The legacy admin key cannot authorize generated publication.",
      });
    }
    const actor = await requireRegisteredDelegatedEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "generatedPublicationWrite",
    });
    return await publishReviewedSectionTransaction({
      db: ctx.db,
      proposal: args.proposal as ReviewedPublicationProposal,
      actorEmail: actor.email,
      now: new Date().toISOString(),
      expectedTargetDeploymentFingerprint: requireGeneratedPublicationDeploymentFingerprint(),
    });
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (error instanceof GeneratedPublicationError) {
      throw new ConvexError({
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
    throw new ConvexError({
      code:
        error instanceof Error && error.name === "AuthError"
          ? "UNAUTHORIZED"
          : "PUBLICATION_FAILED",
      message: error instanceof Error ? error.message : "Generated publication failed.",
    });
  }
}

export async function setEditorialReviewHandler(
  ctx: MutationCtx,
  args: EditorArgs & { status: "needed" | "in_progress" | "completed" },
) {
  const actor = await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const editorialReview: Record<string, unknown> = {
    status: args.status,
    notes: typeof existing.notes === "string" ? existing.notes : "",
    ...(Array.isArray(existing.flags) ? { flags: existing.flags } : {}),
    ...(args.status === "completed"
      ? { reviewed_by: actor.email, reviewed_at: new Date(Date.now()).toISOString() }
      : {}),
  };
  await ctx.db.patch(article._id, { editorial_review: editorialReview });
  return { slug: args.slug, editorial_review: editorialReview };
}

export async function addHumanReviewFlagHandler(
  ctx: MutationCtx,
  args: EditorArgs & { flag: ReviewFlagInput },
) {
  const actor = await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  try {
    assertAgentReviewFlagInput(args.flag);
  } catch (error) {
    throw new ConvexError({
      code: "INVALID_REVIEW_FLAG",
      message: error instanceof Error ? error.message : "Invalid Review Flag.",
    });
  }
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const flags = appendHumanReviewFlag(
    Array.isArray(existing.flags) ? (existing.flags as StoredReviewFlag[]) : [],
    args.flag,
    new Date().toISOString(),
    actor.email,
  );
  await ctx.db.patch(article._id, {
    editorial_review: preserveEditorialReviewWithFlags(existing, flags),
  });
  return { slug: args.slug, flags };
}

export async function deleteReviewFlagHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    identity: { created_at: string; label: string; source: "agent" | "human" };
  },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  let flags: StoredReviewFlag[];
  try {
    flags = deleteReviewFlagByIdentity(
      Array.isArray(existing.flags) ? (existing.flags as StoredReviewFlag[]) : [],
      args.identity,
    );
  } catch {
    throw new ConvexError({
      code: "FLAG_NOT_FOUND",
      message: "That Review Flag no longer exists.",
    });
  }
  await ctx.db.patch(article._id, {
    editorial_review: preserveEditorialReviewWithFlags(existing, flags),
  });
  return { slug: args.slug, flags };
}

export async function replaceAgentReviewFlagsHandler(
  ctx: MutationCtx,
  args: EditorArgs & { runId: string; flags: ReviewFlagInput[] },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  if (!args.runId.trim()) {
    throw new ConvexError({ code: "INVALID_REVIEW_RUN", message: "Review Run id is required." });
  }
  for (const flag of args.flags) {
    try {
      assertAgentReviewFlagInput(flag);
    } catch (error) {
      throw new ConvexError({
        code: "INVALID_REVIEW_FLAG",
        message: error instanceof Error ? error.message : "Invalid Review Flag.",
      });
    }
  }
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const existingFlags = Array.isArray(existing.flags)
    ? (existing.flags as StoredReviewFlag[])
    : [];
  const flags = replaceAgentReviewFlags(
    existingFlags,
    args.flags,
    args.runId,
    new Date().toISOString(),
  );
  await ctx.db.patch(article._id, { editorial_review: { ...existing, flags } });
  return { slug: args.slug, flags };
}
