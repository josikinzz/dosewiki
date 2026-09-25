import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({ page: vi.fn(), getArticleFeedbackStore: vi.fn() }));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => ({
  getArticleFeedbackStore: mocks.getArticleFeedbackStore,
  ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
}));

import { GET } from "./route";

/** Shared rules live in src/lib/http/feedbackQueueRoute.test.ts; this file pins the article identity. */
describe("article feedback queue route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.page.mockReset().mockResolvedValue({
      feedback: [{ id: "old-unresolved", status: "new" }],
      nextCursor: null,
      counts: { new: 1, reviewing: 0, resolved: 250, rejected: 0, spam: 0 },
    });
    mocks.getArticleFeedbackStore.mockReset().mockResolvedValue({ page: mocks.page });
  });

  it("reads one server-filtered page from the article store", async () => {
    const response = await GET(new Request("https://dose.wiki/api/article-feedback/queue?status=new"));

    expect(response.status).toBe(200);
    expect(mocks.page).toHaveBeenCalledWith({ status: "new", order: "oldest", limit: 100 });
    await expect(response.json()).resolves.toMatchObject({
      feedback: [{ id: "old-unresolved" }],
      total: 1,
      counts: { resolved: 250 },
    });
  });

  it("accepts the article statuses and names article feedback in a refusal", async () => {
    for (const status of ["new", "reviewing", "resolved", "rejected", "spam", "all"]) {
      expect((await GET(new Request(`https://dose.wiki/api/article-feedback/queue?status=${status}`))).status).toBe(200);
    }
    const refused = await GET(new Request("https://dose.wiki/api/article-feedback/queue?status=open"));
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toEqual({ error: "Unknown article feedback status: open" });
  });
});
