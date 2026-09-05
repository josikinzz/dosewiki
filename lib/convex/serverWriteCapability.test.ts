import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  convexClients: [] as Array<{ url: string }>,
  query: vi.fn(),
  mutation: vi.fn(),
  action: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    url: string;

    constructor(url: string) {
      this.url = url;
      mocks.convexClients.push(this);
    }

    query(reference: unknown, args: unknown) {
      return mocks.query(reference, args);
    }

    mutation(reference: unknown, args: unknown, options?: unknown) {
      return mocks.mutation(reference, args, options);
    }

    action(reference: unknown, args: unknown) {
      return mocks.action(reference, args);
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
    delete process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
    mocks.convexClients.length = 0;
    mocks.query.mockReset();
    mocks.query.mockResolvedValue(null);
    mocks.mutation.mockReset();
    mocks.mutation.mockResolvedValue({ updated: 1 });
    mocks.action.mockReset();
    mocks.action.mockResolvedValue({ ran: true });
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

  it("actively probes the configured admin credential", async () => {
    const module = await loadModule();
    process.env.CONVEX_ADMIN_KEY = "admin-key";
    process.env.CONVEX_URL = "https://write.convex.cloud";

    await module.probeServerConvexAdminCredential("editor@example.com");

    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      apiKey: "admin-key",
      email: "editor@example.com",
    });
  });

  it("rejects when the active credential probe fails", async () => {
    const module = await loadModule();
    process.env.CONVEX_ADMIN_KEY = "stale-key";
    process.env.CONVEX_URL = "https://write.convex.cloud";
    mocks.query.mockRejectedValue(new Error("Server Error"));

    await expect(module.probeServerConvexAdminCredential("editor@example.com")).rejects.toThrow("Server Error");
  });

  describe("actor gate on the route client", () => {
    const setField = makeFunctionReference<"mutation", { apiKey: string; actorEmail?: string; slug: string }, unknown>(
      "substanceIndex:setArticleField",
    );
    const submitTripReport = makeFunctionReference<
      "mutation",
      { apiKey: string; submission: { id: string } },
      unknown
    >("tripReportSubmissions:create");
    const syncAction = makeFunctionReference<"action", { apiKey: string; actorEmail?: string }, unknown>(
      "replications:sync",
    );
    const readQuery = makeFunctionReference<"query", { apiKey: string; slug: string }, unknown>(
      "substanceIndex:getBySlug",
    );

    async function readyClient() {
      const module = await loadModule();
      process.env.CONVEX_ADMIN_KEY = "admin-key";
      process.env.CONVEX_URL = "https://write.convex.cloud";
      return module.getServerConvexWriteCapabilityOrThrow().client;
    }

    it("refuses a mutation that names no actor before sending it", async () => {
      const client = await readyClient();

      await expect(client.mutation(setField, { apiKey: "admin-key", slug: "lsd" })).rejects.toThrow(
        "Server Convex write without actorEmail: substanceIndex:setArticleField",
      );
      await expect(
        client.mutation(setField, { apiKey: "admin-key", actorEmail: "   ", slug: "lsd" }),
      ).rejects.toThrow("Server Convex write without actorEmail: substanceIndex:setArticleField");
      expect(mocks.mutation).not.toHaveBeenCalled();
    });
    it("permits only allowlisted public intake mutations to run as the server", async () => {
      const client = await readyClient();
      const args = { apiKey: "admin-key", submission: { id: "submission-1" } };

      await expect(client.mutationAsService(submitTripReport, args)).resolves.toEqual({ updated: 1 });
      await expect(
        client.mutationAsService(setField, { apiKey: "admin-key", slug: "lsd" }),
      ).rejects.toThrow(
        "Server Convex service mutation is not allowlisted: substanceIndex:setArticleField",
      );

      expect(mocks.mutation).toHaveBeenCalledTimes(1);
      expect(mocks.mutation).toHaveBeenCalledWith(submitTripReport, args, undefined);
    });

    it("passes a mutation that names its actor through with args and options intact", async () => {
      const client = await readyClient();
      const args = { apiKey: "admin-key", actorEmail: "editor@example.com", slug: "lsd" };

      await expect(client.mutation(setField, args, { skipQueue: true })).resolves.toEqual({ updated: 1 });

      expect(mocks.mutation).toHaveBeenCalledTimes(1);
      expect(mocks.mutation).toHaveBeenCalledWith(setField, args, { skipQueue: true });
    });

    it("gates actions the same way as mutations", async () => {
      const client = await readyClient();

      await expect(client.action(syncAction, { apiKey: "admin-key" })).rejects.toThrow(
        "Server Convex write without actorEmail: replications:sync",
      );
      expect(mocks.action).not.toHaveBeenCalled();

      await expect(
        client.action(syncAction, { apiKey: "admin-key", actorEmail: "admin@example.com" }),
      ).resolves.toEqual({ ran: true });
      expect(mocks.action).toHaveBeenCalledWith(syncAction, {
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
      });
    });

    it("leaves queries ungated", async () => {
      const client = await readyClient();
      mocks.query.mockResolvedValue({ slug: "lsd" });

      await expect(client.query(readQuery, { apiKey: "admin-key", slug: "lsd" })).resolves.toEqual({
        slug: "lsd",
      });
      expect(mocks.query).toHaveBeenCalledWith(readQuery, { apiKey: "admin-key", slug: "lsd" });
    });
  });
});
