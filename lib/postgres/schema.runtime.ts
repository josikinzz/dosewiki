/**
 * Tables owned by the Postgres runtime rather than mirrored from Convex.
 * Hand-written; `drizzle.config.ts` loads this next to `schema.generated.ts`.
 */
import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";

/** Convex ids do not name their table in a decodable way, so `db.get(id)` resolves through this map. */
export const documentIds = pgTable(
  "documentIds",
  {
    _id: text("_id").primaryKey(),
    table: text("table").notNull(),
  },
  (t) => [index("documentIds_by_table").on(t.table)],
);

/** Convex `_storage` objects after their bytes move to R2 (ticket 11); `ctx.storage.getUrl` reads `url`. */
export const storageObjects = pgTable("storageObjects", {
  storage_id: text("storage_id").primaryKey(),
  url: text("url").notNull(),
  content_type: text("content_type"),
  size: bigint("size", { mode: "number" }),
  sha256: text("sha256"),
  r2_key: text("r2_key"),
});
