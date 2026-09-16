import { query } from "../lib/postgres/runtime/server";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { memoizedStorageUrls, resolveReplicationUrls } from "./lib/replicationUrls";

/** Artist destinations need corpus-wide existence, not effect membership. */
export const getRows = query({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicArtistCreditRows: () => Promise<Doc<"replications">[]>;
    };
    const rows = await db.getPublicArtistCreditRows();
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
