import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { auditStampFor } from "./lib/auditStamp";
import { requireRole, roleMeetsFloor, type AuthorizedActor } from "./lib/auth";
import { recordRevision } from "./lib/contentRevisions";
import { isShowcaseEligible } from "../src/data/substanceReplicationGallery";

const MAX_PLAYLIST_SLUGS = 250;

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ActorArgs = { apiKey?: string; actorEmail?: string };

type PlaylistRow = Doc<"replicationPlaylists">;

export function canEditPlaylist(
  actor: Pick<AuthorizedActor, "role" | "email">,
  row: Pick<PlaylistRow, "owner_email">,
): boolean {
  return actor.role === "admin" || (row.owner_email !== undefined && row.owner_email === actor.email);
}

function requireOwnership(actor: AuthorizedActor, row: PlaylistRow): void {
  if (canEditPlaylist(actor, row)) return;
  throw new PostgresError({
    code: "NOT_OWNER",
    message: row.owner_email
      ? `"${row.title}" belongs to ${row.owner_email}; only its owner or an admin may change it.`
      : `"${row.title}" has no owner; only an admin may change it.`,
  });
}

async function requireMemberEmail(ctx: QueryCtx | MutationCtx, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .unique();
  if (!membership) {
    throw new PostgresError({ code: "MEMBER_NOT_FOUND", message: `No membership for ${normalized}.` });
  }
  return normalized;
}

export type PlaylistSummaryProjection = {
  key: string;
  title: string;
  work_count: number;
  updated_at: string;
  updated_by: string | null;
  owner_email: string | null;
  editable: boolean;
};

export type PlaylistProjection = {
  key: string;
  title: string;
  replication_slugs: string[];
  updated_at: string;
  updated_by: string | null;
  owner_email: string | null;
  editable: boolean;
};

function projectPlaylist(row: PlaylistRow, actor: AuthorizedActor): PlaylistProjection {
  return {
    key: row.key,
    title: row.title,
    replication_slugs: row.replication_slugs,
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? null,
    owner_email: row.owner_email ?? null,
    editable: canEditPlaylist(actor, row),
  };
}

async function findPlaylistRow(ctx: QueryCtx | MutationCtx, key: string) {
  return await ctx.db
    .query("replicationPlaylists")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

async function findPlaylist(ctx: QueryCtx | MutationCtx, key: string) {
  const row = await findPlaylistRow(ctx, key);
  return row && !row.archived_at ? row : null;
}

function projectPlaylistSummary(
  row: Omit<PlaylistSummaryProjection, "editable">,
  actor: AuthorizedActor,
): PlaylistSummaryProjection {
  return {
    ...row,
    editable:
      actor.role === "admin" ||
      (row.owner_email !== null && row.owner_email === actor.email),
  };
}

function byTitle<T extends { title: string }>(left: T, right: T): number {
  return left.title.localeCompare(right.title);
}

export async function listHandler(ctx: QueryCtx, args: ActorArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "editor",
  );
  const rows = await ctx.db.getReplicationPlaylistSummaryRows();
  return rows.map((row) => projectPlaylistSummary(row, actor)).sort(byTitle);
}

export const list = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: listHandler,
});

export async function listOwnedHandler(ctx: QueryCtx, args: ActorArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "contributor",
  );
  const rows = await ctx.db.getReplicationPlaylistSummaryRows(
    actor.role === "admin" ? undefined : actor.email,
  );
  return rows.map((row) => projectPlaylistSummary(row, actor)).sort(byTitle);
}

export const listOwned = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: listOwnedHandler,
});

export async function getHandler(ctx: QueryCtx, args: ActorArgs & { key: string }) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "contributor",
  );
  const row = await findPlaylist(ctx, args.key);
  if (!row) return null;
  if (!roleMeetsFloor(actor.role, "editor") && !canEditPlaylist(actor, row)) return null;
  return projectPlaylist(row, actor);
}

export const get = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), key: v.string() },
  handler: getHandler,
});

type UpsertArgs = ActorArgs & {
  key: string;
  title: string;
  replication_slugs: string[];
  updatedBy?: string;
  expectedUpdatedAt?: string | null;
  owner_email?: string;
};

export async function upsertHandler(ctx: MutationCtx, args: UpsertArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  if (!KEBAB_CASE.test(args.key)) {
    throw new Error(`Playlist key "${args.key}" must be kebab-case.`);
  }
  const title = args.title.trim();
  if (title.length === 0) {
    throw new Error("A playlist needs a name.");
  }
  if (args.replication_slugs.length > MAX_PLAYLIST_SLUGS) {
    throw new Error(
      `This playlist holds ${args.replication_slugs.length} works; the limit is ${MAX_PLAYLIST_SLUGS}. Split it into two playlists.`,
    );
  }

  const stored = await findPlaylistRow(ctx, args.key);
  if (stored?.archived_at) {
    throw new PostgresError({
      code: "PLAYLIST_ARCHIVED",
      message: `"${stored.title}" was removed on ${stored.archived_at.slice(0, 10)} and still holds the key "${args.key}". An admin can restore it, or pick another key.`,
    });
  }
  const existing = stored;
  if (existing) {
    requireOwnership(actor, existing);
  }

  let owner_email: string | undefined;
  if (!existing) {
    if (actor.role !== "admin") {
      owner_email = actor.email;
    } else if (args.owner_email !== undefined) {
      owner_email = await requireMemberEmail(ctx, args.owner_email);
    }
  } else if (args.owner_email !== undefined && actor.role !== "admin") {
    throw new PostgresError({
      code: "FORBIDDEN",
      message: "Only an admin may change who owns a playlist.",
    });
  }

  const expected = args.expectedUpdatedAt;
  if (
    expected !== undefined &&
    (expected === null ? existing !== null : existing?.updated_at !== expected)
  ) {
    return {
      status: "conflict" as const,
      server: {
        key: args.key,
        title: existing?.title ?? "",
        replication_slugs: existing?.replication_slugs ?? [],
        updated_at: existing?.updated_at ?? "",
        updated_by: existing?.updated_by ?? null,
        owner_email: existing?.owner_email ?? null,
      },
    };
  }

  const rows = await ctx.db.query("replications").collect();
  const eligible = new Set(rows.filter(isShowcaseEligible).map((row) => row.slug));
  const slugs: string[] = [];
  const pruned: string[] = [];
  const seen = new Set<string>();
  for (const slug of args.replication_slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (eligible.has(slug)) slugs.push(slug);
    else pruned.push(slug);
  }

  const updated_at = new Date().toISOString();
  const updated_by = auditStampFor(actor, args.updatedBy);

  if (existing) {
    const patch: Partial<PlaylistRow> = { title, replication_slugs: slugs, updated_at, updated_by };
    if (args.owner_email !== undefined) {
      patch.owner_email = await requireMemberEmail(ctx, args.owner_email);
      owner_email = patch.owner_email;
    } else {
      owner_email = existing.owner_email;
    }
    await recordRevision(ctx, { table: "replicationPlaylists", key: existing.key, action: "update", before: existing, after: { ...existing, ...patch }, actor });
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("replicationPlaylists", {
      key: args.key,
      owner_email,
      title,
      replication_slugs: slugs,
      updated_at,
      updated_by,
    });
  }

  return {
    status: "ok" as const,
    updated: Boolean(existing),
    key: args.key,
    title,
    replication_slugs: slugs,
    pruned,
    updated_at,
    updated_by,
    owner_email: owner_email ?? null,
    editable: true,
  };
}

export const upsert = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    title: v.string(),
    replication_slugs: v.array(v.string()),
    updatedBy: v.optional(v.string()),
    expectedUpdatedAt: v.optional(v.union(v.string(), v.null())),
    owner_email: v.optional(v.string()),
  },
  handler: upsertHandler,
});

type SetMembershipArgs = ActorArgs & { key: string; replicationSlug: string; included: boolean };

export async function setMembershipHandler(ctx: MutationCtx, args: SetMembershipArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );
  const existing = await findPlaylist(ctx, args.key);
  if (!existing) {
    throw new Error(`Playlist "${args.key}" not found.`);
  }
  requireOwnership(actor, existing);
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.replicationSlug))
    .first();
  if (!replication || !isShowcaseEligible(replication)) {
    throw new Error(`Replication "${args.replicationSlug}" is not playlist-eligible.`);
  }
  const slugs = args.included
    ? existing.replication_slugs.includes(args.replicationSlug)
      ? existing.replication_slugs
      : [...existing.replication_slugs, args.replicationSlug]
    : existing.replication_slugs.filter((slug) => slug !== args.replicationSlug);
  if (slugs.length > MAX_PLAYLIST_SLUGS) {
    throw new Error(`This playlist holds more than ${MAX_PLAYLIST_SLUGS} works.`);
  }
  const updated_at = new Date().toISOString();
  await recordRevision(ctx, { table: "replicationPlaylists", key: existing.key, action: "update", before: existing, actor });
  await ctx.db.patch(existing._id, {
    replication_slugs: slugs,
    updated_at,
    updated_by: actor.email,
  });
  return {
    status: "ok" as const,
    key: existing.key,
    title: existing.title,
    replication_slugs: slugs,
    updated_at,
    updated_by: actor.email,
    owner_email: existing.owner_email ?? null,
    editable: true,
  };
}

export const setMembership = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    replicationSlug: v.string(),
    included: v.boolean(),
  },
  handler: setMembershipHandler,
});

export async function removeHandler(ctx: MutationCtx, args: ActorArgs & { key: string }) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );
  const existing = await findPlaylist(ctx, args.key);
  if (!existing) {
    return { status: "missing" as const, key: args.key };
  }
  requireOwnership(actor, existing);
  await recordRevision(ctx, { table: "replicationPlaylists", key: existing.key, action: "remove", before: existing, actor });
  await ctx.db.patch(existing._id, { archived_at: new Date().toISOString(), archived_by: actor.email });
  return { status: "ok" as const, key: args.key };
}

export const remove = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  handler: removeHandler,
});

export async function restoreHandler(ctx: MutationCtx, args: ActorArgs & { key: string }) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
  const row = await findPlaylistRow(ctx, args.key);
  if (!row) {
    return { status: "missing" as const, key: args.key };
  }
  if (!row.archived_at) {
    return { status: "live" as const, key: args.key };
  }
  await ctx.db.patch(row._id, {
    archived_at: undefined,
    archived_by: undefined,
    updated_at: new Date().toISOString(),
    updated_by: actor.email,
  });
  return { status: "ok" as const, key: args.key };
}

export const restore = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  handler: restoreHandler,
});

export const listArchived = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "admin",
    );
    const rows = await ctx.db.query("replicationPlaylists").collect();
    return rows
      .filter((row) => row.archived_at)
      .sort((left, right) => (right.archived_at ?? "").localeCompare(left.archived_at ?? ""))
      .map((row) => ({
        ...projectPlaylist(row, actor),
        archived_at: row.archived_at ?? null,
        archived_by: row.archived_by ?? null,
      }));
  },
});

type AssignOwnerArgs = ActorArgs & { key: string; ownerEmail: string | null };

export async function assignOwnerHandler(ctx: MutationCtx, args: AssignOwnerArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
  const existing = await findPlaylist(ctx, args.key);
  if (!existing) {
    return { status: "missing" as const, key: args.key };
  }
  const owner_email =
    args.ownerEmail === null ? undefined : await requireMemberEmail(ctx, args.ownerEmail);
  const updated_at = new Date().toISOString();
  await ctx.db.patch(existing._id, { owner_email, updated_at, updated_by: actor.email });
  return {
    status: "ok" as const,
    key: existing.key,
    owner_email: owner_email ?? null,
    updated_at,
    updated_by: actor.email,
  };
}

export const assignOwner = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    ownerEmail: v.union(v.string(), v.null()),
  },
  handler: assignOwnerHandler,
});
