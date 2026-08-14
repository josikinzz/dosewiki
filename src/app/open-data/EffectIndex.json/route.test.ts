import { beforeEach, describe, expect, it, vi } from "vitest";

const articles = [
  { _id: "fx2", _creationTime: 2, slug: "visual-drifting", name: "Visual drifting", body: "Full article" },
  { _id: "fx1", _creationTime: 1, slug: "analysis-enhancement", name: "Analysis enhancement", body: "Full article" },
];

vi.mock("@server/convex/publicData", () => ({
  getPublicEffectArticles: vi.fn(async () => articles),
}));

describe("open-data EffectIndex route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("serves the complete effect index as a CC0 attachment", async () => {
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="EffectIndex.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );

    const payload = await response.json();
    expect(payload.dataset).toBe("EffectIndex");
    expect(payload.license).toBe("CC0-1.0");
    expect(payload.source).toBe("https://dose.wiki");
    expect(payload.count).toBe(2);
    expect(payload.count).toBe(payload.items.length);
    expect(Date.parse(payload.generatedAt)).not.toBeNaN();
  });

  it("sorts by slug and strips Convex internal fields", async () => {
    const { GET } = await import("./route");

    const payload = await (await GET()).json();

    expect(payload.items.map((item: { slug: string }) => item.slug)).toEqual([
      "analysis-enhancement",
      "visual-drifting",
    ]);
    for (const item of payload.items) {
      expect(item).not.toHaveProperty("_id");
      expect(item).not.toHaveProperty("_creationTime");
      expect(item.body).toBe("Full article");
    }
  });

  it("revalidates daily", async () => {
    const route = await import("./route");

    expect(route.revalidate).toBe(86400);
  });
});
