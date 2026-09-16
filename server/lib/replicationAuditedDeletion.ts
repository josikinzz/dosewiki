import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import type { DeleteAuditedRowArgs } from "./replicationValidators";

export async function deleteAuditedRowHandler(
  ctx: MutationCtx,
  args: DeleteAuditedRowArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db.get(args.id);
  if (
    !replication
    || replication.slug !== args.expectedSlug
    || replication.title !== args.expectedTitle
    || replication.artist !== args.expectedArtist
    || replication.storage_id !== args.expectedStorageId
  ) {
    throw new Error(`Audited replication deletion precondition failed: ${args.expectedSlug}`);
  }
  if (args.requireDuplicate) {
    const twins = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.expectedSlug))
      .collect();
    if (!twins.some((twin) => twin._id !== replication._id)) {
      throw new Error(`Audited replication duplicate no longer exists: ${args.expectedSlug}`);
    }
  }
  const [effects, galleries, playlists, dateResearch, taxonomyEvidence] = await Promise.all([
    ctx.db.query("subjectiveEffects").collect(),
    ctx.db.query("substanceGalleries").collect(),
    ctx.db.query("replicationPlaylists").collect(),
    ctx.db
      .query("replicationDateResearch")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", replication._id))
      .collect(),
    ctx.db
      .query("replicationTaxonomyEvidence")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", replication._id))
      .collect(),
  ]);
  const updatedAt = new Date().toISOString();
  let effectGalleryOrders = 0;
  let substanceGalleries = 0;
  let replicationPlaylists = 0;

  for (const effect of effects) {
    if (!effect.gallery_order?.includes(replication.slug)) continue;
    await ctx.db.patch(effect._id, {
      gallery_order: effect.gallery_order.filter((slug) => slug !== replication.slug),
    });
    effectGalleryOrders += 1;
  }
  for (const gallery of galleries) {
    if (
      !gallery.curated_slugs.includes(replication.slug)
      && !gallery.removed_slugs.includes(replication.slug)
    ) {
      continue;
    }
    await ctx.db.patch(gallery._id, {
      curated_slugs: gallery.curated_slugs.filter((slug) => slug !== replication.slug),
      removed_slugs: gallery.removed_slugs.filter((slug) => slug !== replication.slug),
      updated_at: updatedAt,
      updated_by: "audited-replication-deletion",
    });
    substanceGalleries += 1;
  }
  for (const playlist of playlists) {
    if (!playlist.replication_slugs.includes(replication.slug)) continue;
    await ctx.db.patch(playlist._id, {
      replication_slugs: playlist.replication_slugs.filter((slug) => slug !== replication.slug),
      updated_at: updatedAt,
      updated_by: "audited-replication-deletion",
    });
    replicationPlaylists += 1;
  }
  for (const row of dateResearch) await ctx.db.delete(row._id);
  for (const row of taxonomyEvidence) await ctx.db.delete(row._id);
  await ctx.db.delete(replication._id);
  return {
    deleted: true,
    slug: replication.slug,
    referencesRemoved: {
      effectGalleryOrders,
      substanceGalleries,
      replicationPlaylists,
      dateResearch: dateResearch.length,
      taxonomyEvidence: taxonomyEvidence.length,
    },
  };
}
