import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
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

describe("reagent proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(validPayload)),
    );
  });

  it("returns 400 for missing or invalid substance parameters", async () => {
    const { GET } = await import("./route");

    const missing = await GET(new Request("https://dose.wiki/api/reagent-proxy"));
    const invalid = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=!!!"));

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
  });

  it("returns 403 for disallowed origins with CORS headers", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?substance=mdma", {
        headers: { origin: "https://example.com" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns the limiter response before fetching upstream", async () => {
    const limitedResponse = NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(limitedResponse);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=mdma"));

    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps upstream 404 and other upstream errors", async () => {
    const { GET } = await import("./route");

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "missing" }, { status: 404 }));
    const missing = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=unknown"));

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "bad" }, { status: 503 }));
    const upstreamError = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=mdma"));

    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("s-maxage=300, stale-while-revalidate=1800");
    await expect(missing.json()).resolves.toEqual({ error: "Substance not found" });
    expect(upstreamError.status).toBe(502);
    await expect(upstreamError.json()).resolves.toEqual({ error: "Upstream API error" });
  });

  it("validates and returns successful ProtestKit output", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/reagent-proxy?substance=MDMA!", {
        headers: { origin: "https://dose.wiki" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://dose.wiki");
    expect(response.headers.get("Cache-Control")).toBe("s-maxage=3600, stale-while-revalidate=86400");
    expect(fetch).toHaveBeenCalledWith("https://protestkit.eu/api/v1/mdma", expect.any(Object));
    await expect(response.json()).resolves.toEqual(validPayload);
  });

  it("maps upstream timeouts without leaking upstream details", async () => {
    const abortError = new Error("leaked upstream url");
    abortError.name = "AbortError";
    vi.mocked(fetch).mockRejectedValueOnce(abortError);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=mdma"));

    expect(response.status).toBe(504);
    expect(response.headers.get("Cache-Control")).toBe("s-maxage=300, stale-while-revalidate=1800");
    await expect(response.json()).resolves.toEqual({ error: "Upstream API timeout" });
  });

  it("returns 502 for malformed upstream success payloads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ substance: { name: "MDMA", aliases: [] } }));
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/reagent-proxy?substance=mdma"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Invalid upstream API response" });
  });
});
