import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

const SLUG_RE = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_APPLY_SLUGS = 50;

function assertValidSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid molecule slug: "${slug}".`);
  }
}

function depictionUpdatedAt(
  existing: { svg: string; updatedAt: string } | null,
  svg: string,
  proposed = new Date().toISOString(),
) {
  if (existing?.svg === svg) return existing.updatedAt;
  const previousTime = existing ? Date.parse(existing.updatedAt) : NaN;
  const proposedTime = Date.parse(proposed);
  if (!Number.isFinite(proposedTime)) throw new Error("Invalid molecule updatedAt.");
  return Number.isFinite(previousTime) && proposedTime <= previousTime
    ? new Date(previousTime + 1).toISOString()
    : new Date(proposedTime).toISOString();
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

export const getMetadataBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    return row
      ? { slug: row.slug, updatedAt: row.updatedAt, source: row.source }
      : null;
  },
});

export const listSlugs = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("moleculeOverrides").collect();
    return rows.map((row) => ({
      slug: row.slug,
      updatedAt: row.updatedAt,
      source: row.source,
    }));
  },
});

export const getCurrentBySlugs = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    if (args.slugs.length > MAX_TEMPLATE_APPLY_SLUGS) {
      throw new Error(`Template preview is limited to ${MAX_TEMPLATE_APPLY_SLUGS} molecules.`);
    }

    const slugs = Array.from(new Set(args.slugs));
    for (const slug of slugs) assertValidSlug(slug);

    const rows = await Promise.all(
      slugs.map((slug) =>
        ctx.db
          .query("moleculeOverrides")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first(),
      ),
    );

    return rows.flatMap((row) =>
      row
        ? [
            {
              slug: row.slug,
              molblock: row.molblock,
              source: row.source,
              boldBonds: row.boldBonds,
            },
          ]
        : [],
    );
  },
});

export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    boldBonds: v.optional(v.array(v.number())),
    updatedBy: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule molblock.");
    }
    if (args.boldBonds && args.boldBonds.some((bond) => !Number.isInteger(bond) || bond < 0)) {
      throw new Error("Invalid molecule boldBonds.");
    }

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const expected = args.expectedUpdatedAt;
    if (
      expected !== undefined &&
      (expected === null ? existing !== null : existing?.updatedAt !== expected)
    ) {
      return {
        status: "conflict" as const,
        server: {
          updatedAt: existing?.updatedAt ?? null,
          updatedBy: existing?.updatedBy ?? null,
        },
      };
    }

    const doc = {
      slug: args.slug,
      svg: args.svg,
      molblock: args.molblock,
      smiles: args.smiles,
      boldBonds: args.boldBonds && args.boldBonds.length > 0 ? args.boldBonds : undefined,
      source: "editor" as const,
      updatedAt: depictionUpdatedAt(existing, args.svg),
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { status: "ok" as const, updated: true, id: existing._id, updatedAt: doc.updatedAt };
    }

    const id = await ctx.db.insert("moleculeOverrides", doc);
    return { status: "ok" as const, updated: false, id, updatedAt: doc.updatedAt };
  },
});

export const replicate = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    boldBonds: v.optional(v.array(v.number())),
    source: v.optional(
      v.union(v.literal("seeded"), v.literal("editor"), v.literal("template")),
    ),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule molblock.");
    }
    if (args.boldBonds && args.boldBonds.some((bond) => !Number.isInteger(bond) || bond < 0)) {
      throw new Error("Invalid molecule boldBonds.");
    }

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const doc = {
      slug: args.slug,
      svg: args.svg,
      molblock: args.molblock,
      smiles: args.smiles,
      boldBonds: args.boldBonds && args.boldBonds.length > 0 ? args.boldBonds : undefined,
      source: args.source,
      updatedAt: depictionUpdatedAt(existing, args.svg, args.updatedAt),
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("moleculeOverrides", doc);
    return { updated: false, id };
  },
});

export const applyTemplateDepiction = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule molblock.");
    }

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing && existing.source !== "seeded" && existing.source !== "template") {
      return {
        applied: false as const,
        slug: args.slug,
        reason: "protected-hand-edit" as const,
      };
    }

    const doc = {
      slug: args.slug,
      svg: args.svg,
      molblock: args.molblock,
      source: "template" as const,
      updatedAt: depictionUpdatedAt(existing, args.svg),
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { applied: true as const, slug: args.slug, updated: true };
    }

    await ctx.db.insert("moleculeOverrides", doc);
    return { applied: true as const, slug: args.slug, updated: false };
  },
});

export const rerenderSvg = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    expectedMolblock: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!existing) {
      return { updated: false as const, reason: "missing" as const };
    }
    if (existing.molblock !== args.expectedMolblock) {
      return { updated: false as const, reason: "molblock-changed" as const };
    }

    await ctx.db.patch(existing._id, {
      svg: args.svg,
      updatedAt: depictionUpdatedAt(existing, args.svg),
      updatedBy: args.updatedBy,
    });
    return { updated: true as const };
  },
});

export const seedMissing = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule molblock.");
    }

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      return { inserted: false, id: existing._id };
    }

    const id = await ctx.db.insert("moleculeOverrides", {
      slug: args.slug,
      svg: args.svg,
      molblock: args.molblock,
      smiles: args.smiles,
      source: "seeded",
      updatedAt: new Date().toISOString(),
      updatedBy: args.updatedBy,
    });
    return { inserted: true, id };
  },
});

export const remove = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidSlug(args.slug);

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
