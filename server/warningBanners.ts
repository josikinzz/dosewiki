import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type QueryCtx, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { contentHash } from "../lib/proposals/contentHash";
import type { WarningBannerPreset } from "../src/data/substanceWarningBanners";
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

/** Shared by the row read validator and the write args; see `server/schema.ts`. */
const warningBannerToneValidator = v.union(
  v.literal("danger"),
  v.literal("unsafe"),
  v.literal("caution"),
);

/** Public warning projection: excludes editor identities and revision tokens. */
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
  allSubstances: v.optional(v.boolean()),
  enabledSlugs: v.array(v.string()),
  updatedAt: v.string(),
});

function reject(message: string): never {
  throw new PostgresError({ code: "INVALID_WARNING_BANNER", message });
}

/**
 * The substance for a slug, or null. Mirrors `uniqueSubstanceBySlug` in
 * `server/substanceGalleries.ts`: a duplicated slug is ambiguous and treated as
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
    const rows = await ctx.db.query("warningBannerPresets").collect();
    return rows.map(({ updatedBy: _updatedBy, ...row }) => row);
  },
});

export const listEditorPresets = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "admin");
    const rows = await ctx.db.query("warningBannerPresets").collect();
    return await Promise.all(rows.map(async (row) => ({
      ...presetValue(row), baseHash: await presetHash(ctx, row.key, row),
    })));
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
    actorEmail: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

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
    allSubstances: v.boolean(),
    enabledSlugs: v.array(v.string()),
    baseHash: v.string(),
    changeId: v.string(),
    scope: v.union(v.literal("assignment"), v.literal("preset")),
    slug: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

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
    // the same reason it does in `server/substanceGalleries.ts`.
    const enabledSlugs: string[] = [];
    for (const slug of normalizeEnabledSlugs(args.enabledSlugs)) {
      if (await uniqueSubstanceBySlug(ctx, slug)) {
        enabledSlugs.push(slug);
      }
    }

    const existing = await ctx.db
      .query("warningBannerPresets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const requestHash = contentHash(argsWithoutCredentials(args));
    const replay = await replayOperation(ctx, args.changeId, requestHash, actor.email);
    if (replay) return replay;
    const baseHash = await presetHash(ctx, key, existing);
    if (baseHash !== args.baseHash) conflict();
    if (args.scope === "assignment") {
      if (!existing || !args.slug || !(await uniqueSubstanceBySlug(ctx, args.slug))) {
        reject("An assignment must name an existing article and preset.");
      }
      if (existing.allSubstances) reject("Sitewide presets have no local assignment. Edit the shared preset instead.");
      const unchanged = { ...presetValue(existing), enabledSlugs };
      if (contentHash(unchanged) !== contentHash({ key, tone: args.tone, icon, severityLabel, headline, points, enabled: args.enabled, allSubstances: args.allSubstances, enabledSlugs })) {
        reject("A local assignment cannot change shared preset content or status.");
      }
      if (contentHash(existing.enabledSlugs.filter((slug) => slug !== args.slug)) !==
          contentHash(enabledSlugs.filter((slug) => slug !== args.slug))) {
        reject("A local assignment can change only the named article.");
      }
    } else if (args.slug) {
      if (!existing || !(await uniqueSubstanceBySlug(ctx, args.slug))) reject("Article or preset not found.");
      if (existing.enabled !== args.enabled || Boolean(existing.allSubstances) !== args.allSubstances ||
          contentHash(existing.enabledSlugs) !== contentHash(enabledSlugs)) {
        reject("Contextual preset edits cannot change bulk coverage.");
      }
    }

    const document = {
      key,
      tone: args.tone,
      icon,
      severityLabel,
      headline,
      points,
      enabled: args.enabled,
      allSubstances: args.allSubstances,
      enabledSlugs,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.email,
    };

    if (existing) await ctx.db.patch(existing._id, document);
    else await ctx.db.insert("warningBannerPresets", document);
    return await journal(ctx, {
      key, before: presetValue(existing), after: presetValue(document), baseHash,
      changeId: args.changeId, requestHash, actor, scope: args.scope, slug: args.slug,
      operation: "publish",
    });
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
    baseHash: v.string(),
    changeId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    const key = args.key.trim();
    const existing = await ctx.db
      .query("warningBannerPresets")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    const requestHash = contentHash(argsWithoutCredentials(args));
    const replay = await replayOperation(ctx, args.changeId, requestHash, actor.email);
    if (replay) return replay;
    const baseHash = await presetHash(ctx, key, existing);
    if (baseHash !== args.baseHash) conflict();
    if (!existing) reject("Preset not found.");
    await ctx.db.delete(existing._id);
    return await journal(ctx, {
      key, before: presetValue(existing), after: null, baseHash, changeId: args.changeId,
      requestHash, actor, scope: "preset", operation: "remove",
    });
  },
});

function presetValue(value: WarningBannerPreset | null): WarningBannerPreset | null {
  if (!value) return null;
  return { key: value.key, tone: value.tone, icon: value.icon,
    severityLabel: value.severityLabel, headline: value.headline, points: value.points,
    enabled: value.enabled, allSubstances: Boolean(value.allSubstances), enabledSlugs: value.enabledSlugs };
}

async function presetHash(ctx: QueryCtx | MutationCtx, key: string, value: WarningBannerPreset | null) {
  const latest = await ctx.db.query("warningBannerRevisions").withIndex("by_key", (q) => q.eq("key", key)).order("desc").first();
  return contentHash({ preset: presetValue(value), revision: latest?.changeId ?? null });
}

function conflict(): never {
  throw new PostgresError({ code: "FIELD_CONFLICT", message: "This warning changed since it was opened. Reload its current version before publishing; your local edits have not been applied." });
}

function argsWithoutCredentials(args: Record<string, unknown>) {
  const { apiKey: _apiKey, actorEmail: _actorEmail, ...payload } = args;
  return payload;
}

async function replayOperation(ctx: MutationCtx, changeId: string, requestHash: string, actorEmail: string) {
  if (!changeId.trim() || changeId.length > 128) reject("A bounded change id is required.");
  const previous = await ctx.db.query("warningBannerRevisions").withIndex("by_change", (q) => q.eq("changeId", changeId)).unique();
  if (!previous) return null;
  if (previous.actorEmail !== actorEmail || previous.requestHash !== requestHash) reject("This change id belongs to a different request.");
  return revisionResult(previous);
}

function revisionResult(revision: {
  key: string; changeId: string; resultHash: string; after: unknown;
  affectedSlugs: string[]; allSubstances: boolean;
}) {
  const after = revision.after as WarningBannerPreset | null;
  return { key: revision.key, changeId: revision.changeId, baseHash: revision.resultHash,
    preset: after, updated: true, removed: after === null, enabledSlugs: after?.enabledSlugs ?? [],
    allSubstances: revision.allSubstances, affectedSlugs: revision.affectedSlugs };
}

async function journal(ctx: MutationCtx, input: {
  key: string; before: WarningBannerPreset | null; after: WarningBannerPreset | null;
  baseHash: string; changeId: string; requestHash: string;
  actor: { email: string; role: string }; scope: "assignment" | "preset"; slug?: string;
  operation: "publish" | "remove" | "restore";
}) {
  const { actor, ...values } = input;
  const resultHash = contentHash({ preset: input.after, revision: input.changeId });
  const revision = {
    ...values, resultHash, actorEmail: actor.email, actorRole: actor.role,
    createdAt: new Date().toISOString(),
    affectedSlugs: input.scope === "assignment" && input.slug ? [input.slug] :
      [...new Set([...(input.before?.enabledSlugs ?? []), ...(input.after?.enabledSlugs ?? [])])].sort(),
    allSubstances: Boolean(input.before?.allSubstances || input.after?.allSubstances),
    publications: ["dose.wiki", "Effect Index"],
  };
  await ctx.db.insert("warningBannerRevisions", revision);
  return revisionResult(revision);
}

export const getEditorState = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), key: v.string(), changeId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "admin");
    const preset = await ctx.db.query("warningBannerPresets").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const history = await ctx.db.query("warningBannerRevisions").withIndex("by_key", (q) => q.eq("key", args.key)).order("desc").take(50);
    const operation = args.changeId ? await ctx.db.query("warningBannerRevisions").withIndex("by_change", (q) => q.eq("changeId", args.changeId!)).unique() : null;
    return { preset: presetValue(preset), baseHash: await presetHash(ctx, args.key, preset),
      history: history.map((row) => ({ ...row, revisionId: row._id })),
      operation: operation && operation.key === args.key && operation.actorEmail === actor.email ? revisionResult(operation) : null };
  },
});

export const restorePreset = mutation({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), key: v.string(),
    baseHash: v.string(), changeId: v.string(), revisionId: v.id("warningBannerRevisions") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "admin");
    const requestHash = contentHash(argsWithoutCredentials(args));
    const replay = await replayOperation(ctx, args.changeId, requestHash, actor.email);
    if (replay) return replay;
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.key !== args.key) reject("Warning revision not found.");
    const existing = await ctx.db.query("warningBannerPresets").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const baseHash = await presetHash(ctx, args.key, existing);
    if (baseHash !== args.baseHash || baseHash !== revision.resultHash) conflict();
    const after = revision.before as WarningBannerPreset | null;
    if (after) {
      for (const slug of after.enabledSlugs) {
        if (!(await uniqueSubstanceBySlug(ctx, slug))) reject("An article in this historical assignment no longer exists. Update coverage explicitly instead of restoring it.");
      }
      const document = { ...after, updatedAt: new Date().toISOString(), updatedBy: actor.email };
      if (existing) await ctx.db.replace(existing._id, document);
      else await ctx.db.insert("warningBannerPresets", document);
    } else if (existing) await ctx.db.delete(existing._id);
    return await journal(ctx, { key: args.key, before: presetValue(existing), after, baseHash,
      changeId: args.changeId, requestHash, actor, scope: revision.scope, slug: revision.slug, operation: "restore" });
  },
});
