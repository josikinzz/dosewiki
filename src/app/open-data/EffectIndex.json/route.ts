import { getPublicEffectArticles } from "@server/convex/publicData";
import { openDataResponse } from "../shared";

/**
 * Open-data download: the complete Subjective Effect Index as full effect
 * detail records. Served live from Convex and refreshed daily by the
 * vercel.json cron.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "EffectIndex",
    items: await getPublicEffectArticles(),
    sortBy: "slug",
  });
}
