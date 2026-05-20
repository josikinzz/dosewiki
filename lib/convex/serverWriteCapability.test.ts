import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  convexClients: [] as Array<{ url: string }>,
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    url: string;

    constructor(url: string) {
      this.url = url;
      mocks.convexClients.push(this);
    }
  },
}));

const ORIGINAL_ENV = process.env;

async function loadModule() {
  vi.resetModules();
  return import("./serverWriteCapability");
}

describe("server Convex write capability", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_URL;
    delete process.env.VITE_CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_PUBLIC_READ_URL;
    delete process.env.CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE;
    mocks.convexClients.length = 0;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("resolves write URL precedence from CONVEX_URL, VITE_CONVEX_URL, then NEXT_PUBLIC_CONVEX_URL", async () => {
    const module = await loadModule();

    process.env.CONVEX_URL = "https://primary.convex.cloud";
    process.env.VITE_CONVEX_URL = "https://vite.convex.cloud";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://public.convex.cloud";
    expect(module.getServerConvexWriteUrl()).toBe("https://primary.convex.cloud");

    delete process.env.CONVEX_URL;
    expect(module.getServerConvexWriteUrl()).toBe("https://vite.convex.cloud");

    delete process.env.VITE_CONVEX_URL;
    expect(module.getServerConvexWriteUrl()).toBe("https://public.convex.cloud");
  });

  it("does not use CONVEX_PUBLIC_READ_URL as the write deployment", async () => {
    const module = await loadModule();

    process.env.CONVEX_PUBLIC_READ_URL = "https://read.convex.cloud";

    expect(module.getServerConvexWriteUrl()).toBeNull();
    expect(module.getServerConvexReadUrl()).toBe("https://read.convex.cloud");
  });

  it("returns a typed configuration failure when URL and admin key are missing", async () => {
    const module = await loadModule();

    const result = module.getServerConvexWriteCapability();

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.failure.type).toBe("configuration");
      expect(result.failure.missing).toEqual(["adminKey", "writeUrl"]);
      expect(result.failure.health).toMatchObject({
        adminKeyConfigured: false,
        convexUrlConfigured: false,
        canSaveToConvex: false,
        issues: ["Missing CONVEX_ADMIN_KEY on the server.", "Missing Convex URL on the server."],
      });
    }
  });

  it("returns a ready capability with health facts and caches the client by write URL", async () => {
    const module = await loadModule();

    process.env.CONVEX_ADMIN_KEY = "admin-key";
    process.env.CONVEX_URL = "https://write.convex.cloud";

    const first = module.getServerConvexWriteCapability();
    const second = module.getServerConvexWriteCapability();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.capability.adminKey).toBe("admin-key");
      expect(first.capability.getAdminIntentToken("promptMigrationWrite")).toBe("admin-key");
      expect(first.capability.deployment.writeUrl).toBe("https://write.convex.cloud");
      expect(first.capability.deployment.sourceEnvVar).toBe("CONVEX_URL");
      expect(first.capability.health.canSaveToConvex).toBe(true);
      expect(second.capability.client).toBe(first.capability.client);
      expect(mocks.convexClients).toHaveLength(1);
    }

    process.env.CONVEX_URL = "https://other.convex.cloud";
    const third = module.getServerConvexWriteCapability();

    expect(third.ok).toBe(true);
    if (third.ok && first.ok) {
      expect(third.capability.client).not.toBe(first.capability.client);
      expect(mocks.convexClients).toHaveLength(2);
    }
  });

  it("prefers scoped admin intent tokens when they are configured", async () => {
    const module = await loadModule();

    process.env.CONVEX_ADMIN_KEY = "admin-key";
    process.env.CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE = "prompt-key";
    process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE = "citation-key";
    process.env.CONVEX_URL = "https://write.convex.cloud";

    const result = module.getServerConvexWriteCapability();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capability.getAdminIntentToken("promptMigrationWrite")).toBe("prompt-key");
      expect(result.capability.getAdminIntentToken("citationEvidenceWrite")).toBe("citation-key");
      expect(result.capability.getAdminIntentToken("quoteMigrationWrite")).toBe("admin-key");
    }
  });
});
