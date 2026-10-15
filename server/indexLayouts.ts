import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";
import { mirrorPsychoactiveLayout } from "./lib/categoryLayoutMirror";
import { indexLayoutValidator } from "./lib/validators";
import { copyIndexRevision, prepareCopyIndexPublication, copyIndexContentEqual, journalCopyIndex } from "./lib/copyIndexPublication";

export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

export const getByType = query({
  args: { type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("indexLayouts").collect();
  },
});

export const getForEditor = query({
  args: { type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")), apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, { type, apiKey, actorEmail }) => {
    await requireRole(ctx, { apiKey, actorEmail, adminIntent: "editorArticleWrite" }, "editor");
    const document = await ctx.db.query("indexLayouts").withIndex("by_type", (q) => q.eq("type", type)).first();
    return document ? { ...document, revision: await copyIndexRevision(ctx, "indexLayouts", type) } : null;
  },
});

export const getAllForEditor = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "editor");
    const rows = await Promise.all((["psychoactive", "chemical", "mechanism"] as const).map(async (type) => {
      const document = await ctx.db.query("indexLayouts").withIndex("by_type", (q) => q.eq("type", type)).first();
      return document ? { ...document, revision: await copyIndexRevision(ctx, "indexLayouts", type) } : null;
    }));
    return rows.filter((row) => row !== null);
  },
});

type IndexLayoutSaveArgs = {
  apiKey?: string;
  actorEmail?: string;
  type: IndexLayoutType;
  version: number;
  categories: Doc<"indexLayouts">["categories"];
  expected?: unknown;
  expectedRevision?: number;
  operationId?: string;
};

export async function saveIndexLayoutHandler(ctx: MutationCtx, args: IndexLayoutSaveArgs) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");

  const { apiKey: _apiKey, actorEmail: _actorEmail, expected: _expected, expectedRevision: _expectedRevision, operationId: _operationId, ...layoutData } = args;
  const existing = await ctx.db
    .query("indexLayouts")
    .withIndex("by_type", (q) => q.eq("type", layoutData.type))
    .first();
  const prepared = await prepareCopyIndexPublication(ctx, { table: "indexLayouts", kind: "indexLayout", key: args.type, before: existing, after: layoutData, expected: args.expected, expectedRevision: args.expectedRevision, operationId: args.operationId, actor });
  if (prepared.replayed) return { updated: true, revision: prepared.revision, replayed: true, unchanged: false };
  if (existing && copyIndexContentEqual("indexLayout", existing, layoutData)) return { updated: true, id: existing._id, revision: prepared.revision, replayed: false, unchanged: true };
  const revision = prepared.revision + 1;
  const stored = layoutData;
  const id = existing?._id ?? await ctx.db.insert("indexLayouts", stored);
  if (existing) await ctx.db.patch(id, stored);
  await mirrorPsychoactiveLayout(ctx, layoutData);
  await journalCopyIndex(ctx, { table: "indexLayouts", key: args.type, before: existing, after: { ...stored, _id: id }, actor, revision, operationId: args.operationId, requestIdentity: prepared.requestIdentity });
  return { updated: !!existing, id, revision, replayed: false, unchanged: false };
}

export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    ...indexLayoutValidator.fields,
    expected: v.optional(v.any()),
    expectedRevision: v.optional(v.number()),
    operationId: v.optional(v.string()),
  },
  handler: saveIndexLayoutHandler,
});

export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    layouts: v.array(indexLayoutValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const layout of args.layouts) {
      try {
        const existing = await ctx.db
          .query("indexLayouts")
          .withIndex("by_type", (q) => q.eq("type", layout.type))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, layout);
          results.updated++;
        } else {
          await ctx.db.insert("indexLayouts", layout);
          results.created++;
        }
        await mirrorPsychoactiveLayout(ctx, layout);
      } catch (error) {
        results.errors.push(`Layout ${layout.type}: ${error}`);
      }
    }

    return results;
  },
});

export const deleteByType = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const existing = await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
