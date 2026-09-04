import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  grantWriteCapability,
  installProtectedRouteMocks,
  resetRouteMocks,
} from "@/test/routeHarness";

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposals: {
      get: "changeProposals.get",
      comment: "changeProposals.comment",
    },
  },
}));

installProtectedRouteMocks();

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

function commentRequest(id: string, body: unknown) {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/comment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("dev proposal detail and comment routes", () => {
  beforeEach(() => {
    resetRouteMocks("editor");
  });

  it("returns the full proposal with live hashes to an editor", async () => {
    const client = grantWriteCapability(createClient(), { intentToken: "article-token" });
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
    grantWriteCapability(createClient(null), { intentToken: "article-token" });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_missing"));

    expect(response.status).toBe(404);
  });

  it("stores a trimmed comment under the session email and refuses empty text", async () => {
    const client = grantWriteCapability(createClient(), { intentToken: "article-token" });
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

describeRoleFloor({
  floor: "editor",
  rateLimit: "diagnosticRead",
  refused: "contributor",
  calls: [
    {
      name: "GET",
      call: async () =>
        (await import("./route")).GET(new Request("https://dose.wiki/api/dev/proposals/cp_1")),
    },
  ],
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "editorSmallWrite",
  refused: "contributor",
  calls: [
    {
      name: "POST comment",
      call: async () => (await import("./comment/route")).POST(commentRequest("cp_1", { text: "Hi" })),
    },
  ],
});
