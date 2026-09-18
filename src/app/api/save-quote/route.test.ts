import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    quotes: {
      save: "quotes.save",
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

describe("save quote route operation envelope", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.mutation.mockResolvedValue({ updated: true, id: "quote-id" });
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
      },
    });
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
  });

  it("refuses an editor with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", section: "subjective-effects", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("saves a quote with the existing success response shape and canonical section", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", section: "subjective-effects", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: true,
      id: "quote-id",
      updatedBy: "ADMIN",
    });
    expect(mocks.mutation).toHaveBeenCalledWith("quotes.save", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      slug: "lsd",
      section: "subjective_effects",
      content: "Quote",
      updatedBy: "ADMIN",
    });
  });

  it("preserves quote parser validation responses", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Quote section is required." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects unknown quote sections before writing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "lsd", section: "effects", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown quote section: effects" });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
