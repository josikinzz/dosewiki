import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOpenDataPayload } from "../openDataTestUtils";

const reports = [
  {
    _id: "tr2",
    _creationTime: 2,
    slug: "the-void",
    title: "The Void",
    subject: { name: "Anonymous" },
    substances: [{ name: "DMT" }],
    onset: [],
    peak: [{ time: "T+0:10", description: "Full narrative" }],
    offset: [],
    tags: ["breakthrough"],
    attribution_review: { reviewed_by: "editor", reviewed_at: "2026-01-01", decision: "declined" },
  },
  {
    _id: "tr1",
    _creationTime: 1,
    slug: "first-light",
    title: "First Light",
    subject: { name: "Kaylee" },
    substances: [{ name: "LSD" }],
    onset: [],
    peak: [],
    offset: [],
    tags: [],
  },
];

vi.mock("@server/convex/publicData", () => ({
  getPublicReportDetails: vi.fn(async () => reports),
}));

describe("open-data TripReports route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("serves all published trip reports with author-retained licence terms", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="TripReports.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );
    expect(response.headers.get("Content-Encoding")).toBe("gzip");

    const payload = await readOpenDataPayload(response);
    expect(payload.dataset).toBe("TripReports");
    // Legacy trip report rights remain with their authors; a blanket CC0
    // claim on this dataset would misstate the licence page's reuse matrix.
    expect(payload.license).toBe(
      "Mixed — rights to legacy trip reports remain with their authors unless marked otherwise",
    );
    expect(payload.licenseUrl).toBe("https://dose.wiki/docs/license");
    expect(payload.source).toBe("https://dose.wiki");
    expect(payload.count).toBe(2);
    expect(payload.count).toBe(payload.items.length);
    expect(Date.parse(payload.generatedAt)).not.toBeNaN();
  });

  it("sorts by slug and strips Convex and moderation internals", async () => {
    const { GET } = await import("./route");

    const payload = await readOpenDataPayload(await GET());

    expect(payload.items.map((item: { slug: string }) => item.slug)).toEqual([
      "first-light",
      "the-void",
    ]);
    for (const item of payload.items) {
      expect(item).not.toHaveProperty("_id");
      expect(item).not.toHaveProperty("_creationTime");
      expect(item).not.toHaveProperty("attribution_review");
    }
    expect(payload.items[1].peak).toEqual([
      { time: "T+0:10", description: "Full narrative" },
    ]);
  });

  it("revalidates daily", async () => {
    const route = await import("./route");

    expect(route.revalidate).toBe(86400);
  });
});
