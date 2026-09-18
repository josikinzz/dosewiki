import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { contentHash } from "../../lib/proposals/contentHash";
import { ABOUT_KEY } from "../siteConfig";
import { resolveSubstanceSlug } from "../../src/data/projections/substanceProjectionCore";
import { projectEditorArticle } from "../../src/data/projections/substanceReadProjections";

export type ProposalTargetKind = Doc<"changeProposals">["targets"][number]["kind"];

/** A target derived from the proposed writes, never accepted as an apply instruction. */
export type ProposalTargetRef = { kind: ProposalTargetKind; key: string };

/** The proposal body as far as target derivation reads it. */
export type ProposalPayloadShape = {
  articles?: Array<{ id?: number | null; title: string; slug?: string }>;
  indexLayouts?: Array<{ type: "psychoactive" | "chemical" | "mechanism" }>;
  copyBlocks?: Array<{ key: string }>;
  about?: object;
};

/**
 * The slug an article target is keyed by. `ingestSubstanceArticle` patches
 * the row found by article id before the row found by slug, so a payload
 * article that carries an id is pinned to that row's current slug: when the
 * payload names a different slug the proposal is refused here, since the
 * hash of the new slug (absent) would say nothing about the row the apply
 * would actually rewrite. Slug renames go through the admin save.
 */
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

/**
 * The targets a payload implies: one per article slug, one per layout type,
 * one per copy block key, and the single About row. Copy block keys are
 * trimmed the way `copyBlocks.upsert` trims them, so the hash pins the row the
 * write will touch. Submit derives these itself; a caller never names a target
 * the payload does not write.
 */
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
  return targets;
}

/** A row without runtime system fields: what a target's content hash covers. */
function contentOf(row: Record<string, unknown> | null): unknown {
  if (!row) {
    return null;
  }
  const { _id: _rowId, _creationTime: _createdAt, ...content } = row;
  return content;
}

/** Keep existing proposal CAS identities while snapshots retain unprojected storage content. */
export function proposalHashDocument(kind: ProposalTargetKind, document: unknown): unknown {
  if (kind !== "article" || document === null) return document;
  return contentOf(projectEditorArticle(document as Doc<"substanceIndex">) as Record<string, unknown>);
}

/**
 * The production document a target names. The default editor view preserves
 * the CAS identity of existing proposals and loaded editor baselines. Stored
 * views retain exact article data for diffs, journals, and guarded restoration.
 * A missing row reads as null.
 */
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
    case "copyBlock": {
      const row = await ctx.db
        .query("copyBlocks")
        .withIndex("by_key", (q) => q.eq("key", target.key))
        .first();
      return contentOf(row);
    }
  }
}

/**
 * Hash of `readProposalTarget`. Submit records it as `baseHash`; apply
 * recomputes it and refuses when it no longer matches.
 */
export async function hashProposalTarget(
  ctx: QueryCtx | MutationCtx,
  target: ProposalTargetRef,
): Promise<string> {
  return contentHash(await readProposalTarget(ctx, target));
}
