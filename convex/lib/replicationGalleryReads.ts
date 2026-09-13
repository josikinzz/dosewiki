import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { replicationDateKind } from "./replicationDateValidators";
import {
  artistTypeTagValidator,
  contentFamilyValidator,
  drugClassValidator,
  viewingModeTagValidator,
} from "./replicationTaxonomyValidators";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";

const PUBLIC_GALLERY_PAGE_SIZE = 64;

const publicGalleryPreviewValidator = v.object({
  _id: v.id("replications"),
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  type: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  format: v.string(),
  effect_slug: v.optional(v.string()),
  effect_tags: v.optional(v.array(v.string())),
  viewing_mode_tags: v.optional(v.array(viewingModeTagValidator)),
  title_drugs: v.optional(
    v.array(v.object({ slug: v.string(), name: v.string() })),
  ),
  drug_classes: v.optional(v.array(drugClassValidator)),
  content_family: v.optional(contentFamilyValidator),
  artist_type_tags: v.optional(v.array(artistTypeTagValidator)),
  url: v.string(),
  thumbnail_url: v.optional(v.string()),
  preview_url: v.optional(v.string()),
  motion_url: v.optional(v.string()),
  motion_poster_url: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  duration: v.optional(v.number()),
  has_audio: v.optional(v.boolean()),
  created_at: v.string(),
  date_info: v.optional(
    v.object({ value: v.optional(v.string()), kind: replicationDateKind }),
  ),
  order_index: v.optional(v.number()),
});

export const publicGalleryPageArgs = {
  cursor: v.optional(v.string()),
  limit: v.number(),
};

export const publicGalleryPageResult = v.object({
  items: v.array(publicGalleryPreviewValidator),
  cursor: v.string(),
  isDone: v.boolean(),
});

/** Keep every public gallery read well below Convex's document-read ceiling. */
export function clampPublicGalleryPageSize(requested: number): number {
  const normalized = Number.isFinite(requested)
    ? Math.floor(requested)
    : PUBLIC_GALLERY_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), PUBLIC_GALLERY_PAGE_SIZE);
}

/**
 * Publishability, restated inside Convex for the paginated corpus read.
 *
 * Kept in lockstep with `isPublishableReplication` in
 * `src/types/replications.ts`, which is the definition; this is the same three
 * withholding reasons plus the presentable-kind check, because the corpus page
 * is assembled here and a row dropped after pagination would make pages
 * silently short. Audio is presentable: it is served by `/api/v1/replications`
 * and owns a permalink. Narrowing to the kinds a *frame* surface can draw is a
 * separate, app-side decision — see `getPublicGalleryReplications` in
 * `lib/convex/publicData.replications.ts`.
 */
function isPublishableGalleryRow(row: Doc<"replications">): boolean {
  return (
    (row.role ?? "replication") === "replication" &&
    row.publication_state !== "duplicate-suppressed" &&
    row.replication_status !== "not-replication" &&
    (row.type === "image" || row.type === "video" || row.type === "audio")
  );
}

function defined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

async function projectGalleryRow(
  urls: ReturnType<typeof memoizedStorageUrls>,
  row: Doc<"replications">,
  orderIndex?: number,
) {
  const resolved = await resolveReplicationUrls(urls, {
    ...row,
    storage_id: row.storage_id ?? "",
  });
  if (!resolved.url) return null;

  return {
    _id: row._id,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    ...(row.artist_url ? { artist_url: row.artist_url } : {}),
    type: row.type as "image" | "video" | "audio",
    format: row.format,
    ...(row.effect_slug ? { effect_slug: row.effect_slug } : {}),
    ...(row.effect_tags ? { effect_tags: row.effect_tags } : {}),
    ...(row.viewing_mode_tags
      ? { viewing_mode_tags: row.viewing_mode_tags }
      : {}),
    ...(row.title_drugs
      ? {
          title_drugs: row.title_drugs.map(({ slug, name }) => ({ slug, name })),
        }
      : {}),
    ...(row.drug_classes ? { drug_classes: row.drug_classes } : {}),
    ...(row.content_family ? { content_family: row.content_family } : {}),
    url: resolved.url,
    ...(resolved.thumbnail_url
      ? { thumbnail_url: resolved.thumbnail_url }
      : {}),
    ...(resolved.preview_url ? { preview_url: resolved.preview_url } : {}),
    ...(resolved.motion_url ? { motion_url: resolved.motion_url } : {}),
    ...(resolved.motion_poster_url
      ? { motion_poster_url: resolved.motion_poster_url }
      : {}),
    ...(defined(row.width) ? { width: row.width } : {}),
    ...(defined(row.height) ? { height: row.height } : {}),
    ...(defined(row.duration) ? { duration: row.duration } : {}),
    ...(defined(row.has_audio) ? { has_audio: row.has_audio } : {}),
    created_at: row.created_at,
    ...(row.date_info
      ? {
          date_info: {
            ...(row.date_info.value ? { value: row.date_info.value } : {}),
            kind: row.date_info.kind,
          },
        }
      : {}),
    ...(defined(orderIndex) ? { order_index: orderIndex } : {}),
  };
}

/**
 * One storage-ordered page of the public gallery projection.
 *
 * The cursor is Convex's opaque continuation token. Filtering can make a page
 * sparse, but every stored row is visited exactly once as callers follow the
 * cursor, and no query reads more than 64 replication documents.
 */
export async function getPublicGalleryPageHandler(
  ctx: QueryCtx,
  args: { cursor?: string; limit: number },
) {
  const result = await ctx.db.query("replications").paginate({
    cursor: args.cursor ?? null,
    numItems: clampPublicGalleryPageSize(args.limit),
  });
  const rows = result.page.filter(isPublishableGalleryRow);
  const orderByEffect = new Map<string, Map<string, number>>();

  for (const effectSlug of new Set(
    rows.map((row) => row.effect_slug).filter(defined),
  )) {
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (query) => query.eq("slug", effectSlug))
      .first();
    if (effect?.gallery_order) {
      orderByEffect.set(
        effectSlug,
        new Map(effect.gallery_order.map((slug, index) => [slug, index])),
      );
    }
  }

  const urls = memoizedStorageUrls(ctx);
  const projected = await Promise.all(
    rows.map((row) =>
      projectGalleryRow(
        urls,
        row,
        row.effect_slug
          ? orderByEffect.get(row.effect_slug)?.get(row.slug)
          : undefined,
      ),
    ),
  );

  return {
    items: projected.filter(defined),
    cursor: result.continueCursor,
    isDone: result.isDone,
  };
}
