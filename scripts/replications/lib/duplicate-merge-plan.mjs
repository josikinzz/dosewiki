const hasNativeStorage = (storageId) =>
  typeof storageId === "string" && storageId.length > 0 && !storageId.startsWith("placeholder-");

const duplicateGroupKey = (slug) => slug.toLowerCase().replaceAll("_", "-");

export function planHighConfidenceDuplicateMerges(replications) {
  const bySlug = Map.groupBy(replications, (replication) => duplicateGroupKey(replication.slug));
  const merges = [];
  const review = [];

  for (const [groupKey, members] of bySlug) {
    if (members.length < 2) continue;

    const unknown = members.filter((member) => member.effect_slug === "unknown");
    const assigned = members.filter((member) => member.effect_slug !== "unknown");

    if (members.length !== 2 || unknown.length !== 1 || assigned.length !== 1) {
      review.push({ slug: groupKey, members, reason: "duplicate group is not one assigned row plus one unknown row" });
      continue;
    }

    const [keeper] = assigned;
    const [duplicate] = unknown;
    if (!hasNativeStorage(duplicate.storage_id) || hasNativeStorage(keeper.storage_id)) {
      review.push({ slug: groupKey, members, reason: "storage ownership does not match the audited merge shape" });
      continue;
    }

    merges.push({
      slug: keeper.slug,
      keeperId: keeper._id,
      duplicateId: duplicate._id,
      keeperEffectSlug: keeper.effect_slug,
      duplicateStorageId: duplicate.storage_id,
      duplicateThumbnailStorageId: hasNativeStorage(duplicate.thumbnail_storage_id)
        ? duplicate.thumbnail_storage_id
        : undefined,
    });
  }

  return { merges, review };
}
