import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import {
  classSourceFromSubstanceDocument,
  isWarningBannerLinkSection,
  normalizeEnabledSlugs,
  normalizeLinks,
  normalizeMatchers,
  MAX_ENABLED_SLUGS,
  WARNING_BANNER_ICON_PATTERN,
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
  type WarningBannerLink,
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

// `sectionId` is stored as a plain string and checked against
// `isWarningBannerLinkSection` on write: a preset saved before a section was
// renamed must still load and be editable, not fail the read validator.
const warningBannerLinkValidator = v.object({
  label: v.string(),
  sectionId: v.string(),
});

/** Mirrors the `warningBannerPresets` row shape in `convex/schema.ts`. */
const warningBannerPresetDocValidator = v.object({
  _id: v.id("warningBannerPresets"),
  _creationTime: v.number(),
  key: v.string(),
  label: v.string(),
  tone: warningBannerToneValidator,
  icon: v.string(),
  severityLabel: v.string(),
  headline: v.string(),
  points: v.array(v.string()),
  links: v.array(warningBannerLinkValidator),
  priority: v.number(),
  enabled: v.boolean(),
  enabledSlugs: v.array(v.string()),
  candidateMatchers: v.array(v.string()),
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
 * `classification` and `index_categories` are `v.any()` in `convex/schema.ts`,
 * so a legacy import can leave nulls or objects among the class strings. The
 * Studio's matcher preview prints these verbatim, so anything unprintable is
 * dropped here rather than shipped to the browser as a blank suggestion row.
 */
function classStrings(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? []).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
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
 * strings a candidate matcher is tested against. Editorial read — it walks the
 * whole article table — so it takes the same maintenance intent as
 * `substanceGalleries.listCurationCandidatesPage`. The caller (the batched Next
 * route) drains the cursor and answers the picker in one response.
 *
 * The class arrays are suggestion fuel only. `matcherHits` in
 * `src/data/substanceWarningBanners.ts` turns them into a reviewable "this
 * matcher hit this class" line in the Studio; no read path turns them into a
 * rendered banner.
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

    const items: {
      slug: string;
      title: string;
      psychoactiveClasses: string[];
      chemicalClasses: string[];
      indexCategories: string[];
    }[] = [];

    for (const substance of page.page) {
      const slug = substance.slug?.trim();
      // No slug means no article URL, and the render rule keys on slug alone —
      // such a row can never be a banner target, so offering it in the picker
      // would only let an editor enable a preset that can never appear.
      if (!slug) {
        continue;
      }

      const source = classSourceFromSubstanceDocument(substance);

      items.push({
        slug,
        title: substance.title,
        psychoactiveClasses: classStrings(source.psychoactiveClasses),
        chemicalClasses: classStrings(source.chemicalClasses),
        indexCategories: classStrings(source.indexCategories),
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
    label: v.string(),
    tone: warningBannerToneValidator,
    icon: v.string(),
    severityLabel: v.string(),
    headline: v.string(),
    points: v.array(v.string()),
    links: v.array(warningBannerLinkValidator),
    priority: v.number(),
    enabled: v.boolean(),
    enabledSlugs: v.array(v.string()),
    candidateMatchers: v.array(v.string()),
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

    const label = args.label.replace(/\s+/g, " ").trim();
    if (!label) {
      reject("A banner preset needs a label (the Studio-facing name).");
    }
    if (label.length > WARNING_BANNER_LIMITS.labelMaxLength) {
      reject(`A banner label must be ${WARNING_BANNER_LIMITS.labelMaxLength} characters or fewer.`);
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

    // `Number.isInteger` already rejects NaN and both infinities, so this is the
    // whole finite-integer check the sort in `compareWarningBanners` relies on.
    if (!Number.isInteger(args.priority)) {
      reject(`A banner priority must be a whole number; got ${args.priority}.`);
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

    if (args.links.length > WARNING_BANNER_LIMITS.maxLinks) {
      reject(`A banner may carry at most ${WARNING_BANNER_LIMITS.maxLinks} link chips.`);
    }
    const submittedLinks: WarningBannerLink[] = [];
    for (const link of args.links) {
      // Narrowed through a local so the guard survives the length check below.
      const sectionId = link.sectionId;
      if (!isWarningBannerLinkSection(sectionId)) {
        reject(
          `Banner link target "${sectionId}" is not an article section a banner may point at.`,
        );
      }
      const linkLabel = link.label.replace(/\s+/g, " ").trim();
      if (linkLabel.length > WARNING_BANNER_LIMITS.linkLabelMaxLength) {
        reject(
          `Banner link label "${linkLabel}" must be ${WARNING_BANNER_LIMITS.linkLabelMaxLength} characters or fewer.`,
        );
      }
      submittedLinks.push({ label: linkLabel, sectionId });
    }
    const links = normalizeLinks(submittedLinks);

    if (args.candidateMatchers.length > WARNING_BANNER_LIMITS.maxMatchers) {
      reject(`A banner may hold at most ${WARNING_BANNER_LIMITS.maxMatchers} candidate matchers.`);
    }
    if (
      args.candidateMatchers.some(
        (matcher) => matcher.trim().length > WARNING_BANNER_LIMITS.matcherMaxLength,
      )
    ) {
      reject(
        `Each candidate matcher must be ${WARNING_BANNER_LIMITS.matcherMaxLength} characters or fewer.`,
      );
    }
    const candidateMatchers = normalizeMatchers(args.candidateMatchers);

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
      label,
      tone: args.tone,
      icon,
      severityLabel,
      headline,
      points,
      links,
      priority: args.priority,
      enabled: args.enabled,
      enabledSlugs,
      candidateMatchers,
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
