import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type {
  ReplicationEditorialSnapshot,
  ReplicationRightsPatch,
} from "./replicationValidators";

export const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_EFFECT_TAGS = 24;

export function definedReplicationRightsPatch(
  updates: ReplicationRightsPatch,
): ReplicationRightsPatch {
  const patch: ReplicationRightsPatch = {};
  for (const key of Object.keys(updates) as Array<keyof ReplicationRightsPatch>) {
    const value = updates[key];
    if (value !== undefined) {
      (patch[key] as typeof value) = value;
    }
  }
  return patch;
}

export function normalizeEffectTags(tags: readonly string[]): string[] {
  const normalized = [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ].sort();
  for (const tag of normalized) {
    if (!KEBAB_CASE.test(tag)) {
      throw new Error(`Effect tag is not an effect slug: ${tag}`);
    }
  }
  if (normalized.length > MAX_EFFECT_TAGS) {
    throw new Error(
      `An asset may carry at most ${MAX_EFFECT_TAGS} effect tags (got ${normalized.length}).`,
    );
  }
  return normalized;
}

export async function assertEffectExists(
  ctx: QueryCtx | MutationCtx,
  slug: string,
  context: string,
) {
  if (!KEBAB_CASE.test(slug)) {
    throw new Error(`${context}: effect slug is not kebab-case: ${slug}`);
  }
  const effect = await ctx.db
    .query("subjectiveEffects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (!effect) {
    throw new Error(`${context}: effect does not exist: ${slug}`);
  }
}

export function editorialSnapshotOf(row: {
  title: string;
  artist: string;
  role?: "replication" | "figure";
  effect_slug?: string;
  credit_line?: string;
  effect_tags?: string[];
}): ReplicationEditorialSnapshot {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role ?? "replication",
    effect_slug: row.effect_slug ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: [...(row.effect_tags ?? [])].sort(),
  };
}

export function editorialSnapshotsAgree(
  current: ReplicationEditorialSnapshot,
  expected: ReplicationEditorialSnapshot,
): boolean {
  return (
    current.title === expected.title
    && current.artist === expected.artist
    && current.role === expected.role
    && current.effect_slug === expected.effect_slug
    && current.credit_line === expected.credit_line
    && current.effect_tags.length === expected.effect_tags.length
    && current.effect_tags.every((tag, index) => tag === expected.effect_tags[index])
  );
}
