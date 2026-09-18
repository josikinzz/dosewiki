import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { titleDrugClassesOf, titleDrugRoutesOf } from "../../src/data/substanceReplicationGallery";
import { projectReviewedArticleForEmails } from "../../src/data/projections/substanceReadProjections";

export const PUBLIC_READ_INDEX_VERSION = 1;
export type PublicReadIndexName = "gallery" | "history" | "reviews" | "tripReports";

export async function publicReadIndexState(ctx: QueryCtx, name: PublicReadIndexName) {
  return ctx.db.query("publicReadIndexState").withIndex("by_name", (q) => q.eq("name", name)).unique();
}

export async function publicReadIndexReady(ctx: QueryCtx, name: PublicReadIndexName) {
  const state = await publicReadIndexState(ctx, name);
  return state?.version === PUBLIC_READ_INDEX_VERSION && state.ready;
}

export function galleryCandidateKeys(row: Doc<"replications">): string[] {
  // Deliberately over-select. The canonical pure policy makes every admission
  // decision at read time, including combinations and publication suppression.
  return [...new Set([
    `slug:${row.slug}`,
    ...titleDrugRoutesOf(row).map((slug) => `drug:${slug}`),
    ...titleDrugClassesOf(row).map((key) => `class:${key}`),
    ...(row.effect_slug === "visual-disconnection" ? ["effect:visual-disconnection"] : []),
  ])];
}

export function galleryMatchProjection(row: Doc<"replications">) {
  return {
    slug: row.slug, title: row.title, type: row.type,
    ...(row.role !== undefined ? { role: row.role } : {}),
    ...(row.effect_slug !== undefined ? { effect_slug: row.effect_slug } : {}),
    ...(row.title_drugs !== undefined ? { title_drugs: row.title_drugs } : {}),
    ...(row.title_class_mentions !== undefined ? { title_class_mentions: row.title_class_mentions } : {}),
    ...(row.showcase_excluded !== undefined ? { showcase_excluded: row.showcase_excluded } : {}),
    ...(row.replication_status !== undefined ? { replication_status: row.replication_status } : {}),
    ...(row.publication_state !== undefined ? { publication_state: row.publication_state } : {}),
  };
}

export async function syncGalleryCandidates(ctx: MutationCtx, id: Id<"replications">, row: Doc<"replications"> | null) {
  const existing = await ctx.db.query("replicationGalleryCandidates").withIndex("by_replication", (q) => q.eq("replication_id", id)).collect();
  const wanted = new Set(row ? galleryCandidateKeys(row) : []);
  const projection = row ? { replication_id: id, source_created: row._creationTime, ...galleryMatchProjection(row) } : null;
  for (const previous of existing) {
    if (!wanted.delete(previous.candidate_key) || !projection) {
      await ctx.db.delete(previous._id);
      continue;
    }
    // Replace clears removed optional policy fields as well as changed values.
    await ctx.db.replace(previous._id, { candidate_key: previous.candidate_key, ...projection });
  }
  if (projection) for (const candidate_key of wanted) {
    await ctx.db.insert("replicationGalleryCandidates", { candidate_key, ...projection });
  }
}

export async function syncArticleHistory(ctx: MutationCtx, id: Id<"changelog">, row: Doc<"changelog"> | null) {
  const existing = await ctx.db.query("articleHistory").withIndex("by_changelog", (q) => q.eq("changelog_id", id)).collect();
  const wanted = new Set(row?.articles.map((article) => article.slug) ?? []);
  for (const previous of existing) {
    if (!row || !wanted.delete(previous.slug)) await ctx.db.delete(previous._id);
    else await ctx.db.replace(previous._id, { slug: previous.slug, changelog_id: id, createdAt: row.createdAt, source_created: row._creationTime });
  }
  if (row) for (const slug of wanted) {
    await ctx.db.insert("articleHistory", { slug, changelog_id: id, createdAt: row.createdAt, source_created: row._creationTime });
  }
}

export async function syncReviewedArticle(ctx: MutationCtx, id: Id<"substanceIndex">, row: Doc<"substanceIndex"> | null) {
  const existing = await ctx.db.query("reviewedArticles").withIndex("by_article", (q) => q.eq("article_id", id)).collect();
  const email = row?.editorial_review?.reviewed_by?.trim().toLowerCase();
  const reviewed = row && email ? projectReviewedArticleForEmails(row, new Set([email])) : null;
  const desired = reviewed && row && email ? { article_id: id, source_created: row._creationTime, reviewer_email: email, ...reviewed } : null;
  const [first, ...duplicates] = existing;
  for (const duplicate of duplicates) await ctx.db.delete(duplicate._id);
  if (!desired) {
    if (first) await ctx.db.delete(first._id);
  } else if (first) await ctx.db.replace(first._id, desired);
  else await ctx.db.insert("reviewedArticles", desired);
}
