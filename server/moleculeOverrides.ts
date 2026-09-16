import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

/**
 * Canonical molecule depictions used by the Molecules editor and public pages.
 *
 * One document per substance slug holds the current published depiction:
 *   • `svg`: the display asset rendered from the MOL block by OpenChemLib
 *   • `molblock`: the re-editable source of atom coordinates and bond stereo
 *
 * Reads are public. Public pages display `svg` when a document exists and show
 * no depiction when it does not. Writes require an editor or admin actor via
 * `requireRole`, matching the substance-article and index-layout editors.
 */

const SLUG_RE = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_APPLY_SLUGS = 50;

function assertValidSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid molecule slug: "${slug}".`);
  }
}

/**
 * A depiction URL identifies SVG bytes, not the time of a metadata-only save.
 * Advance past the stored timestamp when writes share a millisecond or a mirror
 * brings an older revision. Identical SVGs keep their already-published URL.
 */
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

/** Returns one canonical depiction by slug; null means none has been published. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/** Lightweight public lookup for choosing and versioning one article image. */
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

/**
 * Published depiction index used by the editor picker, seed tool, and cached
 * chemical-class computation. Substance articles use getMetadataBySlug instead.
 */
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

/**
 * Editor-only batch read used by the class-template preview. The bounded slug
 * list avoids turning this into a second public depiction index.
 */
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

/** Create or replace the canonical depiction for a slug. Admin only. */
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
      // Empty is stored as absent so untouched rows and cleared rows look alike.
      boldBonds: args.boldBonds && args.boldBonds.length > 0 ? args.boldBonds : undefined,
      source: "editor" as const,
      updatedAt: depictionUpdatedAt(existing, args.svg),
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

/**
 * Mirror tool for copying the canonical depiction set between deployments
 * (e.g. prod → dev). Preserves source and author provenance. Changed SVGs use
 * the incoming revision only when it advances the target; unchanged SVGs keep
 * their published revision. Not used by the editor.
 */
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

/**
 * Apply one already-previewed template depiction. Editor-authored rows are
 * protected inside the transaction so a hand edit that races the preview is
 * reported as a skip instead of being overwritten.
 */
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

    // Overwrite only rows explicitly marked machine-produced. A row without a
    // source marker predates the marker (e.g. a pre-unification hand edit) and
    // must be treated as a hand edit, not as fair game.
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

/**
 * Replace only the rendered `svg` of an existing row, preserving its molblock,
 * provenance (`source`), and smiles. Built for the one-time engine re-render
 * (RDKit → OpenChemLib): published articles pick up the new drawing without
 * changing what the editor loads or which rows a template apply may overwrite.
 *
 * `expectedMolblock` guards against racing an editor save — if the stored
 * molblock changed after the script read the row, the row is skipped so the
 * fresher hand edit keeps the svg that was rendered from it.
 */
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

/**
 * Add one automatic-layout baseline without replacing a concurrently-created row.
 * Batch scripts use the same editor-write guard as interactive saves.
 */
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

/** Remove a row (used for class overrides and deliberate seed rollback). */
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
