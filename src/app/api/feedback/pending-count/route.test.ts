import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { ARTICLE_FEEDBACK_PENDING_STATUSES } from "@/features/article/feedback/articleFeedback";
import { SITE_FEEDBACK_PENDING_STATUSES } from "@/features/site-feedback/siteFeedback";
import { requireRoleSession } from "@/lib/auth/requireEditorSession";
import { enforceRateLimit } from "@server/http/nextRateLimit";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  articleCount: vi.fn(),
  articleList: vi.fn(),
  siteCount: vi.fn(),
  siteList: vi.fn(),
  getArticleFeedbackStore: vi.fn(),
  getSiteFeedbackStore: vi.fn(),
  ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
}));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => ({
  getArticleFeedbackStore: mocks.getArticleFeedbackStore,
  ArticleFeedbackStorageConfigurationError: mocks.ArticleFeedbackStorageConfigurationError,
}));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getSiteFeedbackStore: mocks.getSiteFeedbackStore,
  SiteFeedbackStorageConfigurationError: mocks.SiteFeedbackStorageConfigurationError,
}));

import { GET } from "./route";

describe("feedback pending-count route", () => {
  beforeEach(() => {
    mocks.articleCount.mockReset().mockResolvedValue(260);
    mocks.articleList.mockReset();
    mocks.siteCount.mockReset().mockResolvedValue(52);
    mocks.siteList.mockReset();
    mocks.getArticleFeedbackStore
      .mockReset()
      .mockResolvedValue({ count: mocks.articleCount, list: mocks.articleList });
    mocks.getSiteFeedbackStore
      .mockReset()
      .mockResolvedValue({ count: mocks.siteCount, list: mocks.siteList });
  });

  it("counts the pending statuses per source through the stores' count calls and sums them", async () => {
    const response = await GET(new Request("https://dose.wiki/api/feedback/pending-count"));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(mocks.articleCount).toHaveBeenCalledTimes(1);
    expect(mocks.articleCount).toHaveBeenCalledWith({ statuses: [...ARTICLE_FEEDBACK_PENDING_STATUSES] });
    expect(mocks.siteCount).toHaveBeenCalledTimes(1);
    expect(mocks.siteCount).toHaveBeenCalledWith({ statuses: [...SITE_FEEDBACK_PENDING_STATUSES] });
    // The badge never pays for a list download.
    expect(mocks.articleList).not.toHaveBeenCalled();
    expect(mocks.siteList).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    // Above the 250-per-status list cap: the count is not truncated.
    await expect(response.json()).resolves.toEqual({ ok: true, article: 260, site: 52, total: 312 });
  });

  it("refuses non-editors before touching either store", async () => {
    vi.mocked(requireRoleSession).mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "Editor access required." }, { status: 403 }),
    } as never);

    const response = await GET(new Request("https://dose.wiki/api/feedback/pending-count"));

    expect(response.status).toBe(403);
    expect(mocks.getArticleFeedbackStore).not.toHaveBeenCalled();
    expect(mocks.getSiteFeedbackStore).not.toHaveBeenCalled();
  });

  it("answers 503 when either feedback store is not configured", async () => {
    mocks.getSiteFeedbackStore.mockRejectedValue(
      new mocks.SiteFeedbackStorageConfigurationError("Site feedback storage is not configured."),
    );

    const response = await GET(new Request("https://dose.wiki/api/feedback/pending-count"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Site feedback storage is not configured.",
    });
  });
});
