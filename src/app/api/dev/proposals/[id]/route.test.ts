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
  proposerName: "Ada",
  isAuthor: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  diff: "# article: lsd / summary\n\n- Before\n+ After",
  comments: [],
  commentCount: 0,
  payload: { articles: [{ title: "LSD", summary: "After" }] },
};

function createClient(proposal: unknown = PROPOSAL) {
  return {
    query: vi.fn(async (name: string) => {
      if (name === "changeProposals.get") {
        return proposal;
      }
      throw new Error(`Unexpected query ${name}`);
    }),
    mutation: vi.fn(async (name: string) => {
      throw new Error(`Unexpected mutation ${name}`);
    }),
  };
}

function commentRequest(id: string, body: unknown) {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/comment`, {
    method: "POST",
    headers: { Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

describe("dev proposal detail and comment routes", () => {
  beforeEach(() => {
    resetRouteMocks("editor");
  });

  it("does not forward historical audit identities, contact metadata, snapshots or client changelogs", async () => {
    const privateEmail = "private-contributor@example.com";
    const article = { title: "LSD", summary: "Published contact: research@example.org" };
    grantWriteCapability(createClient({
      ...PROPOSAL,
      proposerName: privateEmail,
      proposedBy: "editor@example.com",
      isAuthor: false,
      reviewedBy: privateEmail,
      reviewerName: `Reviewer <${privateEmail}>`,
      comments: [{ by: privateEmail, authorName: privateEmail, at: "now", text: "Checked" }],
      payload: {
        articles: [{ ...article, submittedBy: { email: privateEmail }, contact: { email: privateEmail } }],
        changelog: { submittedBy: privateEmail, markdown: privateEmail, articles: [] },
        contactEmail: privateEmail,
      },
      snapshotBefore: [{ document: { submittedBy: privateEmail } }],
      unknownAuditField: privateEmail,
      diff: `${PROPOSAL.diff}\n\n# article: lsd / submittedBy.email\n\n+ ${privateEmail}\n`,
    }), { intentToken: "article-token" });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_1?seed=1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(privateEmail);
    expect(JSON.stringify(body)).not.toContain("editor@example.com");
    expect(body.proposal).toMatchObject({
      proposerName: "Contributor", reviewerName: "Reviewer", isAuthor: true,
      comments: [{ authorName: "Contributor", at: "now", text: "Checked" }],
      payload: { articles: [article] },
    });
    expect(body.proposal).not.toHaveProperty("snapshotBefore");
    expect(body.proposal).not.toHaveProperty("unknownAuditField");
    expect(body.proposal.payload).not.toHaveProperty("changelog");
    expect(body.proposal.diff.trim()).toBe(PROPOSAL.diff);
  });

  it("removes private envelopes from whole-document historical diffs without removing article prose", async () => {
    const article = {
      title: "LSD",
      summary: "Published contact: research@example.org",
      submittedBy: { email: "private@example.com" },
    };
    const diff = `# article: lsd\n\n-null\n${JSON.stringify(article, null, 2).split("\n").map((line) => `+${line}`).join("\n")}\n`;
    grantWriteCapability(createClient({ ...PROPOSAL, diff }), { intentToken: "article-token" });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.proposal.diff).not.toContain("private@example.com");
    expect(body.proposal.diff).not.toContain("submittedBy");
    expect(body.proposal.diff).toContain(article.summary);
  });

  it("withholds a partial comparison when a truncated historical object still contains private metadata", async () => {
    const diff = `${PROPOSAL.diff}\n\n# article: new-article\n\n+{\n+  "submittedBy": "private@example.com",\n`;
    grantWriteCapability(createClient({ ...PROPOSAL, diff }), { intentToken: "article-token" });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/dev/proposals/cp_1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.proposal).toMatchObject({ comparisonMode: "unavailable", diff: "" });
    expect(JSON.stringify(body)).not.toContain("private@example.com");
  });
});

describeRoleFloor({
  floor: "editor",
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
  refused: "contributor",
  calls: [
    {
      name: "POST comment",
      call: async () => (await import("./comment/route")).POST(commentRequest("cp_1", { text: "Hi" })),
    },
  ],
});
