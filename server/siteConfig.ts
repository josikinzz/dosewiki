import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { auditStampFor } from "./lib/auditStamp";
import { requireRole } from "./lib/auth";
import { clampSafetyBannerIconSize } from "../src/data/substanceWarningBanners";
import { copyIndexRevision, prepareCopyIndexPublication, copyIndexContentEqual, journalCopyIndex } from "./lib/copyIndexPublication";
import { getAboutEditorAggregates } from "./lib/overviewCountHandlers";

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

export const getAboutForEditor = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "editor");
    const [document, aggregates] = await Promise.all([
      ctx.db.query("siteConfig").withIndex("by_key", (q) => q.eq("key", "about")).first(),
      getAboutEditorAggregates(ctx),
    ]);
    return {
      about: document ? { ...document, revision: await copyIndexRevision(ctx, "siteConfig", "about") } : null,
      aggregates,
    };
  },
});

export const ABOUT_KEY = "about";

export const aboutDocumentFields = {
  aboutMarkdown: v.optional(v.string()),
  aboutSubtitle: v.optional(v.string()),
  founderProfileKeys: v.optional(v.array(v.string())),
  translationCredits: v.optional(v.record(v.string(), v.array(v.object({
    profileKey: v.string(),
    contribution: v.string(),
  })))),
} as const;

export const aboutDocumentValidator = v.object(aboutDocumentFields);

export type AboutDocument = {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
  translationCredits?: Record<string, Array<{ profileKey: string; contribution: string }>>;
};

type SaveAboutArgs = AboutDocument & {
  apiKey?: string;
  actorEmail?: string;
  updatedBy?: string;
  expected?: unknown;
  expectedRevision?: number;
  operationId?: string;
};

export async function saveAboutHandler(ctx: MutationCtx, args: SaveAboutArgs) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");

  const existing = await ctx.db
    .query("siteConfig")
    .withIndex("by_key", (q) => q.eq("key", ABOUT_KEY))
    .first();

  const now = new Date().toISOString();
  const data = {
    key: ABOUT_KEY,
    aboutMarkdown: args.aboutMarkdown,
    aboutSubtitle: args.aboutSubtitle,
    founderProfileKeys: args.founderProfileKeys,
    translationCredits: args.translationCredits ?? existing?.translationCredits,
    updatedAt: now,
    updatedBy: auditStampFor(actor, args.updatedBy),
  };
  const prepared = await prepareCopyIndexPublication(ctx, { table: "siteConfig", kind: "about", key: ABOUT_KEY, before: existing, after: data, expected: args.expected, expectedRevision: args.expectedRevision, operationId: args.operationId, actor });
  if (prepared.replayed) return { updated: true, revision: prepared.revision, replayed: true, unchanged: false };
  if (existing && copyIndexContentEqual("about", existing, data)) return { updated: true, id: existing._id, revision: prepared.revision, replayed: false, unchanged: true };
  const revision = prepared.revision + 1;
  const stored = data;
  const id = existing?._id ?? await ctx.db.insert("siteConfig", stored);
  if (existing) await ctx.db.patch(id, stored);
  await journalCopyIndex(ctx, { table: "siteConfig", key: ABOUT_KEY, before: existing, after: { ...stored, _id: id }, actor, revision, operationId: args.operationId, requestIdentity: prepared.requestIdentity });
  return { updated: !!existing, id, revision, replayed: false, unchanged: false };
}

export const saveAbout = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    ...aboutDocumentFields,
    updatedBy: v.optional(v.string()),
    expected: v.optional(v.any()),
    expectedRevision: v.optional(v.number()),
    operationId: v.optional(v.string()),
  },
  handler: saveAboutHandler,
});

export const FEATURED_REPLICATIONS_KEY = "effect-index-featured-replications";

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

export const saveFeaturedReplications = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    if (args.slugs.length > MAX_FEATURED_REPLICATIONS) {
      throw new Error(
        `A featured selection may hold at most ${MAX_FEATURED_REPLICATIONS} replications.`,
      );
    }

    const requested: string[] = [];
    const seen = new Set();
    for (const raw of args.slugs) {
      const slug = raw.trim();
      if (!slug || seen.has(slug)) {
        continue;
      }
      seen.add(slug);
      requested.push(slug);
    }

    const kept: string[] = [];
    const pruned: string[] = [];
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

export const BANNER_DISPLAY_KEY = "safety-banner-display";

export const getBannerDisplay = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", BANNER_DISPLAY_KEY))
      .first();

    return { iconSize: clampSafetyBannerIconSize(config?.bannerIconSize) };
  },
});

export const saveBannerDisplay = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    iconSize: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    const iconSize = clampSafetyBannerIconSize(args.iconSize);
    const updatedAt = new Date().toISOString();
    const updatedBy = args.actorEmail ?? actor.email;

    const existing = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", BANNER_DISPLAY_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { bannerIconSize: iconSize, updatedAt, updatedBy });
    } else {
      await ctx.db.insert("siteConfig", {
        key: BANNER_DISPLAY_KEY,
        bannerIconSize: iconSize,
        updatedAt,
        updatedBy,
      });
    }

    return { iconSize };
  },
});
