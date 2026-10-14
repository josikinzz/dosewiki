import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NextCache from "next/cache";
import { revalidatePath, revalidateTag } from "next/cache";
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
});
