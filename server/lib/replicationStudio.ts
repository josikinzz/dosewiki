import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import {
  assertEffectExists,
  editorialSnapshotOf,
  editorialSnapshotsAgree,
  normalizeEffectTags,
} from "./replicationPolicy";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";
import type {
  BulkUpdateEditorialFieldsArgs,
  GetStudioRowsArgs,
  UpdateEditorialFieldsArgs,
} from "./replicationValidators";

const BULK_EDIT_LIMIT = 250;

export async function getStudioPreviewHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; slug: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "editor",
  );
  const matches = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .take(2);
  if (matches.length !== 1) return null;

  const { url, preview_url } = await resolveReplicationUrls(
    memoizedStorageUrls(ctx),
    matches[0],
    { thumbnail: false, motion: false },
  );
  return { slug: matches[0].slug, preview_url: preview_url ?? url };
}

export async function getStudioTotalHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "editor",
  );
  const db = ctx.db as typeof ctx.db & {
    getStudioReplicationTotal: () => Promise<number>;
  };
  return { totalCount: await db.getStudioReplicationTotal() };
}

export async function getStudioRowsHandler(
  ctx: QueryCtx,
  args: GetStudioRowsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "editor",
  );
  const rows = await ctx.db.query("replications").collect();
  const effects = await ctx.db.query("subjectiveEffects").collect();
  const effectNames = new Map(
    effects.map((effect) => [effect.slug, effect.name ?? effect.slug]),
  );

  const urls = memoizedStorageUrls(ctx);
  const resolved = await Promise.all(
    rows.map(async (row) => {
      const { url, thumbnail_url } = await resolveReplicationUrls(urls, row, {
        preview: false,
        motion: false,
      });
      return {
        id: row._id,
        slug: row.slug,
        title: row.title,
        artist: row.artist,
        artist_url: row.artist_url ?? null,
        role: row.role ?? ("replication" as const),
        type: row.type,
        effect_slug: row.effect_slug ?? null,
        effect_name: row.effect_slug
          ? effectNames.get(row.effect_slug) ?? row.effect_slug
          : null,
        effect_tags: row.effect_tags ?? [],
        title_drugs: row.title_drugs ?? [],
        title_class_mentions: row.title_class_mentions ?? [],
        credit_line: row.credit_line ?? null,
        rights_status: row.rights_status ?? null,
        source_url: row.source_url ?? null,
        rightsholder: row.rightsholder ?? null,
        url,
        thumbnail_url,
        preview_url: null,
        format: row.format,
        duration: row.duration ?? null,
        file_size: row.file_size ?? null,
        created_at: row.created_at,
        showcase_excluded: row.showcase_excluded ?? false,
      };
    }),
  );

  return {
    rows: resolved,
    effects: effects
      .map((effect) => ({ slug: effect.slug, name: effect.name ?? effect.slug }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function updateEditorialFieldsHandler(
  ctx: MutationCtx,
  args: UpdateEditorialFieldsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const row = await ctx.db.get(args.id);
  if (!row) throw new Error(`Replication ${args.id} no longer exists.`);

  const current = editorialSnapshotOf(row);
  const expected = {
    ...args.expected,
    effect_tags: [...args.expected.effect_tags].sort(),
  };
  if (!editorialSnapshotsAgree(current, expected)) {
    throw new Error(
      `Replication ${row.slug} changed since it was opened; reload the studio before saving.`,
    );
  }

  const title = args.updates.title.trim();
  const artist = args.updates.artist.trim();
  if (!title || !artist) {
    throw new Error(`Replication ${row.slug} needs a non-blank title and artist.`);
  }
  if (args.updates.effect_slug !== null) {
    await assertEffectExists(ctx, args.updates.effect_slug, `Replication ${row.slug}`);
  }
  const effectTags = normalizeEffectTags(args.updates.effect_tags);
  const creditLine = args.updates.credit_line?.trim() ?? "";

  await ctx.db.patch(args.id, {
    title,
    artist,
    role: args.updates.role,
    effect_slug: args.updates.effect_slug ?? undefined,
    credit_line: creditLine.length > 0 ? creditLine : undefined,
    effect_tags: effectTags.length > 0 ? effectTags : undefined,
  });
  return { success: true, slug: row.slug };
}

export async function bulkUpdateEditorialFieldsHandler(
  ctx: MutationCtx,
  args: BulkUpdateEditorialFieldsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (args.ids.length === 0) {
    throw new Error("A bulk edit needs at least one row.");
  }
  if (args.ids.length > BULK_EDIT_LIMIT) {
    throw new Error(
      `A bulk edit may touch at most ${BULK_EDIT_LIMIT} rows (got ${args.ids.length}).`,
    );
  }

  const artist = args.artist?.trim();
  if (args.artist !== undefined && !artist) {
    throw new Error("A bulk artist change needs a non-blank artist.");
  }
  if (args.effect_slug !== undefined) {
    await assertEffectExists(ctx, args.effect_slug, "Bulk edit");
  }
  const addTags = args.addEffectTags
    ? normalizeEffectTags(args.addEffectTags)
    : [];
  if (
    args.effect_slug === undefined
    && artist === undefined
    && args.role === undefined
    && args.showcase_excluded === undefined
    && addTags.length === 0
  ) {
    throw new Error("A bulk edit needs at least one field to change.");
  }

  const updatedSlugs: string[] = [];
  for (const id of args.ids) {
    const row = await ctx.db.get(id);
    if (!row) {
      throw new Error(
        `Replication ${id} no longer exists; reload the studio before applying.`,
      );
    }
    const nextTags = addTags.length > 0
      ? normalizeEffectTags([...(row.effect_tags ?? []), ...addTags])
      : row.effect_tags;
    await ctx.db.patch(id, {
      ...(args.effect_slug !== undefined ? { effect_slug: args.effect_slug } : {}),
      ...(artist ? { artist } : {}),
      ...(args.role !== undefined ? { role: args.role } : {}),
      ...(args.showcase_excluded !== undefined
        ? { showcase_excluded: args.showcase_excluded }
        : {}),
      ...(addTags.length > 0 ? { effect_tags: nextTags } : {}),
    });
    updatedSlugs.push(row.slug);
  }

  return { success: true, updated: updatedSlugs.length, slugs: updatedSlugs };
}
