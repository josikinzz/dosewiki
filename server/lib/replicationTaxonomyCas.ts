import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { requireAdminIntent } from "./auth";
import { assertEffectExists, normalizeEffectTags } from "./replicationPolicy";
import type { CompareAndSetEffectTaxonomyArgs } from "./replicationValidators";
import { isPlaceholderStorageId, isValidR2Key } from "./replicationUrls";

export type ReplicationTaxonomyLocator = {
  storage_id: string | null;
  r2_key: string | null;
  url: string | null;
};

function isValidDirectUrl(value: string | null) {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** A taxonomy CAS must be anchored to one real, unchanged main-media locator. */
export function replicationTaxonomyLocatorMatches(
  row: Pick<Doc<"replications">, "storage_id" | "r2_key" | "url">,
  expected: ReplicationTaxonomyLocator,
) {
  const hasLocator = isValidR2Key(expected.r2_key)
    || !isPlaceholderStorageId(expected.storage_id)
    || isValidDirectUrl(expected.url);
  return hasLocator
    && (row.storage_id ?? null) === expected.storage_id
    && (row.r2_key ?? null) === expected.r2_key
    && (row.url ?? null) === expected.url;
}

function nullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

function currentSnapshot(row: {
  _id: unknown;
  slug: string;
  title: string;
  artist: string;
  type: "video" | "image" | "audio";
  storage_id?: string;
  r2_key?: string;
  effect_slug?: string;
  effect_tags?: string[];
  replication_status?:
    | "replication"
    | "unclear"
    | "not-replication"
    | "unreviewed"
    | "source-corrupt";
  taxonomy_record_key?: string;
  taxonomy_source_digest?: string;
  taxonomy_version?: number;
  taxonomy_updated_at?: number;
}) {
  return {
    identity: {
      _id: row._id,
      slug: row.slug,
      title: row.title,
      artist: row.artist,
      type: row.type,
      storage_id: nullable(row.storage_id),
      r2_key: nullable(row.r2_key),
    },
    value: {
      effect_slug: nullable(row.effect_slug),
      effect_tags: row.effect_tags ?? [],
      replication_status: nullable(row.replication_status),
      taxonomy_record_key: nullable(row.taxonomy_record_key),
      taxonomy_source_digest: nullable(row.taxonomy_source_digest),
      taxonomy_version: nullable(row.taxonomy_version),
      taxonomy_updated_at: nullable(row.taxonomy_updated_at),
    },
  };
}

function snapshotsAgree(
  current: ReturnType<typeof currentSnapshot>,
  expected: CompareAndSetEffectTaxonomyArgs["expected"],
) {
  const currentIdentity = current.identity;
  const expectedIdentity = expected.identity;
  const currentValue = current.value;
  const expectedValue = expected.value;
  return currentIdentity._id === expectedIdentity._id
    && currentIdentity.slug === expectedIdentity.slug
    && currentIdentity.title === expectedIdentity.title
    && currentIdentity.artist === expectedIdentity.artist
    && currentIdentity.type === expectedIdentity.type
    && currentIdentity.storage_id === expectedIdentity.storage_id
    && currentIdentity.r2_key === expectedIdentity.r2_key
    && currentValue.effect_slug === expectedValue.effect_slug
    && currentValue.effect_tags.length === expectedValue.effect_tags.length
    && currentValue.effect_tags.every((tag, index) => tag === expectedValue.effect_tags[index])
    && currentValue.replication_status === expectedValue.replication_status
    && currentValue.taxonomy_record_key === expectedValue.taxonomy_record_key
    && currentValue.taxonomy_source_digest === expectedValue.taxonomy_source_digest
    && currentValue.taxonomy_version === expectedValue.taxonomy_version
    && currentValue.taxonomy_updated_at === expectedValue.taxonomy_updated_at;
}

async function requireScopedMaintenance(apiKey: string) {
  const authorization = await requireAdminIntent(apiKey, "replicationMaintenance");
  if (authorization.source !== "scoped") {
    throw new Error(
      "This operation requires the scoped replicationMaintenance credential; the legacy admin key is not accepted.",
    );
  }
}

export async function getStoredForTaxonomyCasHandler(
  ctx: QueryCtx,
  args: { apiKey: string; id: CompareAndSetEffectTaxonomyArgs["id"] },
) {
  await requireScopedMaintenance(args.apiKey);
  return await ctx.db.get(args.id);
}

export async function compareAndSetEffectTaxonomyHandler(
  ctx: MutationCtx,
  args: CompareAndSetEffectTaxonomyArgs,
) {
  await requireScopedMaintenance(args.apiKey);

  const row = await ctx.db.get(args.id);
  if (!row) throw new Error(`Replication ${args.id} no longer exists.`);
  if (!snapshotsAgree(currentSnapshot(row), args.expected)) {
    throw new Error(`Replication taxonomy CAS precondition failed: ${row.slug}.`);
  }

  await assertEffectExists(ctx, args.intended.effect_slug, `Replication ${row.slug}`);
  const effectTags = normalizeEffectTags(args.intended.effect_tags);
  if (JSON.stringify(effectTags) !== JSON.stringify(args.intended.effect_tags)) {
    throw new Error(`Replication ${row.slug} intended effect tags are not canonical and sorted.`);
  }
  for (const tag of effectTags) {
    await assertEffectExists(ctx, tag, `Replication ${row.slug} tag`);
  }

  await ctx.db.patch(args.id, {
    effect_slug: args.intended.effect_slug,
    effect_tags: effectTags,
  });
  return {
    success: true as const,
    id: args.id,
    slug: row.slug,
    effect_slug: args.intended.effect_slug,
    effect_tags: effectTags,
  };
}
