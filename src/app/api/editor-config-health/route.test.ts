import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com" } },
    role: "editor",
  })),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

describe("editor config health route", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_URL;
    delete process.env.VITE_CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derives Convex diagnostics from the server write capability facts", async () => {
    process.env.CONVEX_ADMIN_KEY = "admin-key";
    process.env.VITE_CONVEX_URL = "https://vite.convex.cloud";
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/editor-config-health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      audience: "editor",
      available: true,
      status: "healthy",
      canSaveToConvex: true,
      convexAdminKeyConfigured: true,
      convexUrlConfigured: true,
      issues: [],
      diagnostics: expect.objectContaining({
        warnings: [],
        targets: expect.objectContaining({
          privilegedWrite: expect.objectContaining({
            selectedUrl: "https://vite.convex.cloud",
            sourceEnvVar: "VITE_CONVEX_URL",
            browserSafe: false,
          }),
          editorBrowserRead: expect.objectContaining({
            selectedUrl: "https://vite.convex.cloud",
            sourceEnvVar: "VITE_CONVEX_URL",
            browserSafe: true,
          }),
          adminKeyConfigured: true,
        }),
      }),
      checkedAt: expect.any(String),
    }));
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
  });

  it("reports missing write capability without exposing secret values", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/editor-config-health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canSaveToConvex).toBe(false);
    expect(body.convexAdminKeyConfigured).toBe(false);
    expect(body.convexUrlConfigured).toBe(false);
    expect(body.issues).toEqual(["Missing CONVEX_ADMIN_KEY on the server.", "Missing Convex URL on the server."]);
    expect(body.issueDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", message: "Missing CONVEX_ADMIN_KEY on the server." }),
        expect.objectContaining({ severity: "error", message: "Missing Convex URL on the server." }),
      ]),
    );
    expect(JSON.stringify(body)).not.toContain("admin-key");
  });

  it("surfaces compatibility warnings without exposing admin secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CONVEX_ADMIN_KEY = "admin-key";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://browser.convex.cloud";
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/editor-config-health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canSaveToConvex).toBe(true);
    expect(body.diagnostics.targets.privilegedWrite).toMatchObject({
      selectedUrl: "https://browser.convex.cloud",
      sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL",
    });
    expect(body.diagnostics.warnings).toContain(
      "Production privileged writes are using a browser-exposed Convex URL fallback in compatibility mode.",
    );
    expect(JSON.stringify(body)).not.toContain("admin-key");
  });
});
