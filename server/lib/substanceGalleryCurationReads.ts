import type { QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import { memoizedStorageUrls, resolveReplicationUrls } from "./replicationUrls";
import {
  includeDirectlyAssociatedRows,
  matchSubstanceGalleryReplications,
  substanceGalleryTargetOf,
} from "../../src/data/substanceReplicationGallery";

/**
 * The substance for a slug, or null. Mirrors `substanceIndex:getPublicBySlug`:
 * a duplicated slug is ambiguous and treated as not found rather than letting
 * two articles fight over one gallery.
 */
export async function uniqueSubstanceBySlug(ctx: QueryCtx, slug: string) {
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(2);
  return matches.length === 1 ? matches[0] : null;
}

export async function getCurationDetailHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; substance_slug: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "editor",
  );

  const substance = await uniqueSubstanceBySlug(ctx, args.substance_slug);
  if (!substance) {
    return null;
  }

  const rows = await ctx.db.query("replications").collect();
  const target = substanceGalleryTargetOf(substance);
  const matches = target
    ? matchSubstanceGalleryReplications(rows, target).matches
    : [];

  const gallery = await ctx.db
    .query("substanceGalleries")
    .withIndex("by_substance", (q) => q.eq("substance_slug", args.substance_slug))
    .first();
  const available = includeDirectlyAssociatedRows(rows, matches, gallery);

  const effects = await ctx.db.query("subjectiveEffects").collect();
  const effectNames = new Map(effects.map((effect) => [effect.slug, effect.name ?? effect.slug]));

  // Effect identity remains presentation metadata for each work. It no
  // longer decides which substance articles receive the row.

  const resolvedUrls = memoizedStorageUrls(ctx);
  const resolved = await Promise.all(
    available.map(async ({ row, provenance }) => {
      const { url, thumbnail_url } = await resolveReplicationUrls(resolvedUrls, row, { preview: false });
      return {
        replication: {
          id: row._id,
          slug: row.slug,
          title: row.title,
          artist: row.artist,
          type: row.type,
          effect_slug: row.effect_slug ?? null,
          effect_name: row.effect_slug
            ? effectNames.get(row.effect_slug) ?? row.effect_slug
            : null,
          effect_tags: row.effect_tags ?? [],
          credit_line: row.credit_line ?? null,
          rights_status: row.rights_status ?? null,
          url,
          thumbnail_url,
          format: row.format,
        },
        provenance: {
          ...provenance,
          effectName:
            provenance.matchedVia === "specific_drug"
              ? substance.title
              : provenance.matchedVia === "drug_class"
                ? provenance.drugClass
                : effectNames.get(provenance.effectSlug) ?? provenance.effectSlug,
        },
      };
    }),
  );

  return {
    substance: { slug: substance.slug, title: substance.title },
    matches: resolved,
    curation: gallery
      ? {
          curated_slugs: gallery.curated_slugs,
          removed_slugs: gallery.removed_slugs,
          carousel_order: gallery.carousel_order ?? [],
          disabled: gallery.disabled ?? false,
          updated_at: gallery.updated_at,
          updated_by: gallery.updated_by,
        }
      : null,
  };
}
