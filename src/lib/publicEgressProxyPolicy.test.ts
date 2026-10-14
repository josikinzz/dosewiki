import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProtestKitUpstreamUrl,
  fetchProtestKitPublicEgress,
  parseProtestKitLookupInput,
  redactPublicEgressError,
  resetPublicEgressPolicyForTests,
} from "./publicEgressProxyPolicy";

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

  it("redacts upstream error details for logs", () => {
    expect(redactPublicEgressError(new Error("token=secret&url=https://protestkit.eu/api/v1/mdma"))).toEqual({
      name: "Error",
      message: "upstream request failed",
    });
  });
});
