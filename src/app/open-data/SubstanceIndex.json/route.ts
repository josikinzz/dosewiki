import { getPublicFullSubstanceDocuments } from "@server/convex/publicData";
import { openDataResponse } from "../shared";

/**
 * Open-data download: every substance article as a full document, the same
 * record shape as the committed `src/data/SubstanceIndex.json` export. Served
 * live from Convex and refreshed daily by the vercel.json cron.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "SubstanceIndex",
    items: await getPublicFullSubstanceDocuments(),
    sortBy: "id",
  });
}
