import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createReq = (ip = "1.2.3.4", url = "/api/auth") => ({
  headers: { "x-forwarded-for": ip },
  url,
  socket: { remoteAddress: ip },
});

const createRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader: vi.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(() => res),
  };
  return res;
};

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", async () => {
    const { rateLimit } = await import("./rateLimit.js");
    const req = createReq();
    const res = createRes();

    expect(await rateLimit(req, res, { windowMs: 1000, max: 2 })).toBe(true);
    expect(await rateLimit(req, res, { windowMs: 1000, max: 2 })).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks requests after reaching the limit", async () => {
    const { rateLimit } = await import("./rateLimit.js");
    const req = createReq();
    const res = createRes();

    expect(await rateLimit(req, res, { windowMs: 1000, max: 2 })).toBe(true);
    expect(await rateLimit(req, res, { windowMs: 1000, max: 2 })).toBe(true);
    expect(await rateLimit(req, res, { windowMs: 1000, max: 2 })).toBe(false);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many requests. Please try again later.",
    });
  });

  it("resets the window after expiration", async () => {
    const { rateLimit } = await import("./rateLimit.js");
    const req = createReq();
    const res = createRes();

    expect(await rateLimit(req, res, { windowMs: 1000, max: 1 })).toBe(true);
    expect(await rateLimit(req, res, { windowMs: 1000, max: 1 })).toBe(false);

    vi.setSystemTime(new Date("2024-01-01T00:00:02Z"));
    expect(await rateLimit(req, res, { windowMs: 1000, max: 1 })).toBe(true);
  });
});
