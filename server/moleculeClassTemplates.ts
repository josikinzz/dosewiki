import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

const CLASS_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MOLBLOCK_BYTES = 256 * 1024;

function assertValidClassKey(classKey: string) {
  if (!CLASS_KEY_RE.test(classKey)) {
    throw new Error(`Invalid chemical class key: "${classKey}".`);
  }
}

export const getByClassKey = query({
  args: { classKey: v.string() },
  handler: async (ctx, { classKey }) => {
    assertValidClassKey(classKey);
    return await ctx.db
      .query("moleculeClassTemplates")
      .withIndex("by_class_key", (q) => q.eq("classKey", classKey))
      .first();
  },
});

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("moleculeClassTemplates").collect();
    return rows.map((row) => ({ classKey: row.classKey, updatedAt: row.updatedAt }));
  },
});

export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    classKey: v.string(),
    molblock: v.string(),
    boldBonds: v.optional(v.array(v.number())),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    assertValidClassKey(args.classKey);
    if (!args.molblock || args.molblock.length > MAX_MOLBLOCK_BYTES) {
      throw new Error("Invalid molecule class template molblock.");
    }
    if (args.boldBonds && args.boldBonds.some((bond) => !Number.isInteger(bond) || bond < 0)) {
      throw new Error("Invalid molecule class template boldBonds.");
    }

    const doc = {
      classKey: args.classKey,
      molblock: args.molblock,
      boldBonds: args.boldBonds && args.boldBonds.length > 0 ? args.boldBonds : undefined,
      updatedAt: Date.now(),
      updatedBy: args.updatedBy,
    };
    const existing = await ctx.db
      .query("moleculeClassTemplates")
      .withIndex("by_class_key", (q) => q.eq("classKey", args.classKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { updated: true, id: existing._id, updatedAt: doc.updatedAt };
    }

    const id = await ctx.db.insert("moleculeClassTemplates", doc);
    return { updated: false, id, updatedAt: doc.updatedAt };
  },
});
