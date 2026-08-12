import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireEditorWrite } from "./lib/auth";

/**
 * Editable site copy ("copy blocks").
 *
 * Public pages used to hardcode their prose. A copy block lifts one of those
 * strings into Convex under a stable `key`, so the /dev Copy Studio can edit it
 * and the public read helper (`lib/next/copyBlocks.ts`) can serve it without a
 * deploy. Every block still has a checked-in local default, so an empty table
 * renders exactly what the hardcoded strings rendered.
 *
 * Reads are public on purpose: this is the copy a reader already sees. Writes
 * are editor-gated through `requireEditorWrite`, the same delegated
 * server-token path the other editor tools use.
 */

export const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const;

const copyBlockKindValidator = v.union(
  v.literal("markdown"),
  v.literal("plain"),
  v.literal("list"),
);

const copyBlockDocValidator = v.object({
  _id: v.id("copyBlocks"),
  _creationTime: v.number(),
  key: v.string(),
  flavor: v.optional(v.string()),
  kind: copyBlockKindValidator,
  body: v.optional(v.string()),
  items: v.optional(v.array(v.string())),
  label: v.string(),
  group: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** A generous ceiling; the longest seeded block is a few paragraphs of prose. */
const BODY_MAX_LENGTH = 20_000;
const ITEM_MAX_LENGTH = 2_000;
const MAX_ITEMS = 64;

type CopyBlockKind = (typeof COPY_BLOCK_KINDS)[number];

function reject(message: string): never {
  throw new ConvexError({ code: "invalidCopyBlock", message });
}

/**
 * `kind` decides which payload field is authoritative, so the other one is
 * cleared rather than left behind: a block that flips from a list to markdown
 * must not keep serving stale `items` to a reader whose renderer still looks.
 */
function normalizeCopyBlockPayload(args: {
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
}): { body?: string; items?: string[] } {
  if (args.kind === "list") {
    const items = args.items ?? [];
    if (items.length > MAX_ITEMS) {
      reject(`A list copy block may hold at most ${MAX_ITEMS} items.`);
    }
    const trimmed = items
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (trimmed.some((item) => item.length > ITEM_MAX_LENGTH)) {
      reject(`Each list item must be ${ITEM_MAX_LENGTH} characters or fewer.`);
    }
    return { items: trimmed, body: undefined };
  }

  const body = args.body ?? "";
  if (body.length > BODY_MAX_LENGTH) {
    reject(`A copy block must be ${BODY_MAX_LENGTH} characters or fewer.`);
  }
  return { body, items: undefined };
}

/**
 * Every copy block, unfiltered. The table is one row per editable string —
 * tens of rows, not thousands — so the whole set is one read for both the
 * public helper and the Copy Studio rail.
 */
export const getAll = query({
  args: {},
  returns: v.array(copyBlockDocValidator),
  handler: async (ctx) => {
    return await ctx.db.query("copyBlocks").collect();
  },
});

/**
 * Create or replace one copy block, addressed by `key`.
 *
 * Idempotent by key: a retried save patches the same row instead of minting a
 * duplicate, which matters because the public read resolves a key to exactly
 * one block.
 */
export const upsert = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    flavor: v.optional(v.string()),
    kind: copyBlockKindValidator,
    body: v.optional(v.string()),
    items: v.optional(v.array(v.string())),
    label: v.string(),
    group: v.string(),
    updatedBy: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.boolean(),
    id: v.id("copyBlocks"),
    key: v.string(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const key = args.key.trim();
    if (!KEY_PATTERN.test(key)) {
      reject("A copy block key must be lower-case kebab-case.");
    }

    const label = args.label.trim();
    const group = args.group.trim();
    if (!label || !group) {
      reject("A copy block needs both a label and a group.");
    }

    const flavor = args.flavor?.trim();
    const payload = normalizeCopyBlockPayload({
      kind: args.kind,
      body: args.body,
      items: args.items,
    });

    const existing = await ctx.db
      .query("copyBlocks")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    const document = {
      key,
      flavor: flavor && flavor.length > 0 ? flavor : undefined,
      kind: args.kind,
      body: payload.body,
      items: payload.items,
      label,
      group,
      updatedAt: new Date().toISOString(),
      updatedBy: args.updatedBy ?? actor.email,
    };

    if (existing) {
      await ctx.db.patch(existing._id, document);
      return { updated: true, id: existing._id, key };
    }

    const id = await ctx.db.insert("copyBlocks", document);
    return { updated: false, id, key };
  },
});

/**
 * Delete one copy block. Removing a row is not destructive to a reader: the
 * public helper falls straight back to the checked-in default for that key.
 */
export const remove = mutation({
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
      .query("copyBlocks")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!existing) {
      return { removed: false, key };
    }

    await ctx.db.delete(existing._id);
    return { removed: true, key };
  },
});
