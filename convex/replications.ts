import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { normalizeProfileAlias } from "../lib/contributorProfileIdentity";
import { hasKnownCreator } from "../src/features/effects/components/replicationCredit";

/**
 * Replication functions for video and image replications of effects.
 *
 * Replications are stored with Convex file storage IDs.
 * Storage URLs are generated on-the-fly using ctx.storage.getUrl().
 */

const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

/**
 * What a stored row *is*. Absent means `replication` — see the long note beside
 * the column in `convex/schema.ts`. Kept as a literal union rather than a boolean
 * so a third kind can be added without re-reading every call site.
 */
const replicationRole = v.union(v.literal("replication"), v.literal("figure"));

/** Storable media kinds. `audio` is new; "image"/"video" are unchanged. */
const replicationMediaType = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

const replicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

type ReplicationRightsPatch = {
  rights_status?: "creator-retained" | "explicit-license" | "unknown" | "permission-granted" | "public-domain";
  license_name?: string;
  license_url?: string;
  credit_line?: string;
  source_url?: string;
  rightsholder?: string;
  permission_notes?: string;
  removal_contact?: string;
};

const replicationCreditSnapshot = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  source_url: v.union(v.string(), v.null()),
  rightsholder: v.union(v.string(), v.null()),
});

const replicationCreditUpdates = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  credit_line: v.string(),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
});

/** The slug shape every public replication URL and `gallery_order` entry uses. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlaceholderStorageId(storageId?: string | null) {
  return !storageId || storageId.startsWith("placeholder-");
}

function definedReplicationRightsPatch(updates: ReplicationRightsPatch) {
  const patch: ReplicationRightsPatch = {};

  for (const key of Object.keys(updates) as Array<keyof ReplicationRightsPatch>) {
    const value = updates[key];
    if (value !== undefined) {
      (patch[key] as typeof value) = value;
    }
  }

  return patch;
}

async function resolveReplicationUrls(
  ctx: { storage: { getUrl: (storageId: string) => Promise<string> } },
  rep: {
    storage_id: string;
    thumbnail_storage_id?: string;
    url?: string;
    thumbnail_url?: string;
  }
) {
  let url = null;
  let thumbnail_url = null;

  if (!isPlaceholderStorageId(rep.storage_id)) {
    try {
      url = await ctx.storage.getUrl(rep.storage_id);
    } catch {
      // Storage ID might be invalid or missing
    }
  }

  if (!url && rep.url) {
    url = rep.url;
  }

  if (!isPlaceholderStorageId(rep.thumbnail_storage_id)) {
    try {
      thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id);
    } catch {
      // Storage ID might be invalid or missing
    }
  }

  if (!thumbnail_url && rep.thumbnail_url) {
    thumbnail_url = rep.thumbnail_url;
  }

  return { url, thumbnail_url };
}

/**
 * Get all replications.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("replications").collect();
  },
});

/**
 * Get a single replication by slug.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      return null;
    }

    const { url, thumbnail_url } = await resolveReplicationUrls(ctx, replication);

    return {
      ...replication,
      url,
      thumbnail_url,
    };
  },
});

/**
 * Get all replications for a specific effect by effect slug.
 * Returns replications with storage URLs attached.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getReplicationsByEffect = query({
  args: { effect_slug: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_effect", (q) => q.eq("effect_slug", args.effect_slug))
      .collect();

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        return {
          ...rep,
          url,
          thumbnail_url,
        };
      })
    );
  },
});

/**
 * Get all replications by a specific artist.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getByArtist = query({
  args: { artist: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_artist", (q) => q.eq("artist", args.artist))
      .collect();

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        return {
          ...rep,
          url,
          thumbnail_url,
        };
      })
    );
  },
});

/**
 * Whether an `artist` string is a credit a contributor profile can claim.
 *
 * The bar is only that the row says *something* — `hasKnownCreator`, the same
 * helper the gallery uses to decide the same question about the same column, so
 * there is no rival copy of the rule. A blank credit and the "unknown" marker
 * name nobody, so no profile can honestly claim them and none ever joins.
 *
 * This deliberately no longer excludes the collective/generator markers
 * ("various artists", "midjourney") and their kin. Those credits *do* name
 * something specific and repeatable, and the site now gives them their own
 * marker contributor profiles so their gallery sections are curatable like
 * anyone else's — which only works if the credit can join to the profile that
 * carries the same name. Matching stays exact on a whole normalized name, so a
 * marker joins the profile that literally names it and nothing else; a person's
 * profile can still only collect a marker's works if an editor deliberately
 * types that marker into their aliases.
 */
function creditCanJoinAProfile(artist: string | null | undefined): boolean {
  return hasKnownCreator(artist);
}

/**
 * The names one contributor can be credited under, normalized for comparison.
 *
 * The unattributed marker is dropped here as well as skipped on the row, so a
 * profile that somehow carried the alias "unknown" collects nothing rather than
 * every unattributed work in the table.
 */
function contributorArtistMatchSet(artistNames: readonly string[]): Set<string> {
  return new Set(
    artistNames.map((name) => normalizeProfileAlias(name)).filter((name) => creditCanJoinAProfile(name)),
  );
}

function replicationMatchesArtistNames(
  row: { artist: string },
  matchNames: ReadonlySet<string>,
): boolean {
  return creditCanJoinAProfile(row.artist) && matchNames.has(normalizeProfileAlias(row.artist));
}

/**
 * Match stored replications against the names that identify one contributor.
 *
 * Both sides are put through `normalizeProfileAlias` — the same function that
 * produced the stored aliases in the first place — so the two can never drift
 * into near-identical normalizations that disagree on some edge case.
 *
 * Exported for unit tests; the query below is its only production caller.
 */
export function selectReplicationsByArtistNames<Row extends { artist: string }>(
  rows: readonly Row[],
  artistNames: readonly string[],
): Row[] {
  const matchNames = contributorArtistMatchSet(artistNames);
  return matchNames.size === 0
    ? []
    : rows.filter((row) => replicationMatchesArtistNames(row, matchNames));
}

/**
 * Get every replication credited to one contributor, given the names that
 * identify them (their display name plus their aliases).
 *
 * WHY THIS SCANS INSTEAD OF USING THE `by_artist` INDEX
 * -----------------------------------------------------
 * `by_artist` indexes the raw `artist` column, so an index lookup is exact and
 * case-sensitive. Contributor aliases are stored lowercase, and a read-only audit
 * of production found only 15 of the 63 distinct `artist` strings already
 * lowercase — 20 of 247 rows, 8%. For the other 92% a lowercase alias can never
 * equal the stored string, so the index cannot serve this join at all. Matching
 * has to happen after normalizing both sides, which an equality index over the
 * raw column cannot express.
 *
 * The alternative is a stored normalized `artist` column with its own index. At
 * 247 small rows that buys nothing measurable: the scan reads the table once per
 * miss of the caller's 15-minute `unstable_cache`, and only the matched rows — a
 * handful — pay the per-row storage URL resolution. The column, by
 * contrast, costs a schema change, a migration, a second production write, and a
 * write-path invariant keeping it in sync with `artist` forever.
 *
 * Revisit that trade when the table passes a few thousand rows, or when this
 * query moves off the cached public path onto a per-request or interactive
 * surface that pays the scan on every render. Until one of those is true, the
 * index is strictly more machinery for the same answer.
 */
export const getByArtistNames = query({
  args: { artistNames: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Nothing can match, so do not pay for the scan at all.
    const matchNames = contributorArtistMatchSet(args.artistNames);
    if (matchNames.size === 0) {
      return [];
    }

    const rows = await ctx.db.query("replications").collect();
    const matched = rows.filter((row) => replicationMatchesArtistNames(row, matchNames));

    return Promise.all(
      matched.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        return {
          ...rep,
          url,
          thumbnail_url,
        };
      }),
    );
  },
});

/**
 * Get every replication for the public gallery, with storage URLs resolved and
 * a per-effect `order_index` derived from each effect's `gallery_order`.
 *
 * Powers the /effects Gallery tab, which browses replications across all
 * effects on a per-artist or per-effect basis. Returns the same URL-resolved
 * shape as getReplicationsByEffect, plus `order_index` for intra-effect order.
 */
export const getPublicReplications = query({
  args: {},
  handler: async (ctx) => {
    const replications = await ctx.db.query("replications").collect();

    // Only the effects actually referenced by replications need a gallery_order
    // lookup; resolve each by index instead of scanning the effects table.
    //
    // `effect_slug` is optional (figures and page heroes have no owning effect),
    // so unattached rows are skipped here rather than looked up: there is no
    // effect to read a `gallery_order` from, and they simply come back with an
    // undefined `order_index`, exactly as an attached row in an unordered effect
    // already does. No existing row is affected — all 247 set `effect_slug`.
    const orderByEffect = new Map<string, Map<string, number>>();
    const referencedSlugs = [
      ...new Set(replications.map((rep) => rep.effect_slug).filter((slug): slug is string => Boolean(slug))),
    ];
    for (const slug of referencedSlugs) {
      const effect = await ctx.db
        .query("subjectiveEffects")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (effect?.gallery_order && effect.gallery_order.length > 0) {
        orderByEffect.set(slug, new Map(effect.gallery_order.map((entry, index) => [entry, index])));
      }
    }

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        const order_index = rep.effect_slug
          ? orderByEffect.get(rep.effect_slug)?.get(rep.slug)
          : undefined;
        return { ...rep, url, thumbnail_url, order_index };
      }),
    );
  },
});

export const resolveStorageUrls = query({
  args: { storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    return await Promise.all(args.storageIds.map((storageId) => ctx.storage.getUrl(storageId)));
  },
});

/**
 * Generate an upload URL for file storage.
 * Used by migration scripts to upload media files.
 *
 * @param apiKey - Required API key for authentication
 */
export const generateUploadUrl = mutation({
  args: {
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Insert a single replication.
 *
 * @param apiKey - Required API key for authentication
 */
export const insertReplication = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    title: v.string(),
    artist: v.string(),
    artist_url: v.optional(v.string()),
    type: v.union(v.literal("video"), v.literal("image")),
    storage_id: v.string(),
    effect_slug: v.string(),
    thumbnail_storage_id: v.optional(v.string()),
    url: v.optional(v.string()),
    thumbnail_url: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    format: v.string(),
    file_size: v.optional(v.number()),
    duration: v.optional(v.number()),
    ...replicationRightsFields,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const { apiKey: _apiKey, ...replicationData } = args;
    const replicationId = await ctx.db.insert("replications", {
      ...replicationData,
      created_at: new Date().toISOString(),
    });
    return replicationId;
  },
});

/**
 * Insert one reviewed media asset — a replication or an explanatory figure.
 *
 * WHY THIS EXISTS ALONGSIDE `insertReplication`
 * ---------------------------------------------
 * `insertReplication` is the legacy import path: it cannot express a figure, it
 * cannot express audio, it requires an effect, and it inserts whatever it is
 * handed without checking anything but the API key. Leaving it exactly as it is
 * means no existing script can accidentally start producing figures. This is the
 * path for the 98 article-embedded assets the audit found outside the table, and
 * it fails closed instead of writing a row somebody has to hunt down later.
 *
 * `role` is REQUIRED here even though the column is optional. Absence of the
 * column means "replication" for the 247 rows that predate it; a new row must
 * say which it is rather than inherit that default by omission, so a figure can
 * never enter the gallery because a caller forgot a field.
 *
 * Refuses, rather than coerces, on:
 *  - a slug that is not kebab-case, or that is already taken (the slug is the
 *    public URL and the `gallery_order` key; a duplicate silently shadows a row)
 *  - a placeholder/blank `storage_id` with no `url` to fall back on — the row
 *    would resolve to no media at all
 *  - a `format` that is blank, dotted, or not lowercase
 *  - an `effect_slug` that does not resolve to a real effect; a dangling
 *    reference reads as an effect-less asset and is invisible to the gallery
 *  - `duration` on an image, or any non-positive dimension/size/duration
 */
export const insertMediaAsset = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    title: v.string(),
    artist: v.string(),
    artist_url: v.optional(v.string()),
    role: replicationRole,
    type: replicationMediaType,
    storage_id: v.string(),
    /** Omit for assets with no owning effect (article figures, page heroes). */
    effect_slug: v.optional(v.string()),
    thumbnail_storage_id: v.optional(v.string()),
    url: v.optional(v.string()),
    thumbnail_url: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    format: v.string(),
    file_size: v.optional(v.number()),
    duration: v.optional(v.number()),
    /** Effects this asset also depicts; see the column note in `convex/schema.ts`. */
    effect_tags: v.optional(v.array(v.string())),
    ...replicationRightsFields,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const { apiKey: _apiKey, ...row } = args;

    if (!KEBAB_CASE.test(row.slug)) {
      throw new Error(`Media asset slug is not kebab-case: ${row.slug}`);
    }
    if (row.title.trim().length === 0 || row.artist.trim().length === 0) {
      throw new Error(`Media asset ${row.slug} needs a non-blank title and artist.`);
    }

    const collision = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", row.slug))
      .first();
    if (collision) {
      throw new Error(`Media asset slug already in use: ${row.slug} (${collision._id}).`);
    }

    // A placeholder storage id is only meaningful when a direct `url` carries the
    // media instead; without one the row resolves to nothing on every surface.
    if (isPlaceholderStorageId(row.storage_id) && !row.url) {
      throw new Error(
        `Media asset ${row.slug} has no real storage_id and no url to fall back on.`,
      );
    }

    if (row.format !== row.format.trim().toLowerCase() || row.format.length === 0) {
      throw new Error(`Media asset ${row.slug} format must be lowercase and non-blank.`);
    }
    if (row.format.startsWith(".")) {
      throw new Error(`Media asset ${row.slug} format must omit the leading dot: ${row.format}`);
    }

    if (row.effect_slug !== undefined) {
      if (!KEBAB_CASE.test(row.effect_slug)) {
        throw new Error(`Media asset effect_slug is not kebab-case: ${row.effect_slug}`);
      }
      const effect = await ctx.db
        .query("subjectiveEffects")
        .withIndex("by_slug", (q) => q.eq("slug", row.effect_slug as string))
        .first();
      if (!effect) {
        throw new Error(
          `Media asset ${row.slug} points at an effect that does not exist: ${row.effect_slug}. ` +
            `Omit effect_slug for assets with no owning effect.`,
        );
      }
    }

    for (const [key, value] of [
      ["width", row.width],
      ["height", row.height],
      ["file_size", row.file_size],
      ["duration", row.duration],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error(`Media asset ${row.slug} has a non-positive ${key}: ${value}`);
      }
    }
    if (row.type === "image" && row.duration !== undefined) {
      throw new Error(`Media asset ${row.slug} is an image and cannot have a duration.`);
    }

    const effectTags = row.effect_tags ? normalizeEffectTags(row.effect_tags) : undefined;

    const id = await ctx.db.insert("replications", {
      ...row,
      effect_tags: effectTags && effectTags.length > 0 ? effectTags : undefined,
      created_at: new Date().toISOString(),
    });

    return { inserted: true, id, slug: row.slug, role: row.role };
  },
});

/**
 * Internal mutation: Bulk import replications (for migration).
 * Not exposed to clients.
 */
export const bulkImport = internalMutation({
  args: {
    replications: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        artist: v.string(),
        artist_url: v.optional(v.string()),
        type: v.union(v.literal("video"), v.literal("image")),
        storage_id: v.string(),
        effect_slug: v.string(),
        thumbnail_storage_id: v.optional(v.string()),
        url: v.optional(v.string()),
        thumbnail_url: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        format: v.string(),
        file_size: v.optional(v.number()),
        duration: v.optional(v.number()),
        ...replicationRightsFields,
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const rep of args.replications) {
      try {
        // Check if replication already exists by slug
        const existing = await ctx.db
          .query("replications")
          .withIndex("by_slug", (q) => q.eq("slug", rep.slug))
          .first();

        if (existing) {
          // Update existing replication
          await ctx.db.patch(existing._id, {
            ...rep,
            created_at: existing.created_at,
          });
          results.updated++;
        } else {
          // Create new replication
          await ctx.db.insert("replications", {
            ...rep,
            created_at: new Date().toISOString(),
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to import ${rep.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return results;
  },
});

/**
 * Update gallery order for an effect.
 * Takes an array of replication slugs in the desired order.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateGalleryOrder = mutation({
  args: {
    apiKey: v.optional(v.string()),
    effect_slug: v.string(),
    replication_slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    // Update the effect's gallery_order in subjectiveEffects
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.effect_slug))
      .first();

    if (!effect) {
      throw new Error(`Effect not found: ${args.effect_slug}`);
    }

    await ctx.db.patch(effect._id, {
      gallery_order: args.replication_slugs,
    });

    return { success: true };
  },
});

/**
 * Rename a replication's slug.
 *
 * The slug is the replication's public URL and is also how an effect's
 * `gallery_order` references it, so both move together in one transaction — a
 * rename that left `gallery_order` pointing at the old value would silently drop
 * the item out of its curated position.
 *
 * Refuses to overwrite an existing slug; the caller is expected to have already
 * resolved collisions when planning the rename.
 *
 * @param apiKey - Required API key for authentication
 */
export const renameSlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    /**
     * Which row to move when `from` is held by more than one. Without it the
     * slug lookup takes the first match, so a duplicated slug would be renamed
     * arbitrarily and its twin left behind.
     */
    id: v.optional(v.id("replications")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    if (args.from === args.to) {
      return { success: true, renamed: false, galleryOrdersPatched: 0 };
    }

    if (!KEBAB_CASE.test(args.to)) {
      throw new Error(`Target slug is not kebab-case: ${args.to}`);
    }

    const replication = args.id
      ? await ctx.db.get(args.id)
      : await ctx.db
          .query("replications")
          .withIndex("by_slug", (q) => q.eq("slug", args.from))
          .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.id ?? args.from}`);
    }

    if (replication.slug !== args.from) {
      throw new Error(
        `Replication ${replication._id} holds slug ${replication.slug}, not ${args.from}`,
      );
    }

    const collision = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.to))
      .first();

    if (collision) {
      throw new Error(`Target slug already in use: ${args.to}`);
    }

    await ctx.db.patch(replication._id, { slug: args.to });

    // Only the owning effect can reference this slug in gallery_order, but scan
    // defensively: a mis-assigned row would otherwise keep a stale reference.
    const effects = await ctx.db.query("subjectiveEffects").collect();
    let galleryOrdersPatched = 0;

    for (const effect of effects) {
      if (!effect.gallery_order?.includes(args.from)) {
        continue;
      }

      await ctx.db.patch(effect._id, {
        gallery_order: effect.gallery_order.map((slug) =>
          slug === args.from ? args.to : slug,
        ),
      });
      galleryOrdersPatched += 1;
    }

    return { success: true, renamed: true, galleryOrdersPatched };
  },
});

/**
 * Delete a replication by slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const deleteBySlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    // Delete from storage
    if (replication.storage_id) {
      try {
        // Note: Convex storage deletion is handled automatically when no documents reference the file
        // We don't need to explicitly delete from storage
      } catch (error) {
        console.error(
          `Warning: Could not delete storage file ${replication.storage_id}:`,
          error
        );
      }
    }

    // Delete from database
    await ctx.db.delete(replication._id);
    return { success: true };
  },
});

/**
 * Delete one explicitly reviewed broken or test row by exact identity. Duplicate
 * cleanup additionally proves another row with the same slug still exists.
 */
export const deleteAuditedRow = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expectedSlug: v.string(),
    expectedTitle: v.string(),
    expectedArtist: v.string(),
    expectedStorageId: v.string(),
    requireDuplicate: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const replication = await ctx.db.get(args.id);
    if (
      !replication ||
      replication.slug !== args.expectedSlug ||
      replication.title !== args.expectedTitle ||
      replication.artist !== args.expectedArtist ||
      replication.storage_id !== args.expectedStorageId
    ) {
      throw new Error(`Audited replication deletion precondition failed: ${args.expectedSlug}`);
    }
    if (args.requireDuplicate) {
      const twins = await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", args.expectedSlug))
        .collect();
      if (!twins.some((twin) => twin._id !== replication._id)) {
        throw new Error(`Audited replication duplicate no longer exists: ${args.expectedSlug}`);
      }
    }
    await ctx.db.delete(replication._id);
    return { deleted: true, slug: replication.slug };
  },
});

/**
 * Update the effect_slug for a replication by its slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateEffectSlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    effect_slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const rep = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!rep) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    await ctx.db.patch(rep._id, { effect_slug: args.effect_slug });
    return { success: true };
  },
});

/**
 * Update the URL for a replication by its _id.
 * Used by migration scripts to set direct URLs for external storage.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateUrl = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    url: v.string(),
    thumbnail_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const updates: { url: string; thumbnail_url?: string } = { url: args.url };
    if (args.thumbnail_url) {
      updates.thumbnail_url = args.thumbnail_url;
    }
    await ctx.db.patch(args.id, updates);
    return { success: true };
  },
});

/**
 * Record what the row's media actually weighs now.
 *
 * `file_size` describes the bytes a reader downloads, and the detail page prints
 * it verbatim. Repointing a row at a transcoded rendition changes those bytes
 * and nothing was updating the number, so every video row kept its master's
 * size: the corpus claimed 44.62 GB while serving roughly 5.8 GB, and the page
 * offered a 4.8 GB file that arrives in 299 MB. Wrong by a factor of sixteen and
 * wrong in the direction that makes a reader not click.
 *
 * Guarded by the storage id the caller measured against. Size is only meaningful
 * as a property of a specific stored object, so if the row has been repointed
 * since it was measured, the number in hand describes something else and the
 * write is refused rather than applied to the wrong object.
 */
export const updateDeliveredFileSize = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expectedStorageId: v.string(),
    file_size: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    if (!Number.isFinite(args.file_size) || args.file_size <= 0) {
      throw new Error("file_size must be a positive number of bytes.");
    }

    const replication = await ctx.db.get(args.id);
    if (!replication) {
      throw new Error(`Replication ${args.id} not found.`);
    }
    if (replication.storage_id !== args.expectedStorageId) {
      throw new Error(
        `Replication ${replication.slug} has been repointed since it was measured ` +
          `(expected storage ${args.expectedStorageId}, found ${replication.storage_id}).`,
      );
    }

    const previous = replication.file_size ?? null;
    await ctx.db.patch(args.id, { file_size: args.file_size });

    return { success: true, slug: replication.slug, previous, current: args.file_size };
  },
});

/**
 * Update storage IDs for a replication by its _id.
 * Used by migration scripts to point to locally uploaded media.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateStorageIds = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    storage_id: v.string(),
    thumbnail_storage_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const updates: { storage_id: string; thumbnail_storage_id?: string } = {
      storage_id: args.storage_id,
    };
    if (args.thumbnail_storage_id) {
      updates.thumbnail_storage_id = args.thumbnail_storage_id;
    }
    await ctx.db.patch(args.id, updates);
    return { success: true };
  },
});

/** Replace a reviewed source asset while failing closed if the audit is stale. */
export const applySourceRecovery = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expectedStorageId: v.string(),
    expectedSourceUrl: v.union(v.string(), v.null()),
    storageId: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const replication = await ctx.db.get(args.id);
    if (!replication) throw new Error("Replication source recovery target no longer exists.");
    if (
      replication.storage_id !== args.expectedStorageId
      || (replication.source_url ?? null) !== args.expectedSourceUrl
    ) {
      throw new Error(`Replication source recovery precondition failed: ${replication.slug}`);
    }
    await ctx.db.patch(args.id, {
      storage_id: args.storageId,
      source_url: args.sourceUrl,
    });
    return { success: true };
  },
});

/**
 * Atomically transfer native storage to an assigned-effect row and remove its
 * audited unknown-effect twin. Exact IDs and expected values make reruns fail
 * closed if either row changed after the dry run.
 */
export const mergeUnknownTwin = mutation({
  args: {
    apiKey: v.optional(v.string()),
    keeperId: v.id("replications"),
    duplicateId: v.id("replications"),
    expectedSlug: v.string(),
    expectedKeeperEffectSlug: v.string(),
    expectedDuplicateStorageId: v.string(),
    duplicateThumbnailStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const keeper = await ctx.db.get(args.keeperId);
    const duplicate = await ctx.db.get(args.duplicateId);
    if (!keeper || !duplicate) {
      throw new Error("Replication merge rows no longer exist");
    }
    if (
      keeper.slug !== args.expectedSlug ||
      duplicate.slug !== args.expectedSlug ||
      keeper.effect_slug !== args.expectedKeeperEffectSlug ||
      duplicate.effect_slug !== "unknown" ||
      duplicate.storage_id !== args.expectedDuplicateStorageId ||
      !keeper.storage_id.startsWith("placeholder-")
    ) {
      throw new Error(`Replication merge precondition failed: ${args.expectedSlug}`);
    }
    if (
      args.duplicateThumbnailStorageId !== undefined &&
      duplicate.thumbnail_storage_id !== args.duplicateThumbnailStorageId
    ) {
      throw new Error(`Replication thumbnail precondition failed: ${args.expectedSlug}`);
    }

    await ctx.db.patch(keeper._id, {
      storage_id: duplicate.storage_id,
      ...(args.duplicateThumbnailStorageId
        ? { thumbnail_storage_id: args.duplicateThumbnailStorageId }
        : {}),
    });
    await ctx.db.delete(duplicate._id);

    return { merged: true };
  },
});

/**
 * Apply one reviewed title/creator correction to an exact row. The complete
 * current credit snapshot is compared before patching so stale proposals fail
 * closed and duplicate slugs cannot redirect a correction to the wrong row.
 */
export const applyProvenanceCorrection = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expected: replicationCreditSnapshot,
    updates: replicationCreditUpdates,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db.get(args.id);
    if (!replication) {
      throw new Error("Replication provenance row no longer exists");
    }

    const current = {
      title: replication.title,
      artist: replication.artist,
      artist_url: replication.artist_url ?? null,
      credit_line: replication.credit_line ?? null,
      source_url: replication.source_url ?? null,
      rightsholder: replication.rightsholder ?? null,
    };
    const snapshotMatches =
      current.title === args.expected.title &&
      current.artist === args.expected.artist &&
      current.artist_url === args.expected.artist_url &&
      current.credit_line === args.expected.credit_line &&
      current.source_url === args.expected.source_url &&
      current.rightsholder === args.expected.rightsholder;
    if (!snapshotMatches) {
      throw new Error(`Replication provenance precondition failed: ${replication.slug}`);
    }

    await ctx.db.patch(replication._id, args.updates);
    return { updated: true, slug: replication.slug };
  },
});

/**
 * Update rights and credit metadata for a replication by slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateRightsMetadata = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    updates: v.object(replicationRightsFields),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    const patch = definedReplicationRightsPatch(args.updates);
    if (Object.keys(patch).length === 0) {
      return { success: true, updated: false };
    }

    await ctx.db.patch(replication._id, patch);
    return { success: true, updated: true };
  },
});

/* ------------------------------------------------------------------------- *
 * Replication Studio (`/dev` → Replications)
 *
 * The studio browses and edits the whole media table from one screen, so these
 * three functions are shaped around that screen rather than around a script:
 * one read that returns everything the grid draws, one guarded single-row edit,
 * and one guarded bulk edit. All three take the `replicationMaintenance` intent
 * like the maintenance mutations above them.
 * ------------------------------------------------------------------------- */

/**
 * The columns the studio's editor owns. Rights beyond the credit line, storage
 * pointers, dimensions, and the slug are deliberately absent: the slug is the
 * public URL and the `gallery_order` key (rename it through `renameSlug`), and
 * the rest belong to the import/maintenance scripts that measured them.
 */
const replicationEditorialSnapshot = v.object({
  title: v.string(),
  artist: v.string(),
  /** Resolved, never absent — callers send `role ?? "replication"`. */
  role: replicationRole,
  effect_slug: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  effect_tags: v.array(v.string()),
});

type ReplicationEditorialSnapshot = {
  title: string;
  artist: string;
  role: "replication" | "figure";
  effect_slug: string | null;
  credit_line: string | null;
  effect_tags: string[];
};

/** How many rows one bulk apply may touch, so a stray select-all cannot run away. */
const BULK_EDIT_LIMIT = 250;
/** How many effects one asset may be tagged with before the tag list stops being a description. */
const MAX_EFFECT_TAGS = 24;

function editorialSnapshotOf(row: {
  title: string;
  artist: string;
  role?: "replication" | "figure";
  effect_slug?: string;
  credit_line?: string;
  effect_tags?: string[];
}): ReplicationEditorialSnapshot {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role ?? "replication",
    effect_slug: row.effect_slug ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: [...(row.effect_tags ?? [])].sort(),
  };
}

function editorialSnapshotsAgree(
  a: ReplicationEditorialSnapshot,
  b: ReplicationEditorialSnapshot,
): boolean {
  return (
    a.title === b.title
    && a.artist === b.artist
    && a.role === b.role
    && a.effect_slug === b.effect_slug
    && a.credit_line === b.credit_line
    && a.effect_tags.length === b.effect_tags.length
    && a.effect_tags.every((tag, index) => tag === b.effect_tags[index])
  );
}

/**
 * Effect tags are effect slugs, deduplicated and sorted so two rows tagged with
 * the same effects compare equal — the compare-and-swap guard above depends on
 * that, and so does anything that later groups by tag set.
 */
function normalizeEffectTags(tags: readonly string[]): string[] {
  const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
  for (const tag of normalized) {
    if (!KEBAB_CASE.test(tag)) {
      throw new Error(`Effect tag is not an effect slug: ${tag}`);
    }
  }
  if (normalized.length > MAX_EFFECT_TAGS) {
    throw new Error(`An asset may carry at most ${MAX_EFFECT_TAGS} effect tags (got ${normalized.length}).`);
  }
  return normalized;
}

async function assertEffectExists(ctx: QueryCtx | MutationCtx, slug: string, context: string) {
  if (!KEBAB_CASE.test(slug)) {
    throw new Error(`${context}: effect slug is not kebab-case: ${slug}`);
  }
  const effect = await ctx.db
    .query("subjectiveEffects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (!effect) {
    throw new Error(`${context}: effect does not exist: ${slug}`);
  }
}

/**
 * Every stored media row, with storage URLs resolved and the owning effect's
 * display name attached, for the `/dev` Replication Studio.
 *
 * Unlike `getPublicReplications` this keeps figures and effect-less rows: the
 * studio's whole job is to find and fix the rows the public surfaces skip, so
 * hiding them here would hide exactly the work. It is authenticated because it
 * is an editorial read of the whole table, not a public projection.
 */
export const getStudioRows = query({
  args: { apiKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const rows = await ctx.db.query("replications").collect();
    const effects = await ctx.db.query("subjectiveEffects").collect();
    const effectNames = new Map(effects.map((effect) => [effect.slug, effect.name ?? effect.slug]));

    const resolved = await Promise.all(
      rows.map(async (row) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, row);
        return {
          id: row._id,
          slug: row.slug,
          title: row.title,
          artist: row.artist,
          artist_url: row.artist_url ?? null,
          role: row.role ?? ("replication" as const),
          type: row.type,
          effect_slug: row.effect_slug ?? null,
          effect_name: row.effect_slug ? effectNames.get(row.effect_slug) ?? row.effect_slug : null,
          effect_tags: row.effect_tags ?? [],
          credit_line: row.credit_line ?? null,
          rights_status: row.rights_status ?? null,
          source_url: row.source_url ?? null,
          rightsholder: row.rightsholder ?? null,
          url,
          thumbnail_url,
          format: row.format,
          duration: row.duration ?? null,
          file_size: row.file_size ?? null,
          created_at: row.created_at,
        };
      }),
    );

    return {
      rows: resolved,
      effects: effects
        .map((effect) => ({ slug: effect.slug, name: effect.name ?? effect.slug }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/**
 * Save the studio's single-row editor.
 *
 * Guarded by the caller's `expected` snapshot rather than by row identity alone:
 * the studio holds a whole-table read in memory while the editor is open, so a
 * stale drawer would otherwise re-assert every field it had loaded and quietly
 * undo somebody else's edit. A drifted row is refused, not merged.
 */
export const updateEditorialFields = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expected: replicationEditorialSnapshot,
    updates: replicationEditorialSnapshot,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const row = await ctx.db.get(args.id);
    if (!row) {
      throw new Error(`Replication ${args.id} no longer exists.`);
    }

    const current = editorialSnapshotOf(row);
    const expected = { ...args.expected, effect_tags: [...args.expected.effect_tags].sort() };
    if (!editorialSnapshotsAgree(current, expected)) {
      throw new Error(
        `Replication ${row.slug} changed since it was opened; reload the studio before saving.`,
      );
    }

    const title = args.updates.title.trim();
    const artist = args.updates.artist.trim();
    if (!title || !artist) {
      throw new Error(`Replication ${row.slug} needs a non-blank title and artist.`);
    }
    if (args.updates.effect_slug !== null) {
      await assertEffectExists(ctx, args.updates.effect_slug, `Replication ${row.slug}`);
    }
    const effectTags = normalizeEffectTags(args.updates.effect_tags);
    const creditLine = args.updates.credit_line?.trim() ?? "";

    await ctx.db.patch(args.id, {
      title,
      artist,
      role: args.updates.role,
      effect_slug: args.updates.effect_slug ?? undefined,
      credit_line: creditLine.length > 0 ? creditLine : undefined,
      effect_tags: effectTags.length > 0 ? effectTags : undefined,
    });

    return { success: true, slug: row.slug };
  },
});

/**
 * Apply one shared change to several rows — the studio's bulk toolbar.
 *
 * Every field is optional and an omitted field means "leave it alone", so a
 * bulk apply can never blank a column it was not asked about. Tags are added,
 * never replaced: the selection's rows generally differ in what they already
 * depict, and replacing would discard work the selection did not intend.
 */
export const bulkUpdateEditorialFields = mutation({
  args: {
    apiKey: v.optional(v.string()),
    ids: v.array(v.id("replications")),
    effect_slug: v.optional(v.string()),
    artist: v.optional(v.string()),
    role: v.optional(replicationRole),
    addEffectTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    if (args.ids.length === 0) {
      throw new Error("A bulk edit needs at least one row.");
    }
    if (args.ids.length > BULK_EDIT_LIMIT) {
      throw new Error(`A bulk edit may touch at most ${BULK_EDIT_LIMIT} rows (got ${args.ids.length}).`);
    }

    const artist = args.artist?.trim();
    if (args.artist !== undefined && !artist) {
      throw new Error("A bulk artist change needs a non-blank artist.");
    }
    if (args.effect_slug !== undefined) {
      await assertEffectExists(ctx, args.effect_slug, "Bulk edit");
    }
    const addTags = args.addEffectTags ? normalizeEffectTags(args.addEffectTags) : [];

    if (
      args.effect_slug === undefined
      && artist === undefined
      && args.role === undefined
      && addTags.length === 0
    ) {
      throw new Error("A bulk edit needs at least one field to change.");
    }

    const updatedSlugs: string[] = [];
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (!row) {
        throw new Error(`Replication ${id} no longer exists; reload the studio before applying.`);
      }

      const nextTags = addTags.length > 0
        ? normalizeEffectTags([...(row.effect_tags ?? []), ...addTags])
        : row.effect_tags;

      await ctx.db.patch(id, {
        ...(args.effect_slug !== undefined ? { effect_slug: args.effect_slug } : {}),
        ...(artist ? { artist } : {}),
        ...(args.role !== undefined ? { role: args.role } : {}),
        ...(addTags.length > 0 ? { effect_tags: nextTags } : {}),
      });
      updatedSlugs.push(row.slug);
    }

    return { success: true, updated: updatedSlugs.length, slugs: updatedSlugs };
  },
});

/**
 * Internal mutation: Delete all replications (for re-migration).
 * Not exposed to clients.
 */
export const deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allReplications = await ctx.db.query("replications").collect();

    for (const rep of allReplications) {
      await ctx.db.delete(rep._id);
    }

    return { deleted: allReplications.length };
  },
});
