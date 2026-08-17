import type { QueryCtx } from "../_generated/server";
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
  storage_id: string;
  thumbnail_storage_id?: string;
  preview_storage_id?: string;
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
