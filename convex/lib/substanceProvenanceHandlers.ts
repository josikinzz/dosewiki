import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireEditorWrite } from "./auth";
import {
  applyReferenceAuthorRepair,
  selectUniqueArticleForReferenceAuthorRepair,
} from "./articleReferenceAuthorWrites";
import {
  applyReferenceProvenanceRepair,
  type ExpectedReferenceProvenanceSnapshot,
} from "./articleReferenceProvenanceWrites";

type ReferenceIdentity = {
  title: string;
  doi: string | null;
  pmid: string | null;
  authors: string[];
};

type EditorArgs = { apiKey?: string; actorEmail?: string; slug: string };

export async function getArticleReferenceProvenanceRepairSnapshotHandler(
  ctx: QueryCtx,
  args: { slug: string; referenceId: string },
) {
  const articleMatches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .take(2);
  if (articleMatches.length !== 1) {
    return {
      articleCount: articleMatches.length,
      referenceCount: 0,
      reference: null,
    };
  }
  const references = Array.isArray(articleMatches[0].references)
    ? (articleMatches[0].references as Array<Record<string, unknown>>)
    : [];
  const matches = references.filter((reference) => reference?.id === args.referenceId);
  return {
    articleCount: 1,
    referenceCount: matches.length,
    reference: matches.length === 1 ? matches[0] : null,
  };
}

export async function repairArticleReferenceAuthorsHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    referenceId: string;
    expected: ReferenceIdentity;
    proposedAuthors: string[];
  },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const articleMatches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .take(2);
  const selectedArticle = selectUniqueArticleForReferenceAuthorRepair(
    articleMatches,
    args.slug,
  );
  if (selectedArticle.ok === false) {
    throw new ConvexError({
      code: selectedArticle.code,
      message: selectedArticle.reason,
    });
  }
  const article = selectedArticle.article;
  const result = applyReferenceAuthorRepair(
    article as unknown as Record<string, unknown>,
    {
      referenceId: args.referenceId,
      expected: args.expected,
      proposedAuthors: args.proposedAuthors,
    },
  );
  if (result.ok === false) {
    throw new ConvexError({ code: result.code, message: result.reason });
  }
  if (result.updated && result.references) {
    await ctx.db.patch(article._id, { references: result.references } as Partial<typeof article>);
  }
  return {
    slug: args.slug,
    referenceId: args.referenceId,
    updated: result.updated,
    authors: result.reference.authors,
  };
}

export async function repairArticleReferenceMetadataProvenanceHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    referenceId: string;
    expected: ExpectedReferenceProvenanceSnapshot;
    proposedMetadataProvenance: unknown;
  },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const articleMatches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .take(2);
  const selectedArticle = selectUniqueArticleForReferenceAuthorRepair(
    articleMatches,
    args.slug,
  );
  if (selectedArticle.ok === false) {
    throw new ConvexError({
      code: selectedArticle.code,
      message: selectedArticle.reason,
    });
  }
  const article = selectedArticle.article;
  const result = applyReferenceProvenanceRepair(
    article as unknown as Record<string, unknown>,
    {
      referenceId: args.referenceId,
      expected: args.expected,
      proposedMetadataProvenance: args.proposedMetadataProvenance,
    },
  );
  if (result.ok === false) {
    throw new ConvexError({ code: result.code, message: result.reason });
  }
  if (result.updated && result.references) {
    await ctx.db.patch(article._id, { references: result.references } as Partial<typeof article>);
  }
  return {
    slug: args.slug,
    referenceId: args.referenceId,
    updated: result.updated,
    metadataProvenance: result.reference.metadataProvenance ?? [],
  };
}
