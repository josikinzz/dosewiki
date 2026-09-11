/**
 * Tables owned by the Postgres runtime rather than mirrored from Convex.
 * Hand-written; `drizzle.config.ts` loads this next to `schema.generated.ts`.
 */
import { bigint, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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

/**
 * One machine-translated segment per (locale, source hash). The hash is
 * `scripts/translation/segment-manifest.mjs` `segmentHash` of the English
 * text, so identical sentences anywhere in the corpus share one row and an
 * edited sentence simply misses until the refresh cron fills it.
 */
export const translationSegments = pgTable(
  "translationSegments",
  {
    locale: text("locale").notNull(),
    hash: text("hash").notNull(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    model: text("model").notNull(),
    /** Digest of the system prompt and glossary that produced `target`; a bumped prompt is retranslated deliberately, never silently. */
    prompt_version: text("prompt_version").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.hash] }), index("translationSegments_by_prompt").on(t.locale, t.prompt_version)],
);

/**
 * Outbox of articles whose English moved since their locale was last
 * assembled. Editorial writes upsert a row; the translation cron claims due
 * rows with a lease and clears them once every missing segment is stored.
 */
export const translationJobs = pgTable(
  "translationJobs",
  {
    locale: text("locale").notNull(),
    slug: text("slug").notNull(),
    requested_at: bigint("requested_at", { mode: "number" }).notNull(),
    claimed_at: bigint("claimed_at", { mode: "number" }),
    completed_at: bigint("completed_at", { mode: "number" }),
    attempts: integer("attempts").notNull().default(0),
    last_error: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.locale, t.slug] }), index("translationJobs_due").on(t.locale, t.completed_at, t.claimed_at)],
);

/**
 * Segments the model could not render within the blocking checks. A row here
 * explains an English leaf on a mirror page; the next refresh retries it and
 * a stored translation deletes it. Owned by lib/translation/segmentStore.ts.
 */
export const translationRejections = pgTable(
  "translationRejections",
  {
    locale: text("locale").notNull(),
    hash: text("hash").notNull(),
    source: text("source").notNull(),
    /** Comma-joined defect codes from the last attempt, e.g. NUMBER_MISMATCH,SCRIPT_LEAK. */
    defects: text("defects").notNull(),
    attempts: integer("attempts").notNull().default(1),
    last_tried_at: bigint("last_tried_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.hash] })],
);
