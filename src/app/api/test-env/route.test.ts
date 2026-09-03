import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

const ORIGINAL_ENV = process.env;

describe("test env route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_URL;
    delete process.env.VITE_CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.ENABLE_TEST_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.AUTH_SECRET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllEnvs();
  });

  it("returns the editor diagnostic view without secret names or values", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret-admin-key-value";
    process.env.CONVEX_URL = "https://write.convex.cloud";
    process.env.AUTH_SECRET = "auth-secret-value";
    const { POST } = await import("./route");

    const response = await POST(new Request("https://dose.wiki/api/test-env", { method: "POST" }));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      audience: "editor",
      available: true,
      keysFound: 2,
      totalKeys: 2,
      convexAdminKeyConfigured: true,
      convexUrlConfigured: true,
      canSaveToConvex: true,
      convexIssues: [],
    });
    expect(body.keyNames).toBeUndefined();
    expect(serialized).not.toContain("secret-admin-key-value");
    expect(serialized).not.toContain("auth-secret-value");
    expect(serialized).not.toContain("AUTH_SECRET");
  });

  it("does not expose production diagnostics when ENABLE_TEST_ENV is disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CONVEX_ADMIN_KEY = "secret-admin-key-value";
    process.env.CONVEX_URL = "https://write.convex.cloud";
    const { POST } = await import("./route");

    const response = await POST(new Request("https://dose.wiki/api/test-env", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Not found." });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.requireRoleSession).not.toHaveBeenCalled();
  });
});
