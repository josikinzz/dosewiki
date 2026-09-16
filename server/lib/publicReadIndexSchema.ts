import { defineTable } from "../../lib/postgres/runtime/schema";
import { v } from "../../lib/postgres/runtime/values";
import { replication } from "./effectMediaSchemaValidators";

/** Only placement-policy inputs. Never copy media evidence or URL payloads. */
export const galleryMatchFields = {
  slug: replication.fields.slug,
  title: replication.fields.title,
  type: replication.fields.type,
  role: replication.fields.role,
  effect_slug: replication.fields.effect_slug,
  title_drugs: replication.fields.title_drugs,
  title_class_mentions: replication.fields.title_class_mentions,
  showcase_excluded: replication.fields.showcase_excluded,
  replication_status: replication.fields.replication_status,
  publication_state: replication.fields.publication_state,
};

export const publicReadIndexName = v.union(
  v.literal("gallery"), v.literal("history"), v.literal("reviews"), v.literal("tripReports"),
);

export const publicReadIndexTables = {
  // A cursor is persisted only after its entire source page is indexed in the
  // same transaction. Nonempty derived tables never establish readiness.
  publicReadIndexState: defineTable({
    name: publicReadIndexName,
    version: v.number(),
    cursor: v.union(v.string(), v.null()),
    ready: v.boolean(),
    processed: v.number(),
  }).index("by_name", ["name"]),
  replicationGalleryCandidates: defineTable({
    candidate_key: v.string(),
    replication_id: v.id("replications"),
    source_created: v.number(),
    ...galleryMatchFields,
  })
    .index("by_candidate", ["candidate_key"])
    .index("by_replication", ["replication_id"]),
  articleHistory: defineTable({
    slug: v.string(),
    changelog_id: v.id("changelog"),
    createdAt: v.string(),
    source_created: v.number(),
  })
    .index("by_slug_created", ["slug", "createdAt", "source_created", "changelog_id"])
    .index("by_changelog", ["changelog_id"]),
  reviewedArticles: defineTable({
    article_id: v.id("substanceIndex"),
    source_created: v.number(),
    reviewer_email: v.string(),
    title: v.string(),
    slug: v.string(),
    reviewed_at: v.union(v.string(), v.null()),
  })
    .index("by_article", ["article_id"])
    .index("by_reviewer", ["reviewer_email", "source_created", "article_id"]),
};
