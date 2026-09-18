import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { QueryCtx } from "../../lib/postgres/runtime/server"
import {
  includeDirectlyAssociatedRows,
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  substanceGalleryTargetOf,
  type SubstanceGalleryMatchProvenance,
} from "../../src/data/substanceReplicationGallery";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";
import { publicReadIndexReady } from "./publicReadIndexes";

/** Indexed compact candidates run through the canonical policy before only
 * winners are hydrated. Until a complete backfill is certified, the adapter
 * uses the existing shared paged corpus instead of any per-slug table scan.
 */
export type PublicSubstanceGalleryReplication = Omit<
  Doc<"replications">,
  "url" | "thumbnail_url"
> & {
  url: string;
  thumbnail_url?: string;
  preview_url?: string;
  motion_url?: string;
  motion_poster_url?: string;
};

export type PublicSubstanceGalleryItem = {
  replication: PublicSubstanceGalleryReplication;
  provenance: SubstanceGalleryMatchProvenance;
};

async function uniqueSubstanceBySlug(ctx: QueryCtx, slug: string) {
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(2);
  return matches.length === 1 ? matches[0] : null;
}

/** Canonical membership without hydrating media; shared by public reads and orders. */
export async function getSubstanceGalleryMembers(
  ctx: QueryCtx,
  substance: Doc<"substanceIndex">,
  gallery: Doc<"substanceGalleries"> | null,
) {
  if (gallery?.disabled) return [];
  if (!(await publicReadIndexReady(ctx, "gallery"))) {
    throw new PostgresError({ code: "SUBSTANCE_GALLERY_INDEX_NOT_READY" });
  }
  const candidateKeys = new Set([
    `drug:${substance.slug}`,
    "class:dissociatives", "class:deliriants", "effect:visual-disconnection",
    ...(gallery?.curated_slugs ?? []).map((slug) => `slug:${slug}`),
    ...(gallery?.removed_slugs ?? []).map((slug) => `slug:${slug}`),
  ]);
  const byId = new Map<string, Doc<"replicationGalleryCandidates">>();
  for (const candidate_key of candidateKeys) {
    const candidates = await ctx.db.query("replicationGalleryCandidates")
      .withIndex("by_candidate", (q) => q.eq("candidate_key", candidate_key)).collect();
    for (const row of candidates) byId.set(row.replication_id, row);
  }
  const rows = [...byId.values()].sort((a, b) =>
    a.source_created - b.source_created || (a.replication_id < b.replication_id ? -1 : a.replication_id > b.replication_id ? 1 : 0));
  const target = substanceGalleryTargetOf(substance);
  const matches = target ? matchSubstanceGalleryReplications(rows, target).matches : [];
  return mergeCuratedGallery(includeDirectlyAssociatedRows(rows, matches, gallery), gallery);
}

export async function getPublicGalleryBySubstanceHandler(
  ctx: QueryCtx,
  args: { substance_slug: string },
): Promise<{ items: PublicSubstanceGalleryItem[]; carouselOrder?: string[] }> {
  const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
  if (!substance) {
    return { items: [] };
  }

  const gallery = await ctx.db.query("substanceGalleries")
    .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug)).first();
  if (gallery?.disabled) return { items: [] };
  const merged = await getSubstanceGalleryMembers(ctx, substance, gallery);
  if (merged.length === 0) {
    return { items: [] };
  }

  const urls = memoizedStorageUrls(ctx);
  const resolved = await Promise.all(
    merged.map(async ({ row: candidate, provenance }) => {
      const row = await ctx.db.get(candidate.replication_id);
      if (!row) return null;
      const { url, thumbnail_url, preview_url, motion_url, motion_poster_url } =
        await resolveReplicationUrls(urls, row);
      if (!url) return null;
      const { url: _storedUrl, thumbnail_url: _storedThumbnail, ...stored } = row;
      const replication: PublicSubstanceGalleryReplication = {
        ...stored,
        url,
        ...(thumbnail_url ? { thumbnail_url } : {}),
        ...(preview_url ? { preview_url } : {}),
        ...(motion_url ? { motion_url } : {}),
        ...(motion_poster_url ? { motion_poster_url } : {}),
      };
      return { replication, provenance };
    }),
  );

  return { items: resolved.filter((item) => item !== null), carouselOrder: gallery?.carousel_order ?? [] };
}
