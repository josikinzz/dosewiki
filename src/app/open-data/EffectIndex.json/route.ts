import { getPublicEffectArticles } from "@server/convex/publicData";
import { OPEN_DATA_EFFECT_INDEX_LICENSE, openDataResponse } from "../shared";

/**
 * Open-data download: the complete Subjective Effect Index as full effect
 * detail records. Served live from Convex and refreshed daily by the
 * vercel.json cron.
 *
 * Records reference replication media — `audio_replications` entries plus the
 * `gallery_order` and `social_media_image` image references — credited to
 * third-party creators that retain their rights, so the envelope license is
 * mixed rather than CC0.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "EffectIndex",
    license: OPEN_DATA_EFFECT_INDEX_LICENSE,
    items: await getPublicEffectArticles(),
    sortBy: "slug",
  });
}
