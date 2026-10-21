import type { Id } from "../../lib/postgres/runtime/dataModel";
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import {
  assertEffectExists,
  editorialSnapshotOf,
  editorialSnapshotsAgree,
  normalizeEffectTags,
} from "./replicationPolicy";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";
import { validateRightsCoherence } from "./replicationWrites";
import {
  isReplicationSourceUrl,
  replicationProvenanceGaps,
} from "../../src/types/replications";
import type {
  BulkUpdateEditorialFieldsArgs,
  GetStudioRowsArgs,
  ReplicationEditorialSnapshot,
  UpdateEditorialFieldsArgs,
} from "./replicationValidators";

const BULK_EDIT_LIMIT = 250;
const SHA256_R2_KEY = /^media\/sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\.[a-z0-9]+$/;

function sourceHashOf(row: { source_sha256?: string; r2_key?: string }): string | null {
  return row.source_sha256 ?? row.r2_key?.match(SHA256_R2_KEY)?.[1] ?? null;
}

type RightsStatus = NonNullable<ReplicationEditorialSnapshot["rights_status"]>;

function normalizedSource(value: string | null, context: string): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.length > 2000 || !isReplicationSourceUrl(trimmed)) {
    throw new Error(`${context}: the source must be an HTTP or HTTPS address.`);
  }
  return trimmed;
}

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
  return { totalCount: await ctx.db.getStudioReplicationTotal() };
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
        publication_state: row.publication_state ?? ("published" as const),
        source_sha256: sourceHashOf(row),
        width: row.width ?? null,
        height: row.height ?? null,
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

  const provenance: { rights_status?: RightsStatus; source_url?: string } = {};
  if (args.updates.rights_status !== undefined) {
    provenance.rights_status = args.updates.rights_status ?? undefined;
  }
  if (args.updates.source_url !== undefined) {
    provenance.source_url = normalizedSource(args.updates.source_url, `Replication ${row.slug}`);
  }
  if (Object.keys(provenance).length > 0) {
    validateRightsCoherence(row.slug, { ...row, ...provenance });
  }

  await ctx.db.patch(args.id, {
    title,
    artist,
    role: args.updates.role,
    effect_slug: args.updates.effect_slug ?? undefined,
    credit_line: creditLine.length > 0 ? creditLine : undefined,
    effect_tags: effectTags.length > 0 ? effectTags : undefined,
    ...provenance,
  });
  return { success: true, slug: row.slug };
}

export type BulkEditConflict = {
  id: string;
  slug: string | null;
  reason: string;
  code: "stale" | "missing" | "incomplete" | "invalid";
};

export async function bulkUpdateEditorialFieldsHandler(
  ctx: MutationCtx,
  args: BulkUpdateEditorialFieldsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const targets: { id: Id<"replications">; expected?: ReplicationEditorialSnapshot }[] = [
    ...(args.items ?? []),
    ...(args.ids ?? []).map((id) => ({ id })),
  ];
  if (targets.length === 0) {
    throw new Error("A bulk edit needs at least one row.");
  }
  if (targets.length > BULK_EDIT_LIMIT) {
    throw new Error(
      `A bulk edit may touch at most ${BULK_EDIT_LIMIT} rows (got ${targets.length}).`,
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
  const sourceUrl = args.source_url === undefined
    ? undefined
    : normalizedSource(args.source_url, "Bulk edit");
  if (args.source_url !== undefined && sourceUrl === undefined) {
    throw new Error("A bulk source change needs a source address.");
  }
  const creditLine = args.credit_line?.trim();
  if (args.credit_line !== undefined && (!creditLine || creditLine.length > 2000)) {
    throw new Error("A bulk credit change needs a credit line of at most 2000 characters.");
  }
  const provenance: { rights_status?: RightsStatus; source_url?: string; credit_line?: string } = {
    ...(args.rights_status !== undefined ? { rights_status: args.rights_status } : {}),
    ...(sourceUrl !== undefined ? { source_url: sourceUrl } : {}),
    ...(creditLine ? { credit_line: creditLine } : {}),
  };
  const editorial =
    args.effect_slug !== undefined
    || artist !== undefined
    || args.role !== undefined
    || addTags.length > 0
    || Object.keys(provenance).length > 0
    || args.publish === true;
  if (!editorial && args.showcase_excluded === undefined) {
    throw new Error("A bulk edit needs at least one field to change.");
  }
  if (editorial && targets.some((target) => !target.expected)) {
    throw new Error(
      "A bulk editorial change must send each row's expected values; reload the studio and try again.",
    );
  }

  const updatedSlugs: string[] = [];
  const publishedSlugs: string[] = [];
  const touchedEffects = new Set<string>();
  const conflicts: BulkEditConflict[] = [];
  for (const target of targets) {
    const row = await ctx.db.get(target.id);
    if (!row) {
      conflicts.push({ id: target.id, slug: null, reason: "It no longer exists.", code: "missing" });
      continue;
    }
    if (target.expected) {
      const expected = {
        ...target.expected,
        effect_tags: [...target.expected.effect_tags].sort(),
      };
      if (!editorialSnapshotsAgree(editorialSnapshotOf(row), expected)) {
        conflicts.push({
          id: target.id,
          slug: row.slug,
          reason: "Someone saved it after you loaded the studio.",
          code: "stale",
        });
        continue;
      }
    }
    const merged = { ...row, ...provenance };
    if (args.rights_status !== undefined || sourceUrl !== undefined) {
      try {
        validateRightsCoherence(row.slug, merged);
      } catch (error) {
        conflicts.push({
          id: target.id,
          slug: row.slug,
          reason: error instanceof Error ? error.message : "Its rights would be incoherent.",
          code: "invalid",
        });
        continue;
      }
    }
    let publish = false;
    if (args.publish) {
      if (row.publication_state === "duplicate-suppressed") {
        conflicts.push({
          id: target.id,
          slug: row.slug,
          reason: "It is a suppressed duplicate; its keeper is the published copy.",
          code: "invalid",
        });
        continue;
      }
      const gaps = replicationProvenanceGaps(merged);
      if (gaps.length > 0) {
        conflicts.push({
          id: target.id,
          slug: row.slug,
          reason: `It needs ${gaps.map((gap) => (gap === "rights" ? "a known rights status" : "a source")).join(" and ")} before it can publish.`,
          code: "incomplete",
        });
        continue;
      }
      publish = row.publication_state === "unpublished";
    }
    const nextTags = addTags.length > 0
      ? normalizeEffectTags([...(row.effect_tags ?? []), ...addTags])
      : row.effect_tags;
    await ctx.db.patch(target.id, {
      ...(args.effect_slug !== undefined ? { effect_slug: args.effect_slug } : {}),
      ...(artist ? { artist } : {}),
      ...(args.role !== undefined ? { role: args.role } : {}),
      ...(args.showcase_excluded !== undefined
        ? { showcase_excluded: args.showcase_excluded }
        : {}),
      ...(addTags.length > 0 ? { effect_tags: nextTags } : {}),
      ...provenance,
      ...(publish ? { publication_state: "published" as const } : {}),
    });
    updatedSlugs.push(row.slug);
    if (publish) publishedSlugs.push(row.slug);
    for (const slug of [row.effect_slug, args.effect_slug, ...(nextTags ?? [])]) {
      if (slug) touchedEffects.add(slug);
    }
  }

  return {
    success: true,
    updated: updatedSlugs.length,
    slugs: updatedSlugs,
    published: publishedSlugs,
    effects: [...touchedEffects].sort(),
    conflicts,
  };
}
