import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { auditStampFor } from "./lib/auditStamp";
import { requireRole } from "./lib/auth";
import { copyIndexRevision, prepareCopyIndexPublication, copyIndexContentEqual, journalCopyIndex } from "./lib/copyIndexPublication";

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => ctx.db.query("copyBlocks").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const getByKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicCopyBlocksByKeys: (keys: readonly string[]) => Promise<unknown[]>;
    };
    return db.getPublicCopyBlocksByKeys(keys);
  },
});

export const getForEditor = query({
  args: { key: v.string(), apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, { key, apiKey, actorEmail }) => {
    await requireRole(ctx, { apiKey, actorEmail, adminIntent: "editorArticleWrite" }, "editor");
    return { document: await ctx.db.query("copyBlocks").withIndex("by_key", (q) => q.eq("key", key)).unique(), revision: await copyIndexRevision(ctx, "copyBlocks", key) };
  },
});

/**
 * Editable site copy ("copy blocks").
 *
 * Public pages used to hardcode their prose. A copy block lifts one of those
 * strings into Postgres under a stable `key`, so the /dev Copy Studio can edit it
 * and the public read helper (`lib/next/copyBlocks.ts`) can serve it without a
 * deploy. Every block still has a checked-in local default, so an empty table
 * renders exactly what the hardcoded strings rendered.
 *
 * Reads are public on purpose: this is the copy a reader already sees. Writes
 * are admin-gated through `requireRole`: an editor's copy edits arrive as
 * change proposals and `approveAndApply` runs this same upsert with the
 * approving admin as the actor.
 */

export const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const;

const copyBlockKindValidator = v.union(
  v.literal("markdown"),
  v.literal("plain"),
  v.literal("list"),
);

/**
 * The editable fields of one block, as `upsert` takes them and as a change
 * proposal carries them. Shared so a proposal can never smuggle a shape the
 * direct save would refuse.
 */
export const copyBlockDocumentFields = {
  key: v.string(),
  flavor: v.optional(v.string()),
  kind: copyBlockKindValidator,
  body: v.optional(v.string()),
  items: v.optional(v.array(v.string())),
  label: v.string(),
  group: v.string(),
} as const;

export const copyBlockDocumentValidator = v.object(copyBlockDocumentFields);

export type CopyBlockDocument = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
};

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
  throw new PostgresError({ code: "invalidCopyBlock", message });
}

/**
 * `kind` decides which payload field is authoritative, so the other one is
 * cleared rather than left behind: a block that flips from a list to markdown
 * must not keep serving stale `items` to a reader whose renderer still looks.
 */
export function normalizeCopyBlockPayload(args: {
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

/** Metadata-only editor catalogue; full content and revision load by selected key. */
export const getEditorCatalogue = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("copyBlocks").collect();
    return rows.map(({ key, flavor, kind, label, group, updatedAt, updatedBy }) => ({
      key,
      flavor,
      kind,
      label,
      group,
      updatedAt,
      updatedBy,
    }));
  },
});

type UpsertCopyBlockArgs = CopyBlockDocument & {
  apiKey?: string;
  actorEmail?: string;
  updatedBy?: string;
  expected?: unknown;
  expectedRevision?: number;
  operationId?: string;
};

export async function upsertCopyBlockHandler(ctx: MutationCtx, args: UpsertCopyBlockArgs) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");

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
    updatedBy: auditStampFor(actor, args.updatedBy),
  };
  const prepared = await prepareCopyIndexPublication(ctx, { table: "copyBlocks", kind: "copyBlock", key, before: existing, after: document, expected: args.expected, expectedRevision: args.expectedRevision, operationId: args.operationId, actor });
  if (prepared.replayed) {
    const after = prepared.replayed.after;
    const id = after && typeof after === "object" && "_id" in after && typeof after._id === "string" ? ctx.db.normalizeId("copyBlocks", after._id) : null;
    if (!id) throw new Error("The stored publication receipt has no copy block identity.");
    return { updated: true, id, key, revision: prepared.revision, replayed: true, unchanged: false };
  }
  if (existing && copyIndexContentEqual("copyBlock", existing, document)) return { updated: true, id: existing._id, key, revision: prepared.revision, replayed: false, unchanged: true };
  const revision = prepared.revision + 1;
  const stored = document;
  const id = existing?._id ?? await ctx.db.insert("copyBlocks", stored);
  if (existing) await ctx.db.patch(id, stored);
  await journalCopyIndex(ctx, { table: "copyBlocks", key, before: existing, after: { ...stored, _id: id }, actor, revision, operationId: args.operationId, requestIdentity: prepared.requestIdentity });
  return { updated: !!existing, id, key, revision, replayed: false, unchanged: false };
}

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
    ...copyBlockDocumentFields,
    updatedBy: v.optional(v.string()),
    expected: v.optional(v.any()),
    expectedRevision: v.optional(v.number()),
    operationId: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.boolean(),
    id: v.id("copyBlocks"),
    key: v.string(),
    revision: v.number(),
    replayed: v.boolean(),
    unchanged: v.boolean(),
  }),
  handler: upsertCopyBlockHandler,
});

export async function removeCopyBlockHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; key: string; expected?: unknown; expectedRevision?: number; operationId?: string },
) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");

  const key = args.key.trim();
  const existing = await ctx.db
    .query("copyBlocks")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  const prepared = await prepareCopyIndexPublication(ctx, { table: "copyBlocks", kind: "copyBlock", key, before: existing, after: null, expected: args.expected, expectedRevision: args.expectedRevision, operationId: args.operationId, actor });
  if (prepared.replayed) return { removed: true, key, revision: prepared.revision, replayed: true, unchanged: false };
  if (!existing) return { removed: false, key, revision: prepared.revision, replayed: false, unchanged: true };
  const revision = prepared.revision + 1;
  await journalCopyIndex(ctx, { table: "copyBlocks", key, before: existing, after: null, actor, revision, operationId: args.operationId, requestIdentity: prepared.requestIdentity });
  await ctx.db.delete(existing._id);
  return { removed: true, key, revision, replayed: false, unchanged: false };
}

/**
 * Delete one copy block. Removing a row is not destructive to a reader: the
 * public helper falls straight back to the checked-in default for that key.
 */
export const remove = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    expected: v.optional(v.any()),
    expectedRevision: v.optional(v.number()),
    operationId: v.optional(v.string()),
  },
  returns: v.object({ removed: v.boolean(), key: v.string(), revision: v.number(), replayed: v.boolean(), unchanged: v.boolean() }),
  handler: removeCopyBlockHandler,
});
