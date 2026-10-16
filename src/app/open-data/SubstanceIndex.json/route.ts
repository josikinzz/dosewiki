import { OPEN_DATA_DATASETS } from "@server/open-data/datasets";
import { openDataResponse } from "../shared";

export const revalidate = 86400;

export async function GET() {
  return openDataResponse(OPEN_DATA_DATASETS.SubstanceIndex);
}
