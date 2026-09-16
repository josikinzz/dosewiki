import type { QueryCtx } from "../../lib/postgres/runtime/server"
import type { Doc } from "../../lib/postgres/runtime/dataModel";
import { normalizeProfileAlias } from "../../lib/contributorProfileIdentity";
import { hasKnownCreator } from "../../src/features/effects/components/replicationCredit";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";

function contributorArtistMatchSet(artistNames: readonly string[]): Set<string> {
  return new Set(
    artistNames
      .map((name) => normalizeProfileAlias(name))
      .filter((name) => hasKnownCreator(name)),
  );
}

function replicationMatchesArtistNames(
  row: { artist: string },
  matchNames: ReadonlySet<string>,
): boolean {
  return hasKnownCreator(row.artist) && matchNames.has(normalizeProfileAlias(row.artist));
}

/** Match stored credits against a contributor's normalized display name and aliases. */
export function selectReplicationsByArtistNames<Row extends { artist: string }>(
  rows: readonly Row[],
  artistNames: readonly string[],
): Row[] {
  const matchNames = contributorArtistMatchSet(artistNames);
  return matchNames.size === 0
    ? []
    : rows.filter((row) => replicationMatchesArtistNames(row, matchNames));
}

type ResolvableReplication = {
  storage_id?: string;
  thumbnail_storage_id?: string;
  preview_storage_id?: string;
  motion_storage_id?: string;
  motion_poster_storage_id?: string;
  url?: string;
  thumbnail_url?: string;
};

async function resolveRows<Row extends ResolvableReplication>(
  ctx: QueryCtx,
  rows: Row[],
) {
  const urls = memoizedStorageUrls(ctx);
  return Promise.all(
    rows.map(async (row) => {
      const resolved = await resolveReplicationUrls(urls, row);
      return { ...row, ...resolved };
    }),
  );
}

const PUBLIC_SLUG_BATCH_LIMIT = 100;

/**
 * Resolve a small, caller-ordered shortlist in one native query. The database
 * retains the by_slug index's first-row semantics for duplicate stored slugs.
 */
export async function getBySlugsHandler(
  ctx: QueryCtx,
  args: { slugs: string[] },
) {
  const slugs = [...new Set(args.slugs)];
  if (slugs.length > PUBLIC_SLUG_BATCH_LIMIT) {
    throw new Error(`getBySlugs accepts at most ${PUBLIC_SLUG_BATCH_LIMIT} slugs`);
  }

  const db = ctx.db as typeof ctx.db & {
    getReplicationsBySlugs: (slugs: readonly string[]) => Promise<Doc<"replications">[]>;
  };
  const selected = await db.getReplicationsBySlugs(slugs);
  const bySlug = new Map(selected.map((row) => [row.slug, row]));
  const rows: Doc<"replications">[] = [];
  for (const slug of slugs) {
    const found = bySlug.get(slug);
    if (found) rows.push(found);
  }
  const resolved = await resolveRows(ctx, rows);

  return resolved.flatMap((row) => {
    if (!row.url) return [];
    const {
      thumbnail_url,
      preview_url,
      motion_url,
      motion_poster_url,
      ...stored
    } = row;
    return [
      {
        ...stored,
        url: row.url,
        ...(thumbnail_url ? { thumbnail_url } : {}),
        ...(preview_url ? { preview_url } : {}),
        ...(motion_url ? { motion_url } : {}),
        ...(motion_poster_url ? { motion_poster_url } : {}),
      },
    ];
  });
}

export async function getAllHandler(ctx: QueryCtx) {
  return await ctx.db.query("replications").collect();
}

export async function getBySlugHandler(ctx: QueryCtx, args: { slug: string }) {
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) return null;

  const resolved = await resolveReplicationUrls(ctx, replication);
  return { ...replication, ...resolved };
}

export async function getReplicationsByEffectHandler(
  ctx: QueryCtx,
  args: { effect_slug: string },
) {
  const replications = await ctx.db
    .query("replications")
    .withIndex("by_effect", (q) => q.eq("effect_slug", args.effect_slug))
    .collect();
  return await resolveRows(ctx, replications);
}

export async function getByArtistHandler(ctx: QueryCtx, args: { artist: string }) {
  const replications = await ctx.db
    .query("replications")
    .withIndex("by_artist", (q) => q.eq("artist", args.artist))
    .collect();
  return await resolveRows(ctx, replications);
}

export async function getByArtistNamesHandler(
  ctx: QueryCtx,
  args: { artistNames: string[] },
) {
  const matchNames = contributorArtistMatchSet(args.artistNames);
  if (matchNames.size === 0) return [];

  const rows = await ctx.db.query("replications").collect();
  const matched = rows.filter((row) => replicationMatchesArtistNames(row, matchNames));
  return await resolveRows(ctx, matched);
}

const PUBLIC_CONTRIBUTOR_REPLICATION_SCAN_LIMIT = 64;

function clampContributorReplicationScanLimit(requested?: number): number {
  const normalized = typeof requested === "number" && Number.isFinite(requested)
    ? Math.floor(requested)
    : PUBLIC_CONTRIBUTOR_REPLICATION_SCAN_LIMIT;
  return Math.min(
    Math.max(normalized, 1),
    PUBLIC_CONTRIBUTOR_REPLICATION_SCAN_LIMIT,
  );
}

/**
 * Scan one bounded storage-ordered page and return only rows credited to the
 * contributor. Filtering can make a page sparse, so callers must follow the
 * returned opaque cursor until `isDone` rather than treating an empty `items`
 * array as the end of the contributor's works.
 */
export async function getByArtistNamesPageHandler(
  ctx: QueryCtx,
  args: { artistNames: string[]; cursor?: string; limit?: number },
) {
  const matchNames = contributorArtistMatchSet(args.artistNames);
  if (matchNames.size === 0) {
    return { items: [], cursor: "", isDone: true };
  }

  const result = await ctx.db.query("replications").paginate({
    cursor: args.cursor ?? null,
    numItems: clampContributorReplicationScanLimit(args.limit),
  });
  const matched = result.page.filter((row) =>
    replicationMatchesArtistNames(row, matchNames),
  );

  return {
    items: await resolveRows(ctx, matched),
    cursor: result.continueCursor,
    isDone: result.isDone,
  };
}

export async function getPublicReplicationsHandler(ctx: QueryCtx) {
  const replications = await ctx.db.query("replications").collect();
  const orderByEffect = new Map<string, Map<string, number>>();
  const referencedSlugs = [
    ...new Set(
      replications
        .map((replication) => replication.effect_slug)
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];

  for (const slug of referencedSlugs) {
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (effect?.gallery_order && effect.gallery_order.length > 0) {
      orderByEffect.set(
        slug,
        new Map(effect.gallery_order.map((entry, index) => [entry, index])),
      );
    }
  }

  const urls = memoizedStorageUrls(ctx);
  return Promise.all(
    replications.map(async (replication) => {
      const resolved = await resolveReplicationUrls(urls, replication);
      const order_index = replication.effect_slug
        ? orderByEffect.get(replication.effect_slug)?.get(replication.slug)
        : undefined;
      return { ...replication, ...resolved, order_index };
    }),
  );
}

export async function resolveStorageUrlsHandler(
  ctx: QueryCtx,
  args: { storageIds: string[] },
) {
  return await Promise.all(
    args.storageIds.map((storageId) => ctx.storage.getUrl(storageId)),
  );
}
