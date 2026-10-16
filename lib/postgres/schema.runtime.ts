import { bigint, bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const documentIds = pgTable(
  "documentIds",
  {
    _id: text("_id").primaryKey(),
    table: text("table").notNull(),
  },
  (t) => [index("documentIds_by_table").on(t.table)],
);

export const storageObjects = pgTable("storageObjects", {
  storage_id: text("storage_id").primaryKey(),
  url: text("url").notNull(),
  content_type: text("content_type"),
  size: bigint("size", { mode: "number" }),
  sha256: text("sha256"),
  r2_key: text("r2_key"),
});

export const translationSegments = pgTable(
  "translationSegments",
  {
    locale: text("locale").notNull(),
    hash: text("hash").notNull(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    model: text("model").notNull(),
    prompt_version: text("prompt_version").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.hash] }), index("translationSegments_by_prompt").on(t.locale, t.prompt_version)],
);

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
    mode: text("mode").notNull().default("incremental"),
    run_id: text("run_id"),
    terminal_status: text("terminal_status"),
    next_attempt_at: bigint("next_attempt_at", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.locale, t.slug, t.mode] }),
    index("translationJobs_due").on(t.mode, t.locale, t.completed_at, t.claimed_at),
    index("translationJobs_run").on(t.run_id, t.completed_at),
  ],
);

export const translationWorkerLeases = pgTable("translationWorkerLeases", {
  mode: text("mode").primaryKey(),
  owner: text("owner").notNull(),
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
});

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
    exhausted: integer("exhausted").notNull(),
    cache_pending: integer("cache_pending").notNull(),
    prompt_tokens: bigint("prompt_tokens", { mode: "number" }).notNull(),
    completion_tokens: bigint("completion_tokens", { mode: "number" }).notNull(),
    requests: integer("requests").notNull(),
    first_error: text("first_error"),
  },
  (t) => [index("translationWorkerRuns_by_mode").on(t.mode, t.started_at)],
);

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

export const translationRejections = pgTable(
  "translationRejections",
  {
    locale: text("locale").notNull(),
    hash: text("hash").notNull(),
    source: text("source").notNull(),
    defects: text("defects").notNull(),
    attempts: integer("attempts").notNull().default(1),
    last_tried_at: bigint("last_tried_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.hash] })],
);

export const translationGlossary = pgTable(
  "translationGlossary",
  {
    locale: text("locale").notNull(),
    term: text("term").notNull(),
    target: text("target").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    reviewed_at: bigint("reviewed_at", { mode: "number" }),
    reviewed_by: text("reviewed_by"),
    retranslated_at: bigint("retranslated_at", { mode: "number" }),
    retranslation_requested_at: bigint("retranslation_requested_at", { mode: "number" }),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.locale, t.term] }), index("translationGlossary_by_status").on(t.locale, t.status)],
);

export const translationGlossaryTerms = pgTable("translationGlossaryTerms", {
  term: text("term").primaryKey(),
  kind: text("kind").notNull(),
  gloss: text("gloss").notNull(),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  updated_by: text("updated_by"),
});

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

export const localizedPublicationIndexState = pgTable("localizedPublicationIndexState", {
  key: text("key").primaryKey(),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
});

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

export const translationReviewEntries = pgTable("translationReviewEntries", {
  locale: text("locale").notNull(),
  scope: text("scope").notNull(),
  source_id: text("source_id").notNull(),
  revision: integer("revision").notNull(),
  draft: jsonb("draft"),
  approved: jsonb("approved"),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
}, (t) => [primaryKey({ columns: [t.locale, t.scope, t.source_id] })]);

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

export const translationSegmentHistory = pgTable("translationSegmentHistory", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  locale: text("locale").notNull(),
  hash: text("hash").notNull(),
  before_state: jsonb("before_state"),
  after_state: jsonb("after_state").notNull(),
  created_at: bigint("created_at", { mode: "number" }).notNull(),
}, (t) => [index("translationSegmentHistory_by_locale").on(t.locale, t.id), index("translationSegmentHistory_by_hash").on(t.locale, t.hash, t.id)]);
