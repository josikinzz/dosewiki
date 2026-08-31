import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const TOKEN = "citation-write-secret";

function revalidateRequest(body: unknown, token: string | null = TOKEN) {
  return new Request("https://dev.dose.wiki/api/dev/revalidate-article", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("revalidate-article route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE = TOKEN;
    delete process.env.CONVEX_ADMIN_KEY;
  });

  it("rejects a missing token without touching the cache", async () => {
    const { POST } = await import("./route");
    const { revalidatePath, revalidateTag } = await import("next/cache");

    const response = await POST(revalidateRequest({ slug: "2c-b" }, null));

    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a wrong token without touching the cache", async () => {
    const { POST } = await import("./route");
    const { revalidatePath, revalidateTag } = await import("next/cache");

    const response = await POST(revalidateRequest({ slug: "2c-b" }, "wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid admin token." });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("accepts the legacy admin key when no scoped token is configured", async () => {
    delete process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE;
    process.env.CONVEX_ADMIN_KEY = "legacy-secret";
    const { POST } = await import("./route");

    const response = await POST(revalidateRequest({ slug: "2c-b" }, "legacy-secret"));

    expect(response.status).toBe(200);
  });

  it("rejects an invalid slug before any cache call", async () => {
    const { POST } = await import("./route");
    const { revalidatePath, revalidateTag } = await import("next/cache");

    for (const slug of ["../etc", "2C-B", "", "a b", 7]) {
      const response = await POST(revalidateRequest({ slug }));
      expect(response.status).toBe(400);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a bad slug hiding inside an otherwise valid batch", async () => {
    const { POST } = await import("./route");
    const { revalidatePath } = await import("next/cache");

    const response = await POST(revalidateRequest({ slugs: ["2c-b", "/etc/passwd"] }));

    expect(response.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty request body", async () => {
    const { POST } = await import("./route");

    const response = await POST(revalidateRequest({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Provide slug or slugs." });
  });

  it("revalidates the page path and expires the shared substances tag, like the editor write routes", async () => {
    const { POST } = await import("./route");
    const { revalidatePath, revalidateTag } = await import("next/cache");
    const { PUBLIC_CONVEX_CACHE_TAGS } = await import("@server/convex/publicData");

    const response = await POST(revalidateRequest({ slug: "2c-b" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, revalidated: ["/2c-b"] });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/2c-b");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_CONVEX_CACHE_TAGS.substances, { expire: 0 });
  });

  it("dedupes a multi-slug batch and expires the tag once", async () => {
    const { POST } = await import("./route");
    const { revalidatePath, revalidateTag } = await import("next/cache");

    const response = await POST(
      revalidateRequest({ slug: "2c-b", slugs: ["dxm", "2c-b", "dxm"] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, revalidated: ["/2c-b", "/dxm"] });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/2c-b");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/dxm");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("honours the rate limiter before auth", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    vi.mocked(enforceRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Too many requests." }, { status: 429 }),
    );
    const { POST } = await import("./route");

    const response = await POST(revalidateRequest({ slug: "2c-b" }));

    expect(response.status).toBe(429);
  });
});
