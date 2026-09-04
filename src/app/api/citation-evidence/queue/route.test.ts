import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { emptyQueueSummary, type CitationQueueSummary } from "../../../../../convex/lib/citationQueueFilter";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    citationEvidence: {
      getQueueSummary: "citationEvidence.getQueueSummary",
    },
  },
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

function summary(slug: string, overrides: Partial<CitationQueueSummary>): CitationQueueSummary {
  return { ...emptyQueueSummary(slug, null), ...overrides };
}

// Two pages: "lsd" straddles the page boundary, "mdma" is fully approved.
const pages = [
  {
    summaries: [
      summary("lsd", { totalRows: 2, supportedCount: 2, sectionIds: ["summary"], updatedAt: "2026-01-01T00:00:00.000Z" }),
      summary("mdma", { totalRows: 1, approvedCount: 1, sectionIds: ["dosage"] }),
    ],
    continueCursor: "page-2",
  },
  {
    summaries: [
      summary("lsd", { totalRows: 1, rejectedCount: 1, blockingRejectedCount: 1, sectionIds: ["dosage"], updatedAt: "2026-02-01T00:00:00.000Z" }),
    ],
    continueCursor: null,
  },
];

describe("citation review queue route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.query.mockImplementation(async (_name: string, args: { cursor: string | null }) =>
      args.cursor === null ? pages[0] : pages[1],
    );
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("walks every summary page, merges articles across pages, and drains fully approved ones by default", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/queue"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      queue: [
        summary("lsd", {
          totalRows: 3,
          supportedCount: 2,
          rejectedCount: 1,
          blockingRejectedCount: 1,
          sectionIds: ["dosage", "summary"],
          updatedAt: "2026-02-01T00:00:00.000Z",
        }),
      ],
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenNthCalledWith(1, "citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      cursor: null,
    });
    expect(mocks.query).toHaveBeenNthCalledWith(2, "citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
      cursor: "page-2",
    });
  });

  it("applies the requested filter after merging", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/citation-evidence/queue?status=approved"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { queue: CitationQueueSummary[] };
    expect(body.queue.map((entry) => entry.slug)).toEqual(["mdma"]);
  });

  it("rejects an unknown status filter without querying", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/citation-evidence/queue?status=archived"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unknown citation review queue filter: archived",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("names the data server and the request id when the query itself fails", async () => {
    mocks.query.mockRejectedValue(
      new Error("[Request ID: cf332ca7b87fcca7] Server Error\nUncaught Error: boom"),
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/queue"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The data server could not run the queue query.",
      cause: "query",
      requestId: "cf332ca7b87fcca7",
    });
  });

  it("stops at the page cap and reports it as a capacity failure", async () => {
    mocks.query.mockResolvedValue({ summaries: [], continueCursor: "again" });
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/queue"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The evidence table has grown past what the queue can summarize in one load.",
      cause: "capacity",
    });
    expect(mocks.query).toHaveBeenCalledTimes(200);
  });
});
