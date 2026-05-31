import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    quotes: {
      save: "quotes.save",
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
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

describe("save quote route operation envelope", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.mutation.mockResolvedValue({ updated: true, id: "quote-id" });
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
      },
    });
  });

  it("saves a quote with the existing success response shape and canonical section", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
        body: JSON.stringify({ slug: "lsd", section: "subjective-effects", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      updated: true,
      id: "quote-id",
      updatedBy: "EDITOR",
    });
    expect(mocks.mutation).toHaveBeenCalledWith("quotes.save", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      slug: "lsd",
      section: "subjective_effects",
      content: "Quote",
      updatedBy: "EDITOR",
    });
  });

  it("preserves quote parser validation responses", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/save-quote", {
        method: "POST",
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
        body: JSON.stringify({ slug: "lsd", section: "effects", content: "Quote" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown quote section: effects" });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
