import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type * as NextCache from "next/cache";
import { revalidatePath, revalidateTag } from "next/cache";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@server/data/serverClient", () => ({
  queryData: vi.fn(async () => ({ publicRevision: "a".repeat(64) })),
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
    
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE = TOKEN;
    delete process.env.DATA_ADMIN_KEY;
  });

  it("rejects a missing token without touching the cache", async () => {
    
    

    const response = await POST(revalidateRequest({ slug: "2c-b" }, null));

    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a wrong token without touching the cache", async () => {
    
    

    const response = await POST(revalidateRequest({ slug: "2c-b" }, "wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid admin token." });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("accepts the legacy admin key when no scoped token is configured", async () => {
    delete process.env.DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE;
    process.env.DATA_ADMIN_KEY = "legacy-secret";
    

    const response = await POST(revalidateRequest({ slug: "2c-b" }, "legacy-secret"));

    expect(response.status).toBe(200);
  });

  it("rejects an invalid slug before any cache call", async () => {
    
    

    for (const slug of ["../etc", "2C-B", "", "a b", 7]) {
      const response = await POST(revalidateRequest({ slug }));
      expect(response.status).toBe(400);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a bad slug hiding inside an otherwise valid batch", async () => {
    
    

    const response = await POST(revalidateRequest({ slugs: ["2c-b", "/etc/passwd"] }));

    expect(response.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty request body", async () => {
    

    const response = await POST(revalidateRequest({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Provide slug or slugs." });
  });

  it("reports pending publication with the current revision when delivery is unconfigured", async () => {
    delete process.env.PUBLIC_CACHE_PUBLISH_SECRET;
    
    const response = await POST(revalidateRequest({ slug: "2c-b" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, revalidated: ["/2c-b"] });
    expect(body.publication).toContainEqual(expect.objectContaining({
      status: "unconfigured",
      savedRevisions: [{ slug: "2c-b", revision: "a".repeat(64) }],
      verification: "pending",
    }));
  });

  it("deduplicates identities in the operator's publication receipt", async () => {
    delete process.env.PUBLIC_CACHE_PUBLISH_SECRET;
    
    const response = await POST(
      revalidateRequest({ slug: "2c-b", slugs: ["dxm", "2c-b", "dxm"] }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.revalidated).toEqual(["/2c-b", "/dxm"]);
    expect(body.publication).toContainEqual(expect.objectContaining({
      status: "unconfigured",
      savedRevisions: [
        { slug: "2c-b", revision: "a".repeat(64) },
        { slug: "dxm", revision: "a".repeat(64) },
      ],
    }));
  });

  it("honours the rate limiter before auth", async () => {
    
    vi.mocked(enforceRateLimit).mockResolvedValue(
      NextResponse.json({ error: "Too many requests." }, { status: 429 }),
    );
    

    const response = await POST(revalidateRequest({ slug: "2c-b" }));

    expect(response.status).toBe(429);
  });
});
