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

  it("forwards revisionOf to Postgres and omits it when the body carries none", async () => {
    const client = grantWriteCapability(createClient());
    const { POST } = await import("./route");
    const articles = [{ id: 1, title: "LSD", slug: "lsd" }];

    await POST(post({ payload: { articles }, summary: "Rebased", diff: "", revisionOf: " cp_old " }));
    expect(client.mutation).toHaveBeenLastCalledWith(
      "changeProposals.submit",
      expect.objectContaining({ revisionOf: "cp_old", summary: "Rebased" }),
    );

    await POST(post({ payload: { articles }, summary: "Fresh", diff: "", revisionOf: null }));
    expect(client.mutation).toHaveBeenLastCalledWith(
      "changeProposals.submit",
      expect.not.objectContaining({ revisionOf: expect.anything() }),
    );

    const blank = await POST(post({ payload: { articles }, summary: "Blank", diff: "", revisionOf: "   " }));
    expect(blank.status).toBe(400);
    expect(client.mutation).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty payload and a missing summary before calling Postgres", async () => {
    const client = grantWriteCapability(createClient());
    const { POST } = await import("./route");

    const empty = await POST(post({ payload: {}, summary: "x", diff: "" }));
    expect(empty.status).toBe(400);
    const unsummarized = await POST(
      post({ payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] }, summary: "   ", diff: "" }),
    );
    expect(unsummarized.status).toBe(400);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("accepts copy blocks and About and parses them like the direct saves", async () => {
    const client = grantWriteCapability(createClient());
    const { POST } = await import("./route");

    const response = await POST(
      post({
        payload: {
          copyBlocks: [
            { key: " home-hero ", kind: "plain", label: " Home hero ", group: "Home", body: "Welcome." },
            { key: "home-links", kind: "list", label: "Links", group: "Home", items: ["a", "b"], body: "ignored" },
          ],
          about: {
            aboutMarkdown: "# Mission",
            aboutSubtitle: "An open library.",
            founderProfileKeys: ["josie", " sam ", "JOSIE"],
          },
        },
        summary: "Copy and About",
        diff: "- old\n+ new",
      }),
    );

    expect(response.status).toBe(200);
    expect(client.mutation).toHaveBeenCalledWith(
      "changeProposals.submit",
      expect.objectContaining({
        payload: {
          articles: [],
          indexLayouts: [],
          copyBlocks: [
            { key: "home-hero", kind: "plain", label: "Home hero", group: "Home", body: "Welcome." },
            { key: "home-links", kind: "list", label: "Links", group: "Home", items: ["a", "b"] },
          ],
          about: {
            aboutMarkdown: "# Mission",
            aboutSubtitle: "An open library.",
            founderProfileKeys: ["JOSIE", "SAM"],
          },
        },
      }),
    );
  });

  it("rejects a copy block or About that the direct save would refuse", async () => {
    const client = grantWriteCapability(createClient());
    const { POST } = await import("./route");

    const badKey = await POST(
      post({
        payload: { copyBlocks: [{ key: "Home Hero", kind: "plain", label: "x", group: "y", body: "" }] },
        summary: "x",
        diff: "",
      }),
    );
    expect(badKey.status).toBe(400);
    await expect(badKey.json()).resolves.toEqual({ error: "A valid lower-case copy block key is required." });

    const badAbout = await POST(
      post({
        payload: { about: { aboutMarkdown: "x", aboutSubtitle: "y", founderProfileKeys: ["jo sie"] } },
        summary: "x",
        diff: "",
      }),
    );
    expect(badAbout.status).toBe(400);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("surfaces a Postgres rejection of the proposal as an actionable error", async () => {
    const client = grantWriteCapability(createClient());
    client.mutation.mockRejectedValue(
      new PostgresError({ code: "PROPOSAL_ARTICLE_INVALID", message: "LSD: summary: Invalid input" }),
    );
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
    resetRouteMocks("editor");
  });

  it("projects legacy queue identities privately while retaining ownership and status filtering", async () => {
    const client = grantWriteCapability(createClient(), { intentToken: "article-token" });
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

  it("rejects a status outside the enum before calling Postgres", async () => {
    const client = grantWriteCapability(createClient());
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals?status=pending"));

    expect(response.status).toBe(400);
    expect(client.query).not.toHaveBeenCalled();
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
