import { describe, expect, it, vi } from "vitest";
import { enforceRateLimit, InMemoryRateLimitStorage, UpstashRateLimitStorage } from "./nextRateLimit";

describe("rate limit storage adapters", () => {
  it("allows requests until the in-memory policy limit is reached", async () => {
    let now = 1_000;
    const storage = new InMemoryRateLimitStorage(() => now);
    const policy = { windowMs: 60_000, max: 2 };

    await expect(storage.limit("ip:/path", policy)).resolves.toMatchObject({ success: true, reset: 61_000 });
    await expect(storage.limit("ip:/path", policy)).resolves.toMatchObject({ success: true, reset: 61_000 });
    await expect(storage.limit("ip:/path", policy)).resolves.toMatchObject({ success: false, reset: 61_000 });

    now = 61_001;
    await expect(storage.limit("ip:/path", policy)).resolves.toMatchObject({ success: true, reset: 121_001 });
  });

  it("delegates success and denial to the Upstash adapter", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce({ success: true, reset: 2_000 })
      .mockResolvedValueOnce({ success: false, reset: 3_000 });
    const storage = new UpstashRateLimitStorage(() => ({ limit }));

    await expect(storage.limit("ip:/path", { windowMs: 60_000, max: 1 })).resolves.toEqual({
      success: true,
      reset: 2_000,
    });
    await expect(storage.limit("ip:/path", { windowMs: 60_000, max: 1 })).resolves.toEqual({
      success: false,
      reset: 3_000,
    });
    expect(limit).toHaveBeenCalledWith("ip:/path");
  });

  it("falls back to in-memory limiting when Upstash is unavailable", async () => {
    const storage = new UpstashRateLimitStorage(() => null);

    await expect(storage.limit("ip:/path", { windowMs: 60_000, max: 1 })).rejects.toThrow(
      "Upstash rate limiter is not configured.",
    );
  });
});

describe("enforceRateLimit", () => {
  it("returns the stable public response shape and Retry-After header when limited", async () => {
    const request = new Request("https://dose.wiki/api/search-suggestions?q=mdma", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let index = 0; index < 30; index += 1) {
      await expect(enforceRateLimit(request, "publicSearchRead")).resolves.toBeNull();
    }

    const response = await enforceRateLimit(request, "publicSearchRead");
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    await expect(response?.json()).resolves.toEqual({
      error: "Too many requests. Please try again later.",
    });
  });
});
