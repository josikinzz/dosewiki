/**
 * Runtime-owned tables alongside the generated application document tables.
 * Hand-written; `drizzle.config.ts` loads this next to `schema.generated.ts`.
 */
import { bigint, bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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
    /** incremental for editorial freshness, bulk for an operator-started corpus run. */
    mode: text("mode").notNull().default("incremental"),
    /** Stable identity shared by every record in one operator-started bulk run. */
    run_id: text("run_id"),
    /** null | rejected; machine-readable terminal outcome, separate from operator prose. */
    terminal_status: text("terminal_status"),
    /** A failed job is not claimed again before this time; null means due now. */
    next_attempt_at: bigint("next_attempt_at", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.locale, t.slug, t.mode] }),
    index("translationJobs_due").on(t.mode, t.locale, t.completed_at, t.claimed_at),
    index("translationJobs_run").on(t.run_id, t.completed_at),
  ],
);

/** One database lease per model prevents overlapping cron invocations. */
export const translationWorkerLeases = pgTable("translationWorkerLeases", {
  mode: text("mode").primaryKey(),
  owner: text("owner").notNull(),
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
});

/**
 * One summary row per translation worker invocation, including a run that
 * lost its lease, so a blocked or failing lane is visible from SQL. Owned by
 * lib/translation/segmentStore.ts, which prunes rows past the retention window.
 */
export const translationWorkerRuns = pgTable(
  "translationWorkerRuns",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    lease_held: boolean("lease_held").notNull(),
    started_at: bigint("started_at", { mode: "number" }).notNull(),
    duration_ms: integer("duration_ms").notNull(),
    claimed: integer("claimed").notNull(),
    completed: integer("completed").notNull(),
    failed: integer("failed").notNull(),
    /** Failures that used the job's last attempt; the job leaves the queue until the record changes again. */
    exhausted: integer("exhausted").notNull(),
    cache_pending: integer("cache_pending").notNull(),
    prompt_tokens: bigint("prompt_tokens", { mode: "number" }).notNull(),
    completion_tokens: bigint("completion_tokens", { mode: "number" }).notNull(),
    requests: integer("requests").notNull(),
    first_error: text("first_error"),
  },
  (t) => [index("translationWorkerRuns_by_mode").on(t.mode, t.started_at)],
);

/**
 * Retired. This was a second delivery queue for translation completions; they
 * now enqueue into the publication outbox (`publicCachePublications`, policy in
 * `lib/next/publicationOutbox.ts`) in the completion transaction. No code reads
 * or writes this table. It stays defined so no generated migration drops it:
 * rows left from before the change are kept for inspection, and dropping the
 * table needs its own reviewed migration once they are confirmed inert.
 */
export const translationCacheJobs = pgTable(
  "translationCacheJobs",
  {
    locale: text("locale").notNull(),
    slug: text("slug").notNull(),
    mode: text("mode").notNull(),
    targets: text("targets").notNull(),
    requested_at: bigint("requested_at", { mode: "number" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    next_attempt_at: bigint("next_attempt_at", { mode: "number" }),
    last_error: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.locale, t.slug, t.mode] }), index("translationCacheJobs_due").on(t.requested_at)],
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
    retranslation_requested_at: bigint("retranslation_requested_at", { mode: "number" }),
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

/** Review workspace: editing a draft never replaces the approved rendering. */
export const translationReviewEntries = pgTable("translationReviewEntries", {
  locale: text("locale").notNull(),
  scope: text("scope").notNull(),
  source_id: text("source_id").notNull(),
  revision: integer("revision").notNull(),
  draft: jsonb("draft"),
  approved: jsonb("approved"),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => [primaryKey({ columns: [t.locale, t.scope, t.source_id] })]);

/** Append-only application history, atomically inserted beside every revision. */
export const translationReviewHistory = pgTable("translationReviewHistory", {
  locale: text("locale").notNull(),
  scope: text("scope").notNull(),
  source_id: text("source_id").notNull(),
  revision: integer("revision").notNull(),
  action: text("action").notNull(),
  before_state: jsonb("before_state").notNull(),
  after_state: jsonb("after_state").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [primaryKey({ columns: [t.locale, t.scope, t.source_id, t.revision] })]);

/** Automatic segment replacements, retained before the current overlay is updated. */
export const translationSegmentHistory = pgTable("translationSegmentHistory", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  locale: text("locale").notNull(),
  hash: text("hash").notNull(),
  before_state: jsonb("before_state"),
  after_state: jsonb("after_state").notNull(),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [index("translationSegmentHistory_by_locale").on(t.locale, t.id), index("translationSegmentHistory_by_hash").on(t.locale, t.hash, t.id)]);
