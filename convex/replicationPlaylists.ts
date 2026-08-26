import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import { isShowcaseEligible } from "../src/data/substanceReplicationGallery";

/**
 * Reusable replication playlists for the /dev curation portal.
 *
 * A playlist is a named, ordered set of replication slugs and nothing more. It
 * publishes nothing on its own: applying one edits a substance gallery's
 * *draft*, and `substanceGalleries` remains the single publish gate. This
 * exists because the same opener is right for a whole family of substances, and
 * rebuilding that order by hand per article is most of the curation work.
 *
 * Membership is pruned to showcase-eligible corpus rows on write, the same way
 * `substanceGalleries:upsert` prunes a curation, so a playlist can never carry
 * a slug that no longer exists or has been retired corpus-wide.
 */

/** Enough for several articles' worth of ordering, small enough to stay one document. */
const MAX_PLAYLIST_SLUGS = 250;

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const list = query({
  args: { apiKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const rows = await ctx.db.query("replicationPlaylists").collect();
    return rows
      .map((row) => ({
        key: row.key,
        title: row.title,
        replication_slugs: row.replication_slugs,
        updated_at: row.updated_at,
        updated_by: row.updated_by ?? null,
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  },
});

export const get = query({
  args: { apiKey: v.optional(v.string()), key: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const row = await ctx.db
      .query("replicationPlaylists")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    return {
      key: row.key,
      title: row.title,
      replication_slugs: row.replication_slugs,
      updated_at: row.updated_at,
      updated_by: row.updated_by ?? null,
    };
  },
});

/**
 * Create or replace one playlist.
 *
 * `expectedUpdatedAt` carries the same optimistic-concurrency contract as a
 * gallery save: omit it to write unconditionally, pass `null` to assert the
 * playlist did not exist, or pass the loaded `updated_at`. A failed check
 * writes nothing and returns `{ status: "conflict", server }` so the caller can
 * show both sides rather than clobbering a colleague.
 */
export const upsert = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    title: v.string(),
    replication_slugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    if (!KEBAB_CASE.test(args.key)) {
      throw new Error(`Playlist key "${args.key}" must be kebab-case.`);
    }
    const title = args.title.trim();
    if (title.length === 0) {
      throw new Error("A playlist needs a name.");
    }
    if (args.replication_slugs.length > MAX_PLAYLIST_SLUGS) {
      throw new Error(
        `This playlist holds ${args.replication_slugs.length} works; the limit is ${MAX_PLAYLIST_SLUGS}. Split it into two playlists.`,
      );
    }

    const existing = await ctx.db
      .query("replicationPlaylists")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    const expected = args.expectedUpdatedAt;
    if (
      expected !== undefined &&
      (expected === null ? existing !== null : existing?.updated_at !== expected)
    ) {
      return {
        status: "conflict" as const,
        server: {
          key: args.key,
          title: existing?.title ?? "",
          replication_slugs: existing?.replication_slugs ?? [],
          updated_at: existing?.updated_at ?? "",
          updated_by: existing?.updated_by ?? null,
        },
      };
    }

    // Prune to rows that still exist and still propose themselves anywhere, and
    // echo what was dropped: a playlist naming a deleted or retired work would
    // silently apply nothing at the far end.
    const rows = await ctx.db.query("replications").collect();
    const eligible = new Set(
      rows.filter(isShowcaseEligible).map((row) => row.slug),
    );
    const slugs: string[] = [];
    const pruned: string[] = [];
    const seen = new Set<string>();
    for (const slug of args.replication_slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      if (eligible.has(slug)) slugs.push(slug);
      else pruned.push(slug);
    }

    const updated_at = new Date().toISOString();
    const updated_by = args.updatedBy ?? actor.email;

    if (existing) {
      await ctx.db.patch(existing._id, {
        title,
        replication_slugs: slugs,
        updated_at,
        updated_by,
      });
    } else {
      await ctx.db.insert("replicationPlaylists", {
        key: args.key,
        title,
        replication_slugs: slugs,
        updated_at,
        updated_by,
      });
    }

    return {
      status: "ok" as const,
      updated: Boolean(existing),
      key: args.key,
      title,
      replication_slugs: slugs,
      pruned,
      updated_at,
      updated_by,
    };
  },
});

/** Idempotently add or remove one replication without replacing the playlist. */
export const setMembership = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    replicationSlug: v.string(),
    included: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });
    const existing = await ctx.db
      .query("replicationPlaylists")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      throw new Error(`Playlist "${args.key}" not found.`);
    }
    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.replicationSlug))
      .first();
    if (!replication || !isShowcaseEligible(replication)) {
      throw new Error(
        `Replication "${args.replicationSlug}" is not playlist-eligible.`,
      );
    }
    const slugs = args.included
      ? existing.replication_slugs.includes(args.replicationSlug)
        ? existing.replication_slugs
        : [...existing.replication_slugs, args.replicationSlug]
      : existing.replication_slugs.filter(
          (slug) => slug !== args.replicationSlug,
        );
    if (slugs.length > MAX_PLAYLIST_SLUGS) {
      throw new Error(
        `This playlist holds more than ${MAX_PLAYLIST_SLUGS} works.`,
      );
    }
    const updated_at = new Date().toISOString();
    await ctx.db.patch(existing._id, {
      replication_slugs: slugs,
      updated_at,
      updated_by: actor.email,
    });
    return {
      status: "ok" as const,
      key: existing.key,
      title: existing.title,
      replication_slugs: slugs,
      updated_at,
      updated_by: actor.email,
    };
  },
});

export const remove = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const existing = await ctx.db
      .query("replicationPlaylists")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!existing) {
      return { status: "missing" as const, key: args.key };
    }
    await ctx.db.delete(existing._id);
    return { status: "ok" as const, key: args.key };
  },
});
