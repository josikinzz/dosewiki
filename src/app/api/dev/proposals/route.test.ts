import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    changeProposals: {
      submit: "changeProposals.submit",
      list: "changeProposals.list",
    },
    substanceIndex: {
      saveSubstances: "substanceIndex.saveSubstances",
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
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

function createClient() {
  return {
    query: vi.fn(async (name: string) => {
      if (name === "changeProposals.list") {
        return [{ _id: "cp_1", status: "submitted", summary: "Update LSD" }];
      }
      throw new Error(`Unexpected query ${name}`);
    }),
    mutation: vi.fn(async (name: string) => {
      if (name === "changeProposals.submit") {
        return { proposalId: "cp_123" };
      }
      throw new Error(`Unexpected mutation ${name}`);
    }),
  };
}

function post(body: unknown) {
  return new Request("https://dose.wiki/api/dev/proposals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("dev proposals route", () => {
  beforeEach(() => {
    // Module registry reset so each case imports the route against fresh mocks.
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("stores an editor's staged save as a proposal and never writes production", async () => {
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        adminKey: "admin-key",
        client,
        getAdminIntentToken: vi.fn(() => "article-token"),
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      post({
        payload: {
          articles: [{ id: 1, title: "LSD", slug: "lsd", draftOnlyField: "dropped" }],
          indexLayouts: [{ type: "chemical", version: 2, categories: [] }],
          changelog: { markdown: "# LSD\n\n+ Changed", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
        },
        summary: "  Update LSD  ",
        diff: "# LSD\n\n+ Changed",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, proposalId: "cp_123" });
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.mutation).toHaveBeenCalledWith("changeProposals.submit", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      payload: {
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        indexLayouts: [{ type: "chemical", version: 2, categories: [] }],
        changelog: { markdown: "# LSD\n\n+ Changed", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
      },
      summary: "Update LSD",
      diff: "# LSD\n\n+ Changed",
      targets: [
        { kind: "article", key: "lsd" },
        { kind: "indexLayout", key: "chemical" },
      ],
    });
    expect(client.mutation).not.toHaveBeenCalledWith("substanceIndex.saveSubstances", expect.anything());
  });

  it("derives an article target from the title when the payload carries no slug", async () => {
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { POST } = await import("./route");

    await POST(post({ payload: { articles: [{ id: null, title: "Ketamine HCl" }] }, summary: "New", diff: "" }));

    expect(client.mutation).toHaveBeenCalledWith(
      "changeProposals.submit",
      expect.objectContaining({
        apiKey: "admin-key",
        targets: [{ kind: "article", key: "ketamine-hcl" }],
      }),
    );
  });

  it("rejects an empty payload and a missing summary before calling Convex", async () => {
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { POST } = await import("./route");

    const empty = await POST(post({ payload: {}, summary: "x", diff: "" }));
    expect(empty.status).toBe(400);
    const unsummarized = await POST(
      post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "   ", diff: "" }),
    );
    expect(unsummarized.status).toBe(400);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("refuses a contributor", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { POST } = await import("./route");

    const response = await POST(
      post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "Update", diff: "" }),
    );

    expect(response.status).toBe(403);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("surfaces a Convex rejection of the proposal as an actionable error", async () => {
    const client = createClient();
    client.mutation.mockRejectedValue(
      new ConvexError({ code: "PROPOSAL_ARTICLE_INVALID", message: "LSD: summary: Invalid input" }),
    );
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(
      post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "Update", diff: "" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROPOSAL_ARTICLE_INVALID",
      error: "LSD: summary: Invalid input",
    });
  });
});

describe("dev proposals list route", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("lists the queue for an editor, passing a valid status filter through", async () => {
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client, getAdminIntentToken: vi.fn(() => "article-token") },
    });
    const { GET } = await import("./route");

    const all = await GET(new Request("https://dose.wiki/api/dev/proposals"));
    expect(all.status).toBe(200);
    await expect(all.json()).resolves.toEqual({
      ok: true,
      proposals: [{ _id: "cp_1", status: "submitted", summary: "Update LSD" }],
    });
    expect(client.query).toHaveBeenLastCalledWith("changeProposals.list", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
    });

    const filtered = await GET(new Request("https://dose.wiki/api/dev/proposals?status=changes_requested"));
    expect(filtered.status).toBe(200);
    expect(client.query).toHaveBeenLastCalledWith("changeProposals.list", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      status: "changes_requested",
    });
  });

  it("rejects a status outside the enum before calling Convex", async () => {
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals?status=pending"));

    expect(response.status).toBe(400);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("refuses a contributor", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const client = createClient();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { adminKey: "admin-key", client },
    });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals"));

    expect(response.status).toBe(403);
    expect(client.query).not.toHaveBeenCalled();
  });
});
