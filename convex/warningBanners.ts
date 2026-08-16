import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import {
  classSourceFromSubstanceDocument,
  normalizeEnabledSlugs,
  substanceClassValues,
  MAX_ENABLED_SLUGS,
  WARNING_BANNER_ICON_PATTERN,
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
} from "../src/data/substanceWarningBanners";

/**
 * Drug-class safety banner presets: the stored `warningBannerPresets` rows and
 * the editorial reads the /dev Banner Studio needs.
 *
 * The invariant, and the reason this module is deliberately thin: **a banner is
 * opt-in**. It renders on a substance if and only if `enabled` is true and the
 * substance's slug is in `enabledSlugs`. Nothing here reads a substance's
 * classification to decide that, and `listSubstanceTargetsPage` hands class
 * strings to the Studio purely so an editor can be *shown* likely candidates —
 * the suggestion never becomes an assignment without a save.
 *
 * The pure rules — matching, ordering, the two-banner cap, and the shared
 * normalizers this module writes through — live in
 * `src/data/substanceWarningBanners.ts`, imported by the browser Studio, the
 * Next read helper, and this file, so the three cannot disagree about what a
 * valid preset is. This module only wires them to the database. The public
 * article read goes through `lib/next/warningBanners.ts` on top of
 * `listPresets`, cached under the banners tag.
 */

/** Shared by the row read validator and the write args; see `convex/schema.ts`. */
const warningBannerToneValidator = v.union(
  v.literal("danger"),
  v.literal("unsafe"),
  v.literal("caution"),
);

/** Mirrors the `warningBannerPresets` row shape in `convex/schema.ts`. */
const warningBannerPresetDocValidator = v.object({
  _id: v.id("warningBannerPresets"),
  _creationTime: v.number(),
  key: v.string(),
  tone: warningBannerToneValidator,
  icon: v.string(),
  severityLabel: v.string(),
  headline: v.string(),
  points: v.array(v.string()),
  enabled: v.boolean(),
  enabledSlugs: v.array(v.string()),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

function reject(message: string): never {
  throw new ConvexError({ code: "invalidWarningBanner", message });
}

/**
 * The substance for a slug, or null. Mirrors `uniqueSubstanceBySlug` in
 * `convex/substanceGalleries.ts`: a duplicated slug is ambiguous and treated as
 * not found rather than letting two articles fight over one banner.
 */
async function uniqueSubstanceBySlug(ctx: QueryCtx, slug: string) {
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(2);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Every preset, unfiltered. Public and ungated on purpose: this is a handful of
 * rows — one per drug-class warning, single digits in practice — and the public
 * article read needs all of them to resolve which banners a slug opted into.
 * Nothing here is editor-private; a live preset is copy a reader already sees,
 * and a dormant one is copy nobody can reach.
 */
export const listPresets = query({
  args: {},
  returns: v.array(warningBannerPresetDocValidator),
  handler: async (ctx) => {
    return await ctx.db.query("warningBannerPresets").collect();
  },
});

/** How the Banner Studio's target picker pages the substance index. */
const TARGET_PAGE_SIZE = 100;
const TARGET_MAX_PAGE_SIZE = 200;

/**
 * One page of the Studio's substance picker: every substance with the class
 * strings its search box can match on. Editorial read — it walks the whole
 * article table — so it takes the same maintenance intent as
 * `substanceGalleries.listCurationCandidatesPage`. The caller (the batched Next
 * route) drains the cursor and answers the picker in one response.
 *
 * The class arrays are search fuel only, never stored on a preset:
 * `searchWarningBannerTargets` in `src/data/substanceWarningBanners.ts` turns a
 * typed word into a list an editor ticks, and ticking is the only thing that
 * enables a banner.
 */
export const listSubstanceTargetsPage = query({
  args: {
    apiKey: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "editorArticleWrite");

    const numItems = Math.min(
      Math.max(Math.floor(args.limit ?? TARGET_PAGE_SIZE), 1),
      TARGET_MAX_PAGE_SIZE,
    );
    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems,
    });

    const items: { slug: string; title: string; classes: string[] }[] = [];

    for (const substance of page.page) {
      const slug = substance.slug?.trim();
      // No slug means no article URL, and the render rule keys on slug alone —
      // such a row can never be a banner target, so offering it in the picker
      // would only let an editor enable a preset that can never appear.
      if (!slug) {
        continue;
      }

      items.push({
        slug,
        title: substance.title,
        classes: substanceClassValues(classSourceFromSubstanceDocument(substance)),
      });
    }

    return { items, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Create or replace one preset, addressed by `key`.
 *
 * Idempotent by key: a retried save patches the same row instead of minting a
 * duplicate, which matters because the article read resolves a key to exactly
 * one banner.
 *
 * `enabledSlugs` is pruned here rather than stored as submitted — a slug that
 * names no article would be a silent promise of a banner nobody can see — and
 * the surviving list comes back in the echo, which the Studio adopts verbatim.
 * Pruning has to be visible: "you enabled 7, 5 stuck" is the whole point.
 */
export const upsertPreset = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    tone: warningBannerToneValidator,
    icon: v.string(),
    severityLabel: v.string(),
    headline: v.string(),
    points: v.array(v.string()),
    enabled: v.boolean(),
    enabledSlugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.boolean(),
    key: v.string(),
    enabledSlugs: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const key = args.key.trim();
    if (!WARNING_BANNER_KEY_PATTERN.test(key)) {
      reject(
        `A banner preset key must be lower-case kebab-case starting with a letter or digit; got "${args.key}".`,
      );
    }

    const icon = args.icon.trim();
    if (!icon) {
      reject(
        "A banner preset needs an icon: an Iconify id like `lucide:wind`, or a `custom:` key.",
      );
    }
    if (icon.length > WARNING_BANNER_LIMITS.iconMaxLength) {
      reject(
        `A banner icon id must be ${WARNING_BANNER_LIMITS.iconMaxLength} characters or fewer.`,
      );
    }
    if (!WARNING_BANNER_ICON_PATTERN.test(icon)) {
      reject(
        `Banner icon "${icon}" is not a valid Iconify id: expected \`collection:name\` or \`custom:name\`, lower-case with hyphens.`,
      );
    }

    const severityLabel = args.severityLabel.replace(/\s+/g, " ").trim();
    if (!severityLabel) {
      reject("A banner preset needs a severity label (the short gutter word a reader sees).");
    }
    if (severityLabel.length > WARNING_BANNER_LIMITS.severityLabelMaxLength) {
      reject(
        `A banner severity label must be ${WARNING_BANNER_LIMITS.severityLabelMaxLength} characters or fewer.`,
      );
    }

    const headline = args.headline.replace(/\s+/g, " ").trim();
    if (!headline) {
      reject("A banner preset needs a headline.");
    }
    if (headline.length > WARNING_BANNER_LIMITS.headlineMaxLength) {
      reject(
        `A banner headline must be ${WARNING_BANNER_LIMITS.headlineMaxLength} characters or fewer.`,
      );
    }

    const points = args.points
      .map((point) => point.replace(/\s+/g, " ").trim())
      .filter((point) => point.length > 0);
    if (points.length > WARNING_BANNER_LIMITS.maxPoints) {
      reject(`A banner may list at most ${WARNING_BANNER_LIMITS.maxPoints} points.`);
    }
    if (points.some((point) => point.length > WARNING_BANNER_LIMITS.pointMaxLength)) {
      reject(
        `Each banner point must be ${WARNING_BANNER_LIMITS.pointMaxLength} characters or fewer.`,
      );
    }

    // Checked before the per-slug lookups: a payload that can never be stored
    // should not cost the corpus a few hundred index reads first.
    if (args.enabledSlugs.length > MAX_ENABLED_SLUGS) {
      reject(`A banner preset may be enabled on at most ${MAX_ENABLED_SLUGS} substances.`);
    }
    if (
      args.enabledSlugs.some((slug) => slug.trim().length > WARNING_BANNER_LIMITS.slugMaxLength)
    ) {
      reject(
        `Each enabled slug must be ${WARNING_BANNER_LIMITS.slugMaxLength} characters or fewer.`,
      );
    }

    // Prune, do not reject: a slug naming no article (renamed, unpublished, or
    // typed) is dropped so the stored list cannot promise a banner nobody can
    // reach. `uniqueSubstanceBySlug` treats a duplicated slug as not found for
    // the same reason it does in `convex/substanceGalleries.ts`.
    const enabledSlugs: string[] = [];
    for (const slug of normalizeEnabledSlugs(args.enabledSlugs)) {
      if (await uniqueSubstanceBySlug(ctx, slug)) {
        enabledSlugs.push(slug);
      }
    }

    const existing = await ctx.db
      .query("warningBannerPresets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    const document = {
      key,
      tone: args.tone,
      icon,
      severityLabel,
      headline,
      points,
      enabled: args.enabled,
      enabledSlugs,
      updatedAt: new Date().toISOString(),
      updatedBy: args.updatedBy ?? actor.email,
    };

    if (existing) {
      await ctx.db.patch(existing._id, document);
      return { updated: true, key, enabledSlugs };
    }

    await ctx.db.insert("warningBannerPresets", document);
    return { updated: false, key, enabledSlugs };
  },
});

/**
 * Delete one preset. Not destructive to a reader: the public helper resolves
 * banners from whatever rows exist, so a removed preset simply stops rendering
 * — there is no checked-in default banner to fall back to, by design.
 */
export const removePreset = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  returns: v.object({ removed: v.boolean(), key: v.string() }),
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const key = args.key.trim();
    const existing = await ctx.db
      .query("warningBannerPresets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!existing) {
      return { removed: false, key };
    }

    await ctx.db.delete(existing._id);
    return { removed: true, key };
  },
});

/**
 * MIGRATION SHIM — delete this together with the four optional columns in
 * `convex/schema.ts` once it has run against every deployment.
 *
 * The distill pass dropped `label`, `priority`, `links`, and `candidateMatchers`
 * from the model. Convex validates the schema against existing documents on
 * push, so narrowing a table that already holds rows is widen → migrate →
 * narrow; a straight narrow is refused with "Object contains extra field".
 *
 * `replace` rather than `patch`: patching cannot unset a field, and the whole
 * point here is that the columns stop existing. Every reader-visible field is
 * carried across, so an editor's authored copy survives untouched.
 */
export const dropRemovedColumns = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  returns: v.object({ rewritten: v.number(), scanned: v.number() }),
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const rows = await ctx.db.query("warningBannerPresets").collect();
    let rewritten = 0;

    for (const row of rows) {
      const stale =
        row.label !== undefined ||
        row.priority !== undefined ||
        row.links !== undefined ||
        row.candidateMatchers !== undefined;
      if (!stale) {
        continue;
      }

      await ctx.db.replace(row._id, {
        key: row.key,
        tone: row.tone,
        icon: row.icon,
        severityLabel: row.severityLabel,
        headline: row.headline,
        points: row.points,
        enabled: row.enabled,
        enabledSlugs: row.enabledSlugs,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      });
      rewritten += 1;
    }

    return { rewritten, scanned: rows.length };
  },
});
