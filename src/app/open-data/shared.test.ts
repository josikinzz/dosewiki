import { describe, expect, it, vi } from "vitest";
import { OPEN_DATA_CACHE_CONTROL, type OpenDataDataset } from "@server/open-data/datasets";
import { readOpenDataPayload } from "./openDataTestUtils";
import { openDataResponse } from "./shared";

vi.mock("@server/data/publicData", () => ({}));

const dataset: OpenDataDataset = {
  name: "SubstanceIndex",
  license: "CC0",
  sortBy: "slug",
  stripFields: [],
  loadItems: async () => [{ slug: "b" }, { slug: "a" }],
};

describe("openDataResponse", () => {
  it("serves the built document as a gzipped, daily-cached JSON attachment", async () => {
    const response = await openDataResponse(dataset);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="SubstanceIndex.json"');
    expect(response.headers.get("Cache-Control")).toBe(OPEN_DATA_CACHE_CONTROL);
    expect(OPEN_DATA_CACHE_CONTROL).toBe("public, s-maxage=86400, stale-while-revalidate=86400");

    const payload = await readOpenDataPayload(response);
    expect(payload.dataset).toBe("SubstanceIndex");
    expect(payload.items.map((item) => item.slug)).toEqual(["a", "b"]);
  });
});
