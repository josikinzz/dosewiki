import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SearchManifest } from "@/data/builders/searchManifest";
import { getPublicSearchManifest } from "@server/data/publicLibrary";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { GET } from "./route";

const manifest: SearchManifest = {
  locale: "en",
  version: "abc123",
  shape: 2,
  entries: [
    { id: "substance:mdma", type: "substance", label: "MDMA", slug: "mdma", aliases: ["Molly"] },
  ],
};

vi.mock("@server/data/publicLibrary", () => ({
  getPublicSearchManifest: vi.fn(async (locale = "en") => ({ ...manifest, locale })),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

describe("search manifest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates an unchanged manifest without downloading the body again", async () => {
    const initial = await GET(new Request("https://dose.wiki/api/search-manifest?locale=en"));
    const etag = initial.headers.get("ETag");

    expect(initial.status).toBe(200);
    expect(etag).not.toBeNull();
    expect(initial.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
    await expect(initial.json()).resolves.toEqual(manifest);

    const response = await GET(
      new Request("https://dose.wiki/api/search-manifest?locale=en", {
        headers: { "if-none-match": etag! },
      }),
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Cache-Control")).toBe(initial.headers.get("Cache-Control"));
    expect(await response.text()).toBe("");
  });

  it("sends updated content when the manifest version changes", async () => {
    const initial = await GET(new Request("https://dose.wiki/api/search-manifest?locale=en"));
    const etag = initial.headers.get("ETag")!;
    const updated = {
      ...manifest,
      version: "updated",
      entries: [...manifest.entries, {
        id: "substance:lsd", type: "substance" as const, label: "LSD", slug: "lsd",
      }],
    };
    vi.mocked(getPublicSearchManifest).mockResolvedValueOnce(updated);

    const response = await GET(
      new Request("https://dose.wiki/api/search-manifest?locale=en", {
        headers: { "if-none-match": etag },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).not.toBe(etag);
    await expect(response.json()).resolves.toEqual(updated);
  });

  it("does not treat another locale's ETag as a cache hit even with identical content versions", async () => {
    const english = await GET(new Request("https://dose.wiki/api/search-manifest?locale=en"));
    const englishEtag = english.headers.get("ETag")!;
    const chinese = await GET(
      new Request("https://dose.wiki/api/search-manifest?locale=zh-Hans", {
        headers: { "if-none-match": englishEtag },
      }),
    );
    const chineseEtag = chinese.headers.get("ETag")!;

    expect(chinese.status).toBe(200);
    expect(chineseEtag).not.toBe(englishEtag);
    await expect(chinese.json()).resolves.toMatchObject({
      locale: "zh-Hans", version: manifest.version,
    });
    expect(getPublicSearchManifest).toHaveBeenLastCalledWith("zh-Hans");

    const revalidated = await GET(
      new Request("https://dose.wiki/api/search-manifest?locale=zh-Hans", {
        headers: { "if-none-match": chineseEtag },
      }),
    );
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
  });

  it("returns the limiter response before building the manifest when limited", async () => {
    const limitedResponse = NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(limitedResponse);

    const response = await GET(new Request("https://dose.wiki/api/search-manifest"));

    expect(response.status).toBe(429);
    expect(getPublicSearchManifest).not.toHaveBeenCalled();
  });
});
