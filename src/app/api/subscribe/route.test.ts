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
});
