import type { PublicGalleryReplicationPreview } from "@/types/replications";

export const PRODUCTION_SHAPED_REPLICATION_COUNT = 6_733;

/** Deterministic gallery-sized fixture without checking in a multi-megabyte blob. */
export function productionShapedReplicationGallery(
  count = PRODUCTION_SHAPED_REPLICATION_COUNT,
): PublicGalleryReplicationPreview[] {
  return Array.from({ length: count }, (_, index) => {
    const artistNumber = index % 137;
    const effectNumber = index % 71;
    const type = index % 4 === 0 ? "video" : "image";
    const slug = `replication-${index.toString().padStart(5, "0")}`;

    return {
      _id: `fixture-${index}`,
      slug,
      title: `Replication study ${index}`,
      artist: `Artist ${artistNumber}`,
      type,
      format: type === "video" ? "mp4" : "webp",
      effect_slug: `effect-${effectNumber}`,
      effect_tags: [`effect-${effectNumber}`, `effect-${(effectNumber + 1) % 71}`],
      viewing_mode_tags: index % 3 === 0 ? ["closed-eye"] : ["open-eye"],
      artist_type_tags:
        index % 5 === 0
          ? ["traditional-psychedelic-artist"]
          : ["replicator"],
      url: `https://media.dose.wiki/media/${slug}.${type === "video" ? "mp4" : "webp"}`,
      ...(type === "video"
        ? {
            thumbnail_url: `https://media.dose.wiki/thumbs/${slug}.webp`,
            preview_url: `https://media.dose.wiki/previews/${slug}.mp4`,
            duration: 12 + (index % 240),
            has_audio: index % 2 === 0,
          }
        : {}),
      width: type === "video" ? 1920 : 1400,
      height: type === "video" ? 1080 : 1400,
      created_at: new Date(Date.UTC(2020 + (index % 7), index % 12, 1)).toISOString(),
    };
  });
}
