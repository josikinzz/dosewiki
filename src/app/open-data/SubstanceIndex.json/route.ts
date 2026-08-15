import { getPublicFullSubstanceDocuments } from "@server/convex/publicData";
import { OPEN_DATA_SUBSTANCE_INDEX_LICENSE, openDataResponse } from "../shared";

/**
 * Open-data download: every substance article as a full document, the same
 * record shape as the committed `src/data/SubstanceIndex.json` export minus
 * internal editorial metadata. `editorial_review` names the reviewing editor
 * and `section_gaps` tracks unfinished editorial work; both are moderation
 * bookkeeping, not article content. Served live from Convex and refreshed
 * daily by the vercel.json cron.
 *
 * The documents keep their `interactions` object, which is TripSit-derived, so
 * the envelope license is mixed rather than CC0.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "SubstanceIndex",
    license: OPEN_DATA_SUBSTANCE_INDEX_LICENSE,
    items: await getPublicFullSubstanceDocuments(),
    sortBy: "id",
    stripFields: ["editorial_review", "section_gaps"],
  });
}
