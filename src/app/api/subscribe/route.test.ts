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

  describe("Effect Index relay", () => {
    const RELAY_SECRET = "relay-secret-fixture-that-is-long-enough";
    const RELAY_EGRESS_IP = "198.51.100.200";
    const RECEIVER_URL = "https://dose.wiki/api/subscribe";

    /** The receiver's per-IP budget as the shared limiter applies it: three per key. */
    function perIpBudget() {
      const keys: string[] = [];
      const counts = new Map<string, number>();
      mocks.limit.mockImplementation(async (name: string, key: string) => {
        if (name !== "subscribePerIp") return { ok: true };
        keys.push(key);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count <= 3 ? { ok: true } : { ok: false, retryAfter: 60_000 };
      });
      return keys;
    }

    /** Delivers the relay's outbound call to this same route acting as the receiver. */
    function relayToReceiver() {
      mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
        vi.stubEnv("MAILING_LIST_FORWARD_URL", "");
        try {
          return await POST(new Request(url, {
            ...init,
            headers: { ...(init.headers as Record<string, string>), "x-vercel-forwarded-for": RELAY_EGRESS_IP },
          }));
        } finally {
          vi.stubEnv("MAILING_LIST_FORWARD_URL", RECEIVER_URL);
        }
      });
      vi.stubGlobal("fetch", mocks.fetch);
    }

    function receiverPost(headers: Record<string, string>): Request {
      return post({ "x-vercel-forwarded-for": RELAY_EGRESS_IP, ...headers });
    }

    beforeEach(() => {
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("MAILING_LIST_RELAY_SECRET", RELAY_SECRET);
      vi.stubEnv("MAILING_LIST_IP_HASH_SECRET", "ip-hash-fixture");
    });

    it("lets four readers behind one relay subscribe within a minute", async () => {
      vi.stubEnv("MAILING_LIST_FORWARD_URL", RECEIVER_URL);
      const keys = perIpBudget();
      relayToReceiver();

      const statuses: number[] = [];
      for (const ip of ["192.0.2.11", "192.0.2.12", "192.0.2.13", "192.0.2.14"]) {
        statuses.push((await POST(post({ "x-vercel-forwarded-for": ip }))).status);
      }

      expect(statuses).toEqual([200, 200, 200, 200]);
      expect(keys).toEqual(["192.0.2.11", "192.0.2.12", "192.0.2.13", "192.0.2.14"]);
      expect(mocks.mutation).toHaveBeenCalledTimes(4);
    });

    it("refuses repeated signups from one reader at the relay once the local policy is spent", async () => {
      vi.stubEnv("MAILING_LIST_FORWARD_URL", RECEIVER_URL);
      mocks.fetch.mockImplementation(async () => new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal("fetch", mocks.fetch);

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        statuses.push((await POST(post({ "x-vercel-forwarded-for": "192.0.2.21" }))).status);
      }

      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
      expect(mocks.fetch).toHaveBeenCalledTimes(5);
    });

    it("forwards the reader's address only inside a signed header", async () => {
      vi.stubEnv("MAILING_LIST_FORWARD_URL", RECEIVER_URL);
      mocks.fetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal("fetch", mocks.fetch);

      await POST(post({ "x-vercel-forwarded-for": "192.0.2.31" }));

      const headers = mocks.fetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers["x-dosewiki-relay-client-ip"]).toBe("192.0.2.31");
      expect(headers["x-dosewiki-relay-client-ip-signature"]).toMatch(/^\d+\.[0-9a-f]{64}$/);
    });

    it.each([
      ["unsigned", { "x-dosewiki-relay-client-ip": "192.0.2.41" }],
      ["badly signed", {
        "x-dosewiki-relay-client-ip": "192.0.2.41",
        "x-dosewiki-relay-client-ip-signature": `${Date.now()}.${"0".repeat(64)}`,
      }],
    ])("ignores an %s forwarded address and limits the caller's own address", async (_label, headers) => {
      const keys = perIpBudget();

      const response = await POST(receiverPost(headers));

      expect(response.status).toBe(200);
      expect(keys).toEqual([RELAY_EGRESS_IP]);
    });

    it("ignores a correctly signed forwarded address replayed outside the skew window", async () => {
      const { signRelayedClientIp } = await import("./subscribePolicy");
      const keys = perIpBudget();

      await POST(receiverPost(signRelayedClientIp("192.0.2.61", RELAY_SECRET, Date.now() - 10 * 60_000)));
      await POST(receiverPost(signRelayedClientIp("192.0.2.62", RELAY_SECRET)));

      expect(keys).toEqual([RELAY_EGRESS_IP, "192.0.2.62"]);
    });

    it("ignores a forwarded address signed with a different secret", async () => {
      vi.stubEnv("MAILING_LIST_FORWARD_URL", RECEIVER_URL);
      mocks.fetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal("fetch", mocks.fetch);
      await POST(post({ "x-vercel-forwarded-for": "192.0.2.51" }));
      const signed = mocks.fetch.mock.calls[0][1].headers as Record<string, string>;
      vi.stubEnv("MAILING_LIST_FORWARD_URL", "");
      vi.stubEnv("MAILING_LIST_RELAY_SECRET", "a-different-relay-secret-that-is-long-enough");
      const keys = perIpBudget();

      await POST(receiverPost({
        "x-dosewiki-relay-client-ip": signed["x-dosewiki-relay-client-ip"],
        "x-dosewiki-relay-client-ip-signature": signed["x-dosewiki-relay-client-ip-signature"],
      }));

      expect(keys).toEqual([RELAY_EGRESS_IP]);
    });
  });
});
