import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { contentHash } from "../../lib/proposals/contentHash";
import { ABOUT_KEY } from "../siteConfig";
import { resolveSubstanceSlug } from "../../src/data/projections/substanceProjectionCore";
import { projectEditorArticle } from "../../src/data/projections/substanceReadProjections";

export type ProposalTargetKind = Doc<"changeProposals">["targets"][number]["kind"];

export type ProposalTargetRef = { kind: ProposalTargetKind; key: string };

export type ProposalPayloadShape = {
  articles?: Array<{ id?: number | null; title: string; slug?: string }>;
  indexLayouts?: Array<{ type: "psychoactive" | "chemical" | "mechanism" }>;
  copyBlocks?: Array<{ key: string }>;
  about?: object;
  writing?: { slug: string };
};

async function resolveArticleTargetKey(
  ctx: QueryCtx | MutationCtx,
  article: { id?: number | null; title: string; slug?: string },
): Promise<string> {
  const slug = resolveSubstanceSlug(article);
  if (typeof article.id !== "number") {
    return slug;
  }
  const id = article.id;
  const row = await ctx.db
    .query("substanceIndex")
    .withIndex("by_article_id", (q) => q.eq("id", id))
    .first();
  if (row && resolveSubstanceSlug(row) !== slug) {
    throw new PostgresError({
      code: "PROPOSAL_SLUG_MOVE",
      message: `Article ${id} lives at "${resolveSubstanceSlug(row)}"; a proposal cannot move it to "${slug}". Rename slugs through a direct save.`,
    });
  }
  return slug;
}

export async function deriveProposalTargets(
  ctx: QueryCtx | MutationCtx,
  payload: ProposalPayloadShape,
): Promise<ProposalTargetRef[]> {
  const targets: ProposalTargetRef[] = [];
  for (const article of payload.articles ?? []) {
    targets.push({ kind: "article", key: await resolveArticleTargetKey(ctx, article) });
  }
  for (const layout of payload.indexLayouts ?? []) {
    targets.push({ kind: "indexLayout", key: layout.type });
  }
  for (const block of payload.copyBlocks ?? []) {
    targets.push({ kind: "copyBlock", key: block.key.trim() });
  }
  if (payload.about) {
    targets.push({ kind: "about", key: ABOUT_KEY });
  }
  if (payload.writing) {
    targets.push({ kind: "writing", key: payload.writing.slug });
  }
  return targets;
}

function contentOf(row: Record<string, unknown> | null): unknown {
  if (!row) {
    return null;
  }
  const { _id: _rowId, _creationTime: _createdAt, ...content } = row;
  return content;
}

export function proposalHashDocument(kind: ProposalTargetKind, document: unknown): unknown {
  if (kind !== "article" || document === null) return document;
  return contentOf(projectEditorArticle(document as Doc<"substanceIndex">) as Record<string, unknown>);
}

export async function readProposalTarget(
  ctx: QueryCtx | MutationCtx,
  target: ProposalTargetRef,
  articleView: "editor" | "stored" = "editor",
): Promise<unknown> {
  switch (target.kind) {
    case "article": {
      const matches = await ctx.db
        .query("substanceIndex")
        .withIndex("by_slug", (q) => q.eq("slug", target.key))
        .take(2);
      if (matches.length > 1) {
        throw new PostgresError({
          code: "PROPOSAL_TARGET_AMBIGUOUS",
          message: `Slug "${target.key}" matches more than one article.`,
        });
      }
      const row = matches[0];
      const document = contentOf(row ?? null);
      return articleView === "stored" ? document : proposalHashDocument("article", document);
    }
    case "indexLayout": {
      if (target.key !== "psychoactive" && target.key !== "chemical" && target.key !== "mechanism") {
        throw new PostgresError({
          code: "PROPOSAL_TARGET_INVALID",
          message: `"${target.key}" is not an index layout type.`,
        });
      }
      const type = target.key;
      const row = await ctx.db
        .query("indexLayouts")
        .withIndex("by_type", (q) => q.eq("type", type))
        .first();
      return contentOf(row);
    }
    case "about": {
      if (target.key !== ABOUT_KEY) {
        throw new PostgresError({
          code: "PROPOSAL_TARGET_INVALID",
          message: `"${target.key}" is not the About row.`,
        });
      }
      const row = await ctx.db
        .query("siteConfig")
        .withIndex("by_key", (q) => q.eq("key", ABOUT_KEY))
        .first();
      return contentOf(row);
    }
    case "writing": {
      const row = await ctx.db
        .query("effectIndexArticles")
        .withIndex("by_slug", (q) => q.eq("slug", target.key))
        .first();
      return contentOf(row);
    }
    case "copyBlock": {
      const row = await ctx.db
        .query("copyBlocks")
        .withIndex("by_key", (q) => q.eq("key", target.key))
        .first();
      return contentOf(row);
    }
  }
}

export async function hashProposalTarget(
  ctx: QueryCtx | MutationCtx,
  target: ProposalTargetRef,
): Promise<string> {
  return contentHash(await readProposalTarget(ctx, target));
}
