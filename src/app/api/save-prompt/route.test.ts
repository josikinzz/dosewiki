import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    prompts: {
      save: "prompts.save",
    },
  },
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  })),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("save prompt route write capability handling", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("maps missing write capability to the existing HTTP 500 response shape", async () => {
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Convex admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          convexUrlConfigured: true,
          canSaveToConvex: false,
          issues: ["Missing CONVEX_ADMIN_KEY on the server."],
        },
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        body: JSON.stringify({ key: "section_summary", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Convex admin key is not configured on the server.",
    });
  });

  it("uses the small editor write rate-limit policy", async () => {
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Convex admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          convexUrlConfigured: true,
          canSaveToConvex: false,
          issues: ["Missing CONVEX_ADMIN_KEY on the server."],
        },
      },
    });
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        body: JSON.stringify({ key: "section_summary", content: "Prompt" }),
      }),
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
  });

  it("rejects unknown prompt keys before writing", async () => {
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      client: {
        mutation: vi.fn(),
      },
      adminKey: "test-admin-key",
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        body: JSON.stringify({ key: "section_not_real", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unknown prompt key: section_not_real",
    });
  });
});
