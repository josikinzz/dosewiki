import { getPublicReportDetails } from "@server/convex/publicData";
import { openDataResponse } from "../shared";

/**
 * Open-data download: all published trip reports as full detail records.
 * Reads only the published `tripReports` table — submissions never appear —
 * and drops the editorial attribution-review stamp, which names the reviewing
 * editor and is internal moderation metadata. Refreshed daily by the
 * vercel.json cron.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse({
    dataset: "TripReports",
    items: await getPublicReportDetails(),
    sortBy: "slug",
    stripFields: ["attribution_review"],
  });
}
