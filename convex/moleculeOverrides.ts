import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireEditorWrite } from "./lib/auth";

/**
 * Molecule depiction overrides (the `/dev` → Molecules editor, live on the admin host).
 *
 * One document per substance slug holds a hand-authored skeletal-diagram fix:
 *   • `svg`      — the live display asset (the editor's in-browser RDKit.js render)
 *   • `molblock` — the re-editable source of truth (atom coords + wedge/hash stereo)
 *
 * Reads are public (the article render swaps in `svg` when an override exists);
 * writes require an editor/admin actor via `requireEditorWrite`, mirroring the
 * substance-article and index-layout editors.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;

function assertValidSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid molecule slug: "${slug}".`);
  }
}

/** One override document by slug. Null when the molecule uses the automatic layout. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("moleculeOverrides")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/**
 * The slugs that currently have an override. Small (overrides are rare hand-fixes),
 * so the article render can cheaply rewrite only the overridden molecule URLs and
 * the editor picker can badge them.
 */
export const listSlugs = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("moleculeOverrides").collect();
    return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt }));
  },
});

/** Create or replace the override for a slug. Editor/admin only. */
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

/** Remove the override for a slug, returning the molecule to its automatic layout. */
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
