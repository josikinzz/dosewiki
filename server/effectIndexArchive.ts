import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";

const archiveEntryValidator = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

/**
 * Admin/editor-only lossless Effect Index archive reader. No DoseWiki UI
 * should use this table; it is retained for a future EI deployment.
 */
export const getByKind = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    kind: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    }, "editor");

    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", args.kind))
      .collect();
  },
});

/** Archive `kind` discriminator for an imported Effect Index blog post. */
const POST_KIND = "post";

/**
 * Public: every archived Effect Index blog post, as stored.
 *
 * Rows are returned verbatim — decoding the JSON-string payload is the caller's job via
 * `src/data/projections/effectIndexArchiveProjections`, so the projection stays a pure function
 * that both this deployment and the Next read adapter share. Mirrors the shape of the
 * public `effectIndexArticles` queries: no `apiKey`, no auth, a thin index lookup. The
 * editor-only `getByKind` above stays editor-only and is not used for public reads.
 */
export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", POST_KIND))
      .collect();
  },
});

/**
 * Public: one archived Effect Index blog post by slug. The archive `key` for a post is
 * its slug, so this is an exact hit on the compound `by_kind_key` index, not a scan.
 */
export const getPostBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", POST_KIND).eq("key", args.slug))
      .first();
  },
});

/** Upsert raw Effect Index source records by stable kind/key identity. Script-only; admin floor. */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    entries: v.array(archiveEntryValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    }, "admin");

    let created = 0;
    let updated = 0;

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("effectIndexArchive")
        .withIndex("by_kind_key", (index) => index.eq("kind", entry.kind).eq("key", entry.key))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, entry);
        updated += 1;
      } else {
        await ctx.db.insert("effectIndexArchive", entry);
        created += 1;
      }
    }

    return { created, updated };
  },
});
