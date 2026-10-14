import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/cache", () => ({
  unstable_cache: (read: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (stored.has(key)) return stored.get(key);
      const value = await read(...args);
      stored.set(key, value);
      return value;
    },
}));
import { publicDataCache } from "./publicData.cache";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});

afterEach(() => {
  stored.clear();
  vi.unstubAllEnvs();
});

describe("public persistent cache boundaries", () => {
  it("does not reuse another read target's answer", async () => {
    const read = publicDataCache(async () => process.env.POSTGRES_POOLED_URL, ["target"], {});
    vi.stubEnv("POSTGRES_POOLED_URL", "postgres://first.example/db");
    expect(await read()).toBe("postgres://first.example/db");
    vi.stubEnv("POSTGRES_POOLED_URL", "postgres://second.example/db");
    expect(await read()).toBe("postgres://second.example/db");
  });

  it("refuses an invalid backend even when a cached answer exists", async () => {
    const read = publicDataCache(async () => "postgres answer", ["backend-identity"], {});
    expect(await read()).toBe("postgres answer");
    vi.stubEnv("DATA_BACKEND", "retired-backend");
    await expect(read()).rejects.toThrow(/DATA_BACKEND=postgres/);
  });

  it("keeps database credentials out of persisted keys while separating targets", async () => {
    let content = "first target";
    const read = publicDataCache(async () => content, ["credential-boundary"], {});
    const first = new URL("postgres://first.example/db");
    first.username = "private_user";
    first.password = "private_password";
    const second = new URL(first);
    second.hostname = "second.example";
    vi.stubEnv("POSTGRES_POOLED_URL", first.href);
    expect(await read()).toBe("first target");
    content = "second target";
    vi.stubEnv("POSTGRES_POOLED_URL", second.href);
    expect(await read()).toBe("second target");
    vi.stubEnv("POSTGRES_POOLED_URL", first.href);
    expect(await read()).toBe("first target");
    for (const key of stored.keys()) {
      expect(key).not.toContain("private_user");
      expect(key).not.toContain("private_password");
      expect(key).not.toContain("postgres://");
    }
  });
});
