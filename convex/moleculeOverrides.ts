import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEditorWrite } from "./lib/auth";

/**
 * Canonical molecule depictions (the `/dev` → Molecules editor and public pages).
 *
 * One document per substance slug holds the current published depiction:
 *   • `svg`      — the live display asset (the editor's in-browser RDKit.js render)
 *   • `molblock` — the re-editable source of truth (atom coords + wedge/hash stereo)
 *
 * Reads are public (the article render uses `svg` when a document exists);
 * writes require an editor/admin actor via `requireEditorWrite`, mirroring the
 * substance-article and index-layout editors.
 */

const SLUG_RE = /^(class:)?[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;

function assertValidSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid molecule slug: "${slug}".`);
  }
}

/** One canonical depiction by slug. Null falls back to the legacy static asset. */
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

/** Create or replace the canonical depiction for a slug. Editor/admin only. */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    assertValidSlug(args.slug);
    if (!args.svg.includes("<svg") || args.svg.length > MAX_SVG_BYTES) {
      throw new Error("Invalid molecule svg.");
    }
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule molblock.");
    }

    const doc = {
      slug: args.slug,
      svg: args.svg,
      molblock: args.molblock,
      smiles: args.smiles,
      source: "editor" as const,
      updatedAt: new Date().toISOString(),
      updatedBy: args.updatedBy,
    };

    const existing = await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("moleculeOverrides", doc);
    return { updated: false, id };
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
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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
