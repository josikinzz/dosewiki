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

const summary = (slug: string, totalRows: number, approvedCount: number): CitationQueueSummary => ({
  slug,
  articleId: null,
  totalRows,
  supportedCount: 0,
  needsSourceCount: 0,
  needsReviewCount: 0,
  approvedCount,
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
});

describe("citation open-count route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.query.mockReset();
    mocks.getServerDataWriteCapability.mockReset();
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { query: mocks.query },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "review-token"),
      },
    });
  });

  it("counts the articles the Open queue would list: every article with a row not yet approved", async () => {
    mocks.query.mockResolvedValue([
      summary("lsd", 3, 1),
      summary("mdma", 2, 2),
      summary("dmt", 1, 0),
    ]);
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/citation-evidence/open-count"));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, count: 2 });
    expect(mocks.query).toHaveBeenCalledWith("citationEvidence.getQueueSummary", {
      apiKey: "review-token",
      actorEmail: "editor@example.com",
    });
  });
});
