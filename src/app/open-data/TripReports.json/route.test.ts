import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openDataResponse: vi.fn() }));

vi.mock("../shared", () => ({ openDataResponse: mocks.openDataResponse }));
vi.mock("@server/data/publicData", () => ({
  getPublicFullSubstanceDocuments: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicReportDetails: vi.fn(),
}));

import { OPEN_DATA_DATASETS } from "@server/open-data/datasets";
import * as route from "./route";

/** Dataset behaviour: lib/open-data/datasets.test.ts. Envelope headers: src/app/open-data/shared.test.ts. */
describe("open-data TripReports route", () => {
  it("serves the TripReports dataset and revalidates daily", async () => {
    const marker = new Response(null, { status: 200 });
    mocks.openDataResponse.mockResolvedValue(marker);

    await expect(route.GET()).resolves.toBe(marker);
    expect(mocks.openDataResponse).toHaveBeenCalledWith(OPEN_DATA_DATASETS.TripReports);
    expect(route.revalidate).toBe(86400);
  });
});
