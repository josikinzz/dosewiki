import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { auditStampFor } from "./lib/auditStamp";
import { requireRole } from "./lib/auth";
import { clampSafetyBannerIconSize } from "../src/data/substanceWarningBanners";
import { copyIndexRevision, prepareCopyIndexPublication, copyIndexContentEqual, journalCopyIndex } from "./lib/copyIndexPublication";
import { getAboutEditorAggregates } from "./lib/overviewCountHandlers";

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

/** The site config row the About page reads. */
export const ABOUT_KEY = "about";

/**
 * The About document as `saveAbout` takes it and as a change proposal carries
 * it. Shared so a proposal can never smuggle a shape the direct save would
 * refuse.
 */
export const aboutDocumentFields = {
  aboutMarkdown: v.optional(v.string()),
  aboutSubtitle: v.optional(v.string()),
  founderProfileKeys: v.optional(v.array(v.string())),
} as const;

export const aboutDocumentValidator = v.object(aboutDocumentFields);

export type AboutDocument = {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
};

type SaveAboutArgs = AboutDocument & {
  apiKey?: string;
  actorEmail?: string;
  updatedBy?: string;
  expected?: unknown;
  expectedRevision?: number;
  operationId?: string;
};

/**
 * The About write behind `saveAbout`, also the write an approved About
 * proposal applies through. Admin floor: editors draft About changes as
 * proposals and `approveAndApply` runs this with the approving admin as the
 * actor.
 */
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

// Save the About page configuration
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

/**
 * The Effect Index homepage's featured replication carousel.
 *
 * An ordered editorial selection of replication slugs, stored as one
 * `siteConfig` document so the portal can edit it without a deploy. It used to
 * be a checked-in JSON file, which meant every re-curation was a code change;
 * the file survives only as the fallback the homepage reads when this document
 * is absent.
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

/**
 * The site-wide safety-banner glyph size.
 *
 * One number for every banner on every article, deliberately. It is stored here
 * rather than as a column on `warningBannerPresets` because a per-preset size
 * would be per-banner by construction: two banners stacked on one article could
 * then disagree about how large a warning glyph is, which reads as a defect. A
 * `siteConfig` document is the existing shape for "one global setting an editor
 * can change without a deploy".
 */
export const BANNER_DISPLAY_KEY = "safety-banner-display";

/**
 * Always answers a usable number. Unlike a preset list, where an absent
 * document means "no banners" and null is the honest answer, an absent display
 * document means "nobody has changed the shipped size" — so it resolves to
 * `SAFETY_BANNER_ICON_SIZE_DEFAULT` and the renderer needs no fallback of its
 * own. The stored value goes back through the clamp on read as well as on
 * write, so a document written before a bound moved is corrected rather than
 * escaping into an SVG dimension.
 */
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

/**
 * Set the site-wide glyph size. Echoes what was actually stored, which is the
 * clamped value: the editor's control must snap to what readers will see rather
 * than keep showing a number this deployment refused.
 */
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
