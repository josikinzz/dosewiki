import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const manifest = {
  version: "abc123",
  shape: 1,
  entries: [
    { id: "substance:mdma", type: "substance", label: "MDMA", slug: "mdma", aliases: ["Molly"] },
  ],
};

vi.mock("@server/convex/publicLibrary", () => ({
  getPublicSearchManifest: vi.fn(async () => manifest),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const EXPECTED_ETAG = 'W/"1-abc123"';

describe("search manifest route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("serves the manifest with a content-derived ETag", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/search-manifest"));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicContentApiRead");
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(EXPECTED_ETAG);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
    await expect(response.json()).resolves.toEqual(manifest);
  });

  it("revalidates to 304 so a returning client re-downloads nothing", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/search-manifest", {
        headers: { "if-none-match": EXPECTED_ETAG },
      }),
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(EXPECTED_ETAG);
  });

  it("sends the body again when the cached copy is stale", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/search-manifest", {
        headers: { "if-none-match": 'W/"1-outdated"' },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns the limiter response before building the manifest when limited", async () => {
    const limitedResponse = NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(limitedResponse);
    const { getPublicSearchManifest } = await import("@server/convex/publicLibrary");
    vi.mocked(getPublicSearchManifest).mockClear();
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/search-manifest"));

    expect(response.status).toBe(429);
    expect(getPublicSearchManifest).not.toHaveBeenCalled();
  });
});
