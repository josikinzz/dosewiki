import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getEffectShowcaseWorks: vi.fn(),
  getSubstanceShowcaseWorks: vi.fn(),
}));

vi.mock("@/app/_components/public-routes/showcaseCollections", () => ({
  getEffectShowcaseWorks: mocks.getEffectShowcaseWorks,
  getSubstanceShowcaseWorks: mocks.getSubstanceShowcaseWorks,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

const showcaseWork = {
  slug: "drifting-wood-grain",
  title: "Drifting (wood grain)",
  type: "image" as const,
  url: "https://media.example/drifting.webp",
  byline: "by Chelsea Morgan",
  artistName: "Chelsea Morgan",
  artistHref: "/contributors/chelsea",
  artistHrefExternal: false,
  effectSlug: "drifting",
  effectName: "Drifting",
};

describe("replication showcase collection", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.getSubstanceShowcaseWorks.mockReset().mockResolvedValue({
      works: [showcaseWork],
      collectionLabel: "LSD replications",
    });
    mocks.getEffectShowcaseWorks.mockReset().mockResolvedValue({
      works: [showcaseWork],
      effectName: "Drifting",
    });
  });

  it("returns the cacheable substance collection", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/replications/showcase?substance=lsd"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    await expect(response.json()).resolves.toEqual({ works: [showcaseWork] });
    expect(mocks.getSubstanceShowcaseWorks).toHaveBeenCalledWith("lsd", "en");
    expect(mocks.getEffectShowcaseWorks).not.toHaveBeenCalled();
  });

  it("returns the cacheable effect collection", async () => {
    const response = await GET(
      new Request(
        "https://dose.wiki/api/replications/showcase?effect=drifting",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ works: [showcaseWork] });
    expect(mocks.getEffectShowcaseWorks).toHaveBeenCalledWith("drifting", "en");
    expect(mocks.getSubstanceShowcaseWorks).not.toHaveBeenCalled();
  });

  it("reads a live mirror's collection for ?locale= and falls back to English for any other value", async () => {
    await GET(
      new Request("https://dose.wiki/api/replications/showcase?effect=drifting&locale=zh-Hans"),
    );
    expect(mocks.getEffectShowcaseWorks).toHaveBeenLastCalledWith("drifting", "zh-Hans");

    await GET(
      new Request("https://dose.wiki/api/replications/showcase?substance=lsd&locale=nl"),
    );
    expect(mocks.getSubstanceShowcaseWorks).toHaveBeenLastCalledWith("lsd", "en");
  });

  it("rejects requests naming neither or both collections", async () => {
    const neither = await GET(
      new Request("https://dose.wiki/api/replications/showcase"),
    );
    expect(neither.status).toBe(400);
    expect(neither.headers.get("Cache-Control")).toBe("private, no-store");

    const both = await GET(
      new Request(
        "https://dose.wiki/api/replications/showcase?substance=lsd&effect=drifting",
      ),
    );
    expect(both.status).toBe(400);
    expect(mocks.getSubstanceShowcaseWorks).not.toHaveBeenCalled();
    expect(mocks.getEffectShowcaseWorks).not.toHaveBeenCalled();
  });

  it("answers an unknown slug with an empty cacheable collection", async () => {
    mocks.getSubstanceShowcaseWorks.mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://dose.wiki/api/replications/showcase?substance=missing",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    await expect(response.json()).resolves.toEqual({ works: [] });
  });

  it("enforces the public content read limit before loading works", async () => {
    const limited = new Response("Too many requests", { status: 429 });
    mocks.enforceRateLimit.mockResolvedValueOnce(limited);

    const response = await GET(
      new Request("https://dose.wiki/api/replications/showcase?substance=lsd"),
    );

    expect(response).toBe(limited);
    expect(mocks.getSubstanceShowcaseWorks).not.toHaveBeenCalled();
  });

  it("does not cache a failed collection read", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    mocks.getEffectShowcaseWorks.mockRejectedValueOnce(
      new Error("data unavailable"),
    );

    const response = await GET(
      new Request(
        "https://dose.wiki/api/replications/showcase?effect=drifting",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
