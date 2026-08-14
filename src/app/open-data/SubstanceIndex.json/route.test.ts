import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOpenDataPayload } from "../openDataTestUtils";

const documents = [
  { _id: "cx2", _creationTime: 2, id: 7, title: "Zeta", slug: "zeta" },
  { _id: "cx1", _creationTime: 1, id: 3, title: "Alpha", slug: "alpha" },
  { _id: "cx3", _creationTime: 3, id: null, title: "Legacy", slug: "legacy" },
];

vi.mock("@server/convex/publicData", () => ({
  getPublicFullSubstanceDocuments: vi.fn(async () => documents),
}));

describe("open-data SubstanceIndex route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("serves the full substance corpus as a CC0 attachment", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="SubstanceIndex.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );
    expect(response.headers.get("Content-Encoding")).toBe("gzip");

    const payload = await readOpenDataPayload(response);
    expect(payload.dataset).toBe("SubstanceIndex");
    expect(payload.license).toBe("CC0-1.0");
    expect(payload.source).toBe("https://dose.wiki");
    expect(payload.count).toBe(3);
    expect(payload.count).toBe(payload.items.length);
    expect(Date.parse(payload.generatedAt)).not.toBeNaN();
  });

  it("sorts by article id with null ids last, mirroring the committed export", async () => {
    const { GET } = await import("./route");

    const payload = await readOpenDataPayload(await GET());

    expect(payload.items.map((item: { title: string }) => item.title)).toEqual([
      "Alpha",
      "Zeta",
      "Legacy",
    ]);
  });

  it("strips Convex internal fields from every item", async () => {
    const { GET } = await import("./route");

    const payload = await readOpenDataPayload(await GET());

    for (const item of payload.items) {
      expect(item).not.toHaveProperty("_id");
      expect(item).not.toHaveProperty("_creationTime");
    }
  });

  it("revalidates daily", async () => {
    const route = await import("./route");

    expect(route.revalidate).toBe(86400);
  });
});
