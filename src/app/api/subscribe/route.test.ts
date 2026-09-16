import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SubscribePolicy from "./subscribePolicy";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getDataBackend: vi.fn(() => "postgres"),
  fetch: vi.fn(),
  mutation: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: mocks.getDataBackend,
  getPostgresClient: () => ({}),
}));
vi.mock("@server/data/serverWriteCapability", () => ({
  getPublicIntakeWriteCapability: () => ({ client: { mutationAsService: mocks.mutation } }),
}));
vi.mock("./subscribePolicy", async (importOriginal) => ({
  ...await importOriginal<typeof SubscribePolicy>(),
  createSubscribeRateLimiter: () => ({ limit: mocks.limit }),
}));

import { POST } from "./route";

function post(extraHeaders: Record<string, string> = {}): Request {
  return new Request("https://dose.wiki/api/subscribe", {
    method: "POST",
    headers: { Origin: "https://dose.wiki", "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ email: "someone@example.com", list: "dosewiki" }),
  });
}

describe("POST /api/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    vi.stubEnv("MAILING_LIST_FORWARD_URL", "");
    vi.stubEnv("VERCEL", "");
    mocks.getDataBackend.mockReturnValue("postgres");
    mocks.limit.mockResolvedValue({ ok: true });
    mocks.mutation.mockResolvedValue("subscribed");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses frozen writes before touching limiter, storage, or relay", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    vi.stubEnv("MAILING_LIST_FORWARD_URL", "https://dose.wiki/api/subscribe");
    vi.stubGlobal("fetch", mocks.fetch);
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when shared limiter storage is unavailable", async () => {
    mocks.limit.mockRejectedValue(new Error("private database details"));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("does not persist a signup refused by the global budget", async () => {
    mocks.limit.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfter: 100 });
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("cannot evade an unknown-client bucket with unsigned forwarding headers", async () => {
    const clients = new Map<string, number>();
    mocks.limit.mockImplementation(async (name: string, key: string) => {
      if (name !== "subscribePerIp") return { ok: true };
      const count = (clients.get(key) ?? 0) + 1;
      clients.set(key, count);
      return { ok: count <= 1 };
    });
    expect((await POST(post({ "x-forwarded-for": "192.0.2.1", "x-real-ip": "192.0.2.1", "x-vercel-forwarded-for": "192.0.2.1" }))).status).toBe(200);
    expect((await POST(post({ "x-forwarded-for": "192.0.2.2", "x-real-ip": "192.0.2.2", "x-vercel-forwarded-for": "192.0.2.2" }))).status).toBe(429);
  });

  it("preserves a relayed refusal rather than reporting signup success", async () => {
    vi.stubEnv("MAILING_LIST_FORWARD_URL", "https://dose.wiki/api/subscribe");
    mocks.fetch.mockResolvedValue(new Response('{"ok":false}', { status: 429 }));
    vi.stubGlobal("fetch", mocks.fetch);
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
