import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  grantWriteCapability,
  installProtectedRouteMocks,
  resetRouteMocks,
} from "@/test/routeHarness";

vi.mock("@server/postgres/runtime/api", () => ({
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

installProtectedRouteMocks();

function createClient() {
  return {
    query: vi.fn(async (name: string) => {
      if (name === "changeProposals.list") {
        return [{
          _id: "cp_1", status: "submitted", summary: "Update LSD", targets: [],
          proposedBy: "editor@example.com", reviewedBy: "reviewer@example.com",
          comments: [{ by: "commenter@example.com", at: "now", text: "Checked" }],
          payload: { contactEmail: "private@example.com" },
        }];
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
    headers: { Origin: "https://dose.wiki" },
    body: JSON.stringify({ baselines: [{ kind: "article", key: "lsd", document: null }], ...(body as object) }),
  });
}

describe("dev proposals route", () => {
  beforeEach(() => {
    resetRouteMocks("editor");
  });

  it("refuses a submission with no loaded baseline before calling Postgres", async () => {
    const client = grantWriteCapability(createClient());
    const { POST } = await import("./route");
    const response = await POST(post({
      payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "Update", baselines: undefined,
    }));
    expect(response.status).toBe(400);
    expect(client.mutation).not.toHaveBeenCalled();
    expect((await response.json()).error).toContain("draft is preserved");
  });

  it("returns a stale-baseline conflict with the preserve-draft recovery message", async () => {
    const client = grantWriteCapability(createClient());
    client.mutation.mockRejectedValue(new PostgresError({
      code: "PROPOSAL_BASELINE_STALE", message: "Production changed. Your draft is preserved.",
    }));
    const { POST } = await import("./route");
    const response = await POST(post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "Update" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "PROPOSAL_BASELINE_STALE", error: "Production changed. Your draft is preserved.",
    });
  });

  it("stores an editor's staged save as a proposal and never writes production", async () => {
    const client = grantWriteCapability(createClient(), { intentToken: "article-token" });
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
    expect(client.mutation).not.toHaveBeenCalledWith("substanceIndex.saveSubstances", expect.anything());
  });
});

describe("dev proposals list route", () => {
  beforeEach(() => {
    resetRouteMocks("editor");
  });

  it("projects legacy queue identities privately while retaining ownership", async () => {
    grantWriteCapability(createClient(), { intentToken: "article-token" });
    const { GET } = await import("./route");

    const all = await GET(new Request("https://dose.wiki/api/dev/proposals"));
    expect(all.status).toBe(200);
    await expect(all.json()).resolves.toEqual({
      ok: true,
      proposals: [{
        _id: "cp_1", status: "submitted", summary: "Update LSD", targets: [],
        proposerName: "Contributor", reviewerName: "Reviewer", isAuthor: true, commentCount: 1,
      }],
    });
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "editorHeavyWrite",
  refused: "contributor",
  calls: [
    {
      name: "POST",
      call: async () =>
        (await import("./route")).POST(
          post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "Update", diff: "" }),
        ),
    },
  ],
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "diagnosticRead",
  refused: "contributor",
  calls: [
    {
      name: "GET",
      call: async () => (await import("./route")).GET(new Request("https://dose.wiki/api/dev/proposals")),
    },
  ],
});
