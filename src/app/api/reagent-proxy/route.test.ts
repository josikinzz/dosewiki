import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { getPublicReagentTestBySlug } from "@server/data/publicData.reagents";

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));
vi.mock("@server/data/publicData.reagents", () => ({
  getPublicReagentTestBySlug: vi.fn(),
}));

const validPayload = {
  substance: {
    name: "MDMA",
    aliases: ["Ecstasy"],
  },
  reagents: [
    {
      reagent: "marq_desc",
      colors: [{ id: 24, name: "purple", simple: true, simpleColorId: 24 }],
      hint: "",
      isReacting: true,
    },
  ],
};

const mockedGetBySlug = vi.mocked(getPublicReagentTestBySlug);

describe("reagent snapshot route", () => {
  beforeEach(() => {
    mockedGetBySlug.mockReset();
    mockedGetBySlug.mockResolvedValue(validPayload);
  });

  it("reads a canonical slug from Postgres", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?slug=mdma"),
    );

    expect(response.status).toBe(200);
    expect(mockedGetBySlug).toHaveBeenCalledWith("mdma");
    await expect(response.json()).resolves.toEqual(validPayload);
  });

  it("returns 400 for missing or invalid slug parameters", async () => {
    const { GET } = await import("./route");

    const missing = await GET(new Request("https://dose.wiki/api/reagent-proxy"));
    const invalid = await GET(new Request("https://dose.wiki/api/reagent-proxy?slug=!!!"));

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(mockedGetBySlug).not.toHaveBeenCalled();
  });

  it("returns 403 for disallowed origins with CORS headers", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?slug=mdma", {
        headers: { origin: "https://example.com" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(mockedGetBySlug).not.toHaveBeenCalled();
  });

  it("returns the limiter response before reading Postgres", async () => {
    const limitedResponse = NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(limitedResponse);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/reagent-proxy?slug=mdma"));

    expect(response.status).toBe(429);
    expect(mockedGetBySlug).not.toHaveBeenCalled();
  });

  it("returns an empty success for a stored no-match", async () => {
    mockedGetBySlug.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?slug=unknown"),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
  });

  it("does not expose Postgres errors", async () => {
    mockedGetBySlug.mockRejectedValueOnce(new Error("secret deployment detail"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?slug=mdma"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Reagent data is temporarily unavailable.",
    });
  });
});
