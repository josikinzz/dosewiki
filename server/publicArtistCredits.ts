import { query } from "../lib/postgres/runtime/server";
import { memoizedStorageUrls, resolveReplicationUrls } from "./lib/replicationUrls";

export const getRows = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.getPublicArtistCreditRows();
    const urls = memoizedStorageUrls(ctx);
    const resolved = await Promise.all(rows.map(async (row) => {
      const { url } = await resolveReplicationUrls(urls, {
        storage_id: row.storage_id ?? "", r2_key: row.r2_key, url: row.url,
      });
      return url ? { artist: row.artist, artist_url: row.artist_url, effect_slug: row.effect_slug, url } : null;
    }));
    return resolved.filter((row) => row !== null);
  },
});
