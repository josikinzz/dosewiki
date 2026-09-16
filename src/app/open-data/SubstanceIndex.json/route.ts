import { OPEN_DATA_DATASETS } from "@server/open-data/datasets";
import { openDataResponse } from "../shared";

/**
 * Open-data download: the substance corpus described by
 * `OPEN_DATA_DATASETS.SubstanceIndex`. Served live from Postgres and refreshed
 * daily by the vercel.json cron.
 */
export const revalidate = 86400;

export async function GET() {
  return openDataResponse(OPEN_DATA_DATASETS.SubstanceIndex);
}
