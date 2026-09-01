import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  includeDirectlyAssociatedRows,
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  substanceGalleryTargetOf,
  type SubstanceGalleryMatchProvenance,
} from "../../src/data/substanceReplicationGallery";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";

/**
 * The substance article's whole Replication Showcase in one round trip.
 *
 * The previous public shape asked the Next side to drain the slim matchable
 * corpus page by page (28 round trips for the live table) and then hydrate the
 * winners through `replications:getBySlugs`. Here the same pure policy from
 * `src/data/substanceReplicationGallery` runs beside the data: one indexed
 * substance read, one indexed curation read, one table scan of the
 * replication rows, and storage URL resolution for only the merged winners.
 *
 * The scan reads every replication document the way the curation portal's
 * `getCurationDetail` and `upsert` already do. It stays under Convex's
 * per-query read ceiling for the current table; the Next side keeps the paged
 * corpus path as its fallback if this query is missing or fails.
 *
 * Output rows match `replications:getBySlugs` exactly: a row that resolves no
 * main URL has no page and is dropped, and absent renditions are omitted
 * rather than sent as null, so the Next side's `ReplicationWithUrl` type holds
 * without a second projection. A missing or ambiguous substance is an empty
 * gallery, never an error.
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

export async function getPublicGalleryBySubstanceHandler(
  ctx: QueryCtx,
  args: { substance_slug: string },
): Promise<{ items: PublicSubstanceGalleryItem[] }> {
  const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
  if (!substance) {
    return { items: [] };
  }

  const [gallery, rows] = await Promise.all([
    ctx.db
      .query("substanceGalleries")
      .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
      .first(),
    ctx.db.query("replications").collect(),
  ]);

  const target = substanceGalleryTargetOf(substance);
  const matches = target
    ? matchSubstanceGalleryReplications(rows, target).matches
    : [];
  const merged = mergeCuratedGallery(
    includeDirectlyAssociatedRows(rows, matches, gallery),
    gallery,
  );
  if (merged.length === 0) {
    return { items: [] };
  }

  const urls = memoizedStorageUrls(ctx);
  const resolved = await Promise.all(
    merged.map(async ({ row, provenance }) => {
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

  return { items: resolved.filter((item) => item !== null) };
}
