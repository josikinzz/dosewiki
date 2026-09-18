/**
 * Runtime-owned tables alongside the generated application document tables.
 * Hand-written; `drizzle.config.ts` loads this next to `schema.generated.ts`.
 */
import { bigint, boolean, doublePrecision, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/** Resolve document ids to tables without depending on a particular id encoding. */
export const documentIds = pgTable(
  "documentIds",
  {
    _id: text("_id").primaryKey(),
    table: text("table").notNull(),
  },
  (t) => [index("documentIds_by_table").on(t.table)],
);

/** Object-storage manifest in R2; `ctx.storage.getUrl` reads `url`. */
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

/**
 * The reviewed term list one locale's prompts are held to. A row is drafted by
 * the model (`source` model, `status` draft) or written by a reviewer in the
 * Glossary tab (`source` human); only approved rows reach a prompt and the
 * prompt digest. Owned by lib/translation/glossary.ts.
 */
export const translationGlossary = pgTable(
  "translationGlossary",
  {
    locale: text("locale").notNull(),
    term: text("term").notNull(),
    target: text("target").notNull(),
    /** Where the term came from: effect-name, effect-category, chemical-class, psychoactive-class, frequency, enum:<group>, register, and the site vocabularies the drafter enumerates (replication, site-name, index-name, effect-subcategory, section-heading, route, reagent-name, chemical-class-alias). */
    kind: text("kind").notNull(),
    /** draft | approved */
    status: text("status").notNull(),
    /** model | human */
    source: text("source").notNull(),
    reviewed_at: bigint("reviewed_at", { mode: "number" }),
    reviewed_by: text("reviewed_by"),
    /**
     * When this rendering was last pushed to stored segments: by a scoped
     * retranslate naming the term, or by the locale's main translation. An
     * approved row reviewed after this stamp is waiting for a retranslate, and
     * that set is what the Glossary tab offers to send, so the queue survives
     * a reload, a locale switch, and another reviewer's machine.
     */
    retranslated_at: bigint("retranslated_at", { mode: "number" }),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.term] }), index("translationGlossary_by_status").on(t.locale, t.status)],
);

/**
 * One English definition per glossary term, shared by every locale: what the
 * term is, where it appears on the site, and the contrast that matters when
 * rendering it. Injected beside the approved rendering in every translation
 * prompt that mentions the term, shown under the term in the Glossary tab and
 * on the public /glossary page. Owned by lib/translation/glossaryGloss.ts.
 */
export const translationGlossaryTerms = pgTable("translationGlossaryTerms", {
  term: text("term").primaryKey(),
  kind: text("kind").notNull(),
  gloss: text("gloss").notNull(),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  updated_by: text("updated_by"),
});

/** Exact library-index projections, rebuilt by English and hash-overlay producers. */
export const localizedPublicationIndexes = pgTable(
  "localizedPublicationIndexes",
  {
    locale: text("locale").notNull(),
    publication_id: text("publication_id").notNull(),
    source_revision: text("source_revision").notNull(),
    overlay_revision: text("overlay_revision"),
    dependency_hashes: text("dependency_hashes").array().notNull().default([]),
    dirty: boolean("dirty").notNull().default(true),
    title: text("title"),
    short_description: text("short_description"),
    index_description: text("index_description"),
    read_minutes: integer("read_minutes"),
  },
  (t) => [primaryKey({ columns: [t.locale, t.publication_id] })],
);

/** A shared write epoch makes producer snapshot races fail under SERIALIZABLE. */
export const localizedPublicationIndexState = pgTable("localizedPublicationIndexState", {
  key: text("key").primaryKey(),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
});

/** Durable signup budgets, keyed by HMAC IP hash or the empty global key. */
export const subscribeRateLimitBuckets = pgTable(
  "subscribeRateLimitBuckets",
  {
    name: text("name").notNull(),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
    ts: doublePrecision("ts").notNull(),
    expires_at: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.name, t.key] }),
    index("subscribeRateLimitBuckets_by_expiry").on(t.expires_at),
  ],
);
