import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { QueryCtx } from "../../lib/postgres/runtime/server"
import { v } from "../../lib/postgres/runtime/values"
import { findContributorProfileByAuthorName } from "../../lib/contributorProfileIdentity";
import { replicationDateKind } from "./replicationDateValidators";
import {
  artistTypeTagValidator,
  contentFamilyValidator,
  drugClassValidator,
  viewingModeTagValidator,
} from "./replicationTaxonomyValidators";
import {
  isPlaceholderStorageId,
  isValidR2Key,
  memoizedStorageUrls,
  replicationMediaBaseUrl,
  resolveReplicationUrls,
  type StorageUrlReader,
} from "./replicationUrls";
import { depictedEffects, isPublishableReplication, isPublishedState } from "../../src/types/replications";

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
  effect_order_index: v.optional(v.record(v.string(), v.number())),
});

export const publicGalleryPageArgs = {
  cursor: v.optional(v.string()),
  limit: v.number(),
  effectSlug: v.optional(v.string()),
};

export const publicGalleryPageResult = v.object({
  items: v.array(publicGalleryPreviewValidator),
  cursor: v.string(),
  isDone: v.boolean(),
});

export const publicGalleryMembershipResult = v.array(publicGalleryPreviewValidator);

export function clampPublicGalleryPageSize(requested: number): number {
  const normalized = Number.isFinite(requested)
    ? Math.floor(requested)
    : PUBLIC_GALLERY_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), PUBLIC_GALLERY_PAGE_SIZE);
}

function isPublishableGalleryRow(row: Doc<"replications">): boolean {
  return (
    (row.role ?? "replication") === "replication" &&
    isPublishedState(row.publication_state) &&
    row.replication_status !== "not-replication" &&
    (row.type === "image" || row.type === "video" || row.type === "audio")
  );
}

function defined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

async function resolvePrimaryUrl(urls: StorageUrlReader, row: Doc<"replications">): Promise<string | null> {
  const base = replicationMediaBaseUrl();
  if (base && isValidR2Key(row.r2_key)) return `${base}/${row.r2_key}`;
  if (!isPlaceholderStorageId(row.storage_id)) {
    try {
      const resolved = await urls.storage.getUrl(row.storage_id!);
      if (resolved) return resolved;
    } catch {
    }
  }
  return row.url || null;
}

export async function getPublicGalleryMembershipHandler(ctx: QueryCtx) {
  const [storedRows, profiles] = await Promise.all([
    ctx.db.getPublicGalleryMembershipRows(),
    ctx.db.getPublicContributorIdentities(),
  ]);
  const publishable = storedRows.filter(isPublishableReplication);
  const matchableProfiles = profiles.map((entry) => ({
    displayName: entry.displayName ?? "",
    aliases: entry.aliases ?? [],
    exclude_from_gallery: entry.exclude_from_gallery,
  }));
  const visible = publishable.filter((row) =>
    findContributorProfileByAuthorName(matchableProfiles, row.artist)?.exclude_from_gallery !== true
  );
  const artistKeys = [...new Set(visible.map((row) => row.artist.trim().toLowerCase()).filter(Boolean))];
  const effectSlugs = [...new Set(visible.flatMap(depictedEffects))];
  const [artists, effects] = await Promise.all([
    ctx.db.getPublicArtistTaxonomyByKeys(artistKeys),
    ctx.db.getPublicEffectGalleryOrders(effectSlugs),
  ]);
  const artistByKey = new Map(artists.map((artist) => [artist.key, artist]));
  const orderByEffect = new Map<string, ReadonlyMap<string, number>>();
  for (const effect of effects) {
    if (effect.gallery_order) {
      orderByEffect.set(effect.slug, new Map(effect.gallery_order.map((slug, index) => [slug, index])));
    }
  }
  const urls = memoizedStorageUrls(ctx);
  const projected = await Promise.all(visible.map(async (row) => {
    const url = await resolvePrimaryUrl(urls, row);
    if (!url) return null;
    const positions: Record<string, number> = {};
    for (const effectSlug of depictedEffects(row)) {
      const position = orderByEffect.get(effectSlug)?.get(row.slug);
      if (defined(position)) positions[effectSlug] = position;
    }
    const artist = artistByKey.get(row.artist.trim().toLowerCase());
    return {
      _id: row._id,
      slug: row.slug,
      title: row.title,
      artist: row.artist,
      ...(row.artist_url ? { artist_url: row.artist_url } : {}),
      type: row.type,
      format: row.format,
      ...(row.effect_slug ? { effect_slug: row.effect_slug } : {}),
      ...(row.effect_tags ? { effect_tags: row.effect_tags } : {}),
      ...(row.viewing_mode_tags ? { viewing_mode_tags: row.viewing_mode_tags } : {}),
      ...(row.title_drugs ? { title_drugs: row.title_drugs.map(({ slug, name }) => ({ slug, name })) } : {}),
      ...(row.drug_classes ? { drug_classes: row.drug_classes } : {}),
      ...(row.content_family ? { content_family: row.content_family } : {}),
      ...(artist?.artist_type_tags ? { artist_type_tags: artist.artist_type_tags } : {}),
      url,
      ...(defined(row.has_audio) ? { has_audio: row.has_audio } : {}),
      created_at: row.created_at,
      ...(row.date_info ? { date_info: {
        ...(row.date_info.value ? { value: row.date_info.value } : {}),
        kind: row.date_info.kind,
      } } : {}),
      ...(Object.keys(positions).length > 0 ? { effect_order_index: positions } : {}),
    };
  }));
  return projected.filter(defined);
}

async function projectGalleryRow(
  urls: StorageUrlReader,
  row: Doc<"replications">,
  orderByEffect: ReadonlyMap<string, ReadonlyMap<string, number>>,
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
    ...(() => {
      const positions: Record<string, number> = {};
      for (const effectSlug of depictedEffects(row)) {
        const position = orderByEffect.get(effectSlug)?.get(row.slug);
        if (defined(position)) positions[effectSlug] = position;
      }
      return Object.keys(positions).length > 0
        ? { effect_order_index: positions }
        : {};
    })(),
  };
}

export async function getPublicGalleryPageHandler(
  ctx: QueryCtx,
  args: { cursor?: string; limit: number; effectSlug?: string },
) {
  if (args.effectSlug === undefined && args.cursor?.startsWith("effect-replications:")) {
    throw new Error("Invalid effect replication cursor.");
  }
  const limit = clampPublicGalleryPageSize(args.limit);
  const result = args.effectSlug === undefined
    ? await ctx.db.query("replications").paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      })
    : await ctx.db.getPublicEffectReplicationPage({
        effectSlug: args.effectSlug,
        cursor: args.cursor,
        limit,
      });
  const rows = result.page.filter(isPublishableGalleryRow);
  const orderByEffect = new Map<string, ReadonlyMap<string, number>>();

  const effectSlugs = [...new Set(rows.flatMap(depictedEffects))];
  const effects = effectSlugs.length ? await ctx.db.getPublicEffectGalleryOrders(effectSlugs) : [];
  for (const effect of effects) {
    if (effect.gallery_order) {
      orderByEffect.set(
        effect.slug,
        new Map(effect.gallery_order.map((slug, index) => [slug, index])),
      );
    }
  }

  const urls = memoizedStorageUrls(ctx);
  const projected = await Promise.all(
    rows.map((row) => projectGalleryRow(urls, row, orderByEffect)),
  );

  return {
    items: projected.filter(defined),
    cursor: result.continueCursor,
    isDone: result.isDone,
  };
}
