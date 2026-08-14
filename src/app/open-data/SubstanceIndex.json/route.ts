import { getPublicFullSubstanceDocuments } from "@server/convex/publicData";
import { OPEN_DATA_CC0, openDataResponse } from "../shared";

/**
 * Open-data download: every substance article as a full document, the same
 * record shape as the committed `src/data/SubstanceIndex.json` export minus
 * internal editorial metadata. `editorial_review` names the reviewing editor
 * and `section_gaps` tracks unfinished editorial work; both are moderation
 * bookkeeping, not article content. Served live from Convex and refreshed
 * daily by the vercel.json cron.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "SubstanceIndex",
    license: OPEN_DATA_CC0,
    items: await getPublicFullSubstanceDocuments(),
    sortBy: "id",
    stripFields: ["editorial_review", "section_gaps"],
  });
}
