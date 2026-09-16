import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@server/data/publicLibrary", () => ({
  // Projection away from index internals (keywords, meta, score) is covered by
  // the publicLibrary tests; the route serves the cached projection verbatim.
  getPublicSearchSuggestions: vi.fn(async () => [
    {
      id: "substance:mdma",
      type: "substance",
      label: "MDMA",
      secondary: "Entactogen",
      slug: "mdma",
      aliases: ["Molly"],
    },
  ]),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

describe("search suggestions route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the public search rate-limit policy and preserves cache headers", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/search-suggestions?q=mdma&limit=1"));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicSearchRead");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=3600");
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          id: "substance:mdma",
          type: "substance",
          label: "MDMA",
          secondary: "Entactogen",
          slug: "mdma",
          aliases: ["Molly"],
        },
      ],
    });
  });

  it("allows larger localized result sets for the full search page", async () => {
    const { getPublicSearchSuggestions } = await import("@server/data/publicLibrary");
    const { GET } = await import("./route");

    await GET(
      new Request(
        "https://dose.wiki/api/search-suggestions?q=dmt&limit=60&locale=zh-Hans",
      ),
    );

    expect(getPublicSearchSuggestions).toHaveBeenCalledWith("dmt", 60, "zh-Hans");
  });

  it("returns the limiter response before searching when limited", async () => {
    const limitedResponse = NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(limitedResponse);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/search-suggestions?q=mdma&limit=1"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests. Please try again later.",
    });
  });
});
