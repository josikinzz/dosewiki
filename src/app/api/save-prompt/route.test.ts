import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    prompts: {
      save: "prompts.save",
    },
  },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

describe("save prompt route write capability handling", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
  });

  it("refuses an editor with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ key: "section_summary", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("maps missing write capability to the existing HTTP 500 response shape", async () => {
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Postgres admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          backend: "postgres",
          postgresUrlConfigured: true,
          canSaveToPostgres: false,
          issues: ["Missing DATA_ADMIN_KEY on the server."],
        },
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ key: "section_summary", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Postgres admin key is not configured on the server.",
    });
  });


  it("rejects unknown prompt keys before writing", async () => {
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "test-admin-key",
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ key: "section_not_real", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unknown prompt key: section_not_real",
    });
  });

  it("delegates the authenticated admin email to the Postgres prompt write", async () => {
    mocks.mutation.mockResolvedValue({ updated: true, id: "prompt-id" });
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: {
          mutation: mocks.mutation,
        },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "prompt-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-prompt", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ key: "section_summary", content: "Prompt" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith("prompts.save", {
      apiKey: "prompt-token",
      actorEmail: "admin@example.com",
      key: "section_summary",
      content: "Prompt",
      updatedBy: "ADMIN",
    });
  });
});
