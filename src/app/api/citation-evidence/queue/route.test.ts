import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import type { CitationQueueSummary } from "../../../../../server/lib/citationQueueFilter";

vi.mock("server-only", () => ({}));
vi.mock("@server/postgres/runtime/api", () => ({
  api: { citationEvidence: { getQueueSummary: "citationEvidence.getQueueSummary" } },
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));
vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

const summary = (
  slug: string,
  overrides: Partial<CitationQueueSummary>,
): CitationQueueSummary => ({
  slug,
  articleId: null,
  totalRows: 1,
  supportedCount: 0,
  needsSourceCount: 0,
  needsReviewCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  blockingCount: 0,
  blockingNeedsSourceCount: 0,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 0,
  blockingRejectedCount: 0,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: [],
  updatedAt: null,
  ...overrides,
});

const compactSummaries = [
  summary("lsd", {
    totalRows: 3,
    supportedCount: 2,
    rejectedCount: 1,
    blockingRejectedCount: 1,
    sectionIds: ["summary", "dosage"],
    updatedAt: "2026-02-01T00:00:00.000Z",
  }),
  summary("mdma", { approvedCount: 1, sectionIds: ["dosage"] }),
];

describe("citation review queue route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.query.mockResolvedValue(compactSummaries);
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("loads one complete compact summary result and applies the default filter and order", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/queue"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { queue: CitationQueueSummary[] };
    expect(body.queue).toEqual([
      summary("lsd", {
        totalRows: 3,
        supportedCount: 2,
        rejectedCount: 1,
        blockingRejectedCount: 1,
        sectionIds: ["dosage", "summary"],
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith("citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
    });
  });

  it("applies the requested filter to the complete aggregate result", async () => {
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

  it("names the data server and request id when the aggregate query fails", async () => {
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
});
