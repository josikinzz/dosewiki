import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposals: {
      get: "changeProposals.get",
      comment: "changeProposals.comment",
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

const PROPOSAL = {
  _id: "cp_1",
  status: "submitted",
  summary: "Update LSD",
  targets: [{ kind: "article", key: "lsd", baseHash: "h1" }],
  liveHashes: [{ kind: "article", key: "lsd", hash: "h1" }],
};

function createClient(proposal: unknown = PROPOSAL) {
  return {
    query: vi.fn(async (name: string) => {
      if (name === "changeProposals.get") {
        return proposal;
      }
      throw new Error(`Unexpected query ${name}`);
    }),
    mutation: vi.fn(async (name: string, args: { text: string }) => {
      if (name === "changeProposals.comment") {
        return { by: "editor@example.com", at: "2026-09-03T00:00:00.000Z", text: args.text };
      }
      throw new Error(`Unexpected mutation ${name}`);
    }),
  };
}

function grantCapability(client: ReturnType<typeof createClient>) {
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { adminKey: "admin-key", client, getAdminIntentToken: vi.fn(() => "article-token") },
  });
}

function commentRequest(id: string, body: unknown) {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/comment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("dev proposal detail and comment routes", () => {
  beforeEach(() => {
    // Module registry reset so each case imports the routes against fresh mocks.
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("returns the full proposal with live hashes to an editor", async () => {
    const client = createClient();
    grantCapability(client);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, proposal: PROPOSAL });
    expect(client.query).toHaveBeenCalledWith("changeProposals.get", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      id: "cp_1",
    });
  });

  it("answers 404 when Convex knows no such proposal", async () => {
    const client = createClient(null);
    grantCapability(client);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_missing"));

    expect(response.status).toBe(404);
  });

  it("refuses a contributor on both routes", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const client = createClient();
    grantCapability(client);
    const { GET } = await import("./route");
    const { POST } = await import("./comment/route");

    const detail = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_1"));
    const comment = await POST(commentRequest("cp_1", { text: "Hi" }));

    expect(detail.status).toBe(403);
    expect(comment.status).toBe(403);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("stores a trimmed comment under the session email and refuses empty text", async () => {
    const client = createClient();
    grantCapability(client);
    const { POST } = await import("./comment/route");

    const response = await POST(commentRequest("cp_1", { text: "  Looks right.  " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      comment: { by: "editor@example.com", at: "2026-09-03T00:00:00.000Z", text: "Looks right." },
    });
    expect(client.mutation).toHaveBeenCalledWith("changeProposals.comment", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      id: "cp_1",
      text: "Looks right.",
    });

    const empty = await POST(commentRequest("cp_1", { text: "   " }));
    expect(empty.status).toBe(400);
    expect(client.mutation).toHaveBeenCalledTimes(1);
  });
});
