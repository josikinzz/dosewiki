import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireEditorWrite } from "./lib/auth";

/**
 * Site configuration storage - About page content and other global settings.
 * Uses a single document pattern with key="about" for the About page.
 */

// Get the About page configuration
export const getAbout = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", "about"))
      .first();

    return config ?? null;
  },
});

// Save the About page configuration
export const saveAbout = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const existing = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", "about"))
      .first();

    const now = new Date().toISOString();
    const data = {
      key: "about" as const,
      aboutMarkdown: args.aboutMarkdown,
      aboutSubtitle: args.aboutSubtitle,
      founderProfileKeys: args.founderProfileKeys,
      updatedAt: now,
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return { updated: true, id: existing._id };
    } else {
      const id = await ctx.db.insert("siteConfig", data);
      return { updated: false, id };
    }
  },
});

/**
 * The Effect Index homepage's featured replication carousel.
 *
 * An ordered editorial selection of replication slugs, stored as one
 * `siteConfig` document so the portal can edit it without a deploy. It used to
 * be a checked-in JSON file, which meant every re-curation was a code change;
 * the file survives only as the fallback the homepage reads when this document
 * is absent or the deployment predates these functions.
 */
export const FEATURED_REPLICATIONS_KEY = "effect-index-featured-replications";

/** Enough for a carousel several times over, small enough to stay one document. */
const MAX_FEATURED_REPLICATIONS = 120;

export const getFeaturedReplications = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", FEATURED_REPLICATIONS_KEY))
      .first();

    if (!config) {
      return null;
    }

    return {
      slugs: config.featuredReplicationSlugs ?? [],
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy ?? null,
    };
  },
});

/**
 * Replace the featured selection.
 *
 * Slugs that name no replication are pruned here rather than stored, the way
 * `contributorProfiles.setContributorOrdering` prunes a curated ordering: a
 * deleted or renamed replication must not survive as a phantom position that
 * silently shortens the carousel. What was dropped comes back to the caller so
 * the editor can be told rather than left guessing.
 *
 * Saving an empty list is meaningful and is not the same as never having
 * curated: the homepage falls back to its checked-in list only when this
 * document is absent, so an empty stored selection hides the carousel outright
 * rather than quietly restoring a list the editor just cleared.
 */
export const saveFeaturedReplications = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    if (args.slugs.length > MAX_FEATURED_REPLICATIONS) {
      throw new Error(
        `A featured selection may hold at most ${MAX_FEATURED_REPLICATIONS} replications.`,
      );
    }

    const requested = [];
    const seen = new Set();
    for (const raw of args.slugs) {
      const slug = raw.trim();
      if (!slug || seen.has(slug)) {
        continue;
      }
      seen.add(slug);
      requested.push(slug);
    }

    const kept = [];
    const pruned = [];
    for (const slug of requested) {
      const row = await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (row) {
        kept.push(slug);
      } else {
        pruned.push(slug);
      }
    }

    const existing = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", FEATURED_REPLICATIONS_KEY))
      .first();

    const updatedAt = new Date().toISOString();
    const updatedBy = args.updatedBy ?? actor.email;

    if (existing) {
      await ctx.db.patch(existing._id, {
        featuredReplicationSlugs: kept,
        updatedAt,
        updatedBy,
      });
      return { updated: true, slugs: kept, pruned };
    }

    await ctx.db.insert("siteConfig", {
      key: FEATURED_REPLICATIONS_KEY,
      featuredReplicationSlugs: kept,
      updatedAt,
      updatedBy,
    });

    return { updated: false, slugs: kept, pruned };
  },
});
