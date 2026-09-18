import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProtestKitUpstreamUrl,
  fetchProtestKitPublicEgress,
  getPublicEgressCorsHeaders,
  parseProtestKitLookupInput,
  redactPublicEgressError,
  resetPublicEgressPolicyForTests,
} from "./publicEgressProxyPolicy";

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

describe("public egress proxy policy", () => {
  beforeEach(() => {
    resetPublicEgressPolicyForTests();
  });

  it("constructs only the allowed ProtestKit API host and path", () => {
    expect(buildProtestKitUpstreamUrl("mdma")).toBe("https://protestkit.eu/api/v1/mdma");
    expect(buildProtestKitUpstreamUrl("2c-b")).toBe("https://protestkit.eu/api/v1/2c-b");
  });

  it("normalizes and length-limits public lookup input", () => {
    expect(parseProtestKitLookupInput("MDMA!")).toEqual({ ok: true, candidate: "mdma" });
    expect(parseProtestKitLookupInput(null)).toEqual({ ok: false });
    expect(parseProtestKitLookupInput("!!!")).toEqual({ ok: false });
    expect(parseProtestKitLookupInput("a".repeat(101))).toEqual({ ok: false });
  });

  it("applies the named CORS audience", () => {
    const allowed = getPublicEgressCorsHeaders(
      new Request("https://dose.wiki/api/reagent-proxy", {
        headers: { origin: "https://dose.wiki" },
      }),
    );
    const denied = getPublicEgressCorsHeaders(
      new Request("https://dose.wiki/api/reagent-proxy", {
        headers: { origin: "https://example.com" },
      }),
    );

    expect(allowed.get("Access-Control-Allow-Origin")).toBe("https://dose.wiki");
    expect(denied.get("Access-Control-Allow-Origin")).toBeNull();
    expect(allowed.get("Vary")).toBe("Origin");
  });

  it("fetches bounded JSON and returns the success cache policy", async () => {
    const fetcher = vi.fn(async () => Response.json(validPayload));

    const result = await fetchProtestKitPublicEgress("mdma", fetcher);

    expect(result).toEqual({
      ok: true,
      data: validPayload,
      cacheControl: "s-maxage=3600, stale-while-revalidate=86400",
    });
    expect(fetcher).toHaveBeenCalledWith("https://protestkit.eu/api/v1/mdma", expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/json" }),
    }));
  });

  it("maps and negative-caches upstream missing responses", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: "not here" }, { status: 404 }));

    const first = await fetchProtestKitPublicEgress("unknown", fetcher);
    const second = await fetchProtestKitPublicEgress("unknown", fetcher);

    expect(first).toMatchObject({
      ok: false,
      status: 404,
      message: "Substance not found",
      cacheControl: "s-maxage=300, stale-while-revalidate=1800",
    });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps upstream 5xx without forwarding upstream status or body", async () => {
    const fetcher = vi.fn(async () => Response.json({ secret: "upstream detail" }, { status: 503 }));

    const result = await fetchProtestKitPublicEgress("mdma", fetcher);

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      message: "Upstream API error",
    });
    expect(JSON.stringify(result)).not.toContain("upstream detail");
  });

  it("rejects non-JSON content types", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { headers: { "content-type": "text/plain" } }));

    await expect(fetchProtestKitPublicEgress("mdma", fetcher)).resolves.toMatchObject({
      ok: false,
      status: 502,
      message: "Invalid upstream API response",
    });
  });

  it("rejects responses over the maximum public response size", async () => {
    const fetcher = vi.fn(async () => Response.json({ body: "x".repeat(257 * 1024) }));

    await expect(fetchProtestKitPublicEgress("mdma", fetcher)).resolves.toMatchObject({
      ok: false,
      status: 502,
      message: "Invalid upstream API response",
    });
  });

  it("maps aborted upstream requests to timeout responses", async () => {
    const abortError = new Error("leaked url https://protestkit.eu/api/v1/mdma");
    abortError.name = "AbortError";
    const fetcher = vi.fn(async () => {
      throw abortError;
    });

    await expect(fetchProtestKitPublicEgress("mdma", fetcher)).resolves.toMatchObject({
      ok: false,
      status: 504,
      message: "Upstream API timeout",
    });
  });

  it("redacts upstream error details for logs", () => {
    expect(redactPublicEgressError(new Error("token=secret&url=https://protestkit.eu/api/v1/mdma"))).toEqual({
      name: "Error",
      message: "upstream request failed",
    });
  });
});
