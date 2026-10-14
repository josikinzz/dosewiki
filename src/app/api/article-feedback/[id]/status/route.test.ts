import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({ getArticleFeedbackStore: vi.fn() }));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => ({
  getArticleFeedbackStore: mocks.getArticleFeedbackStore,
  ArticleFeedbackNotFoundError: class ArticleFeedbackNotFoundError extends Error {},
  ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "feedback-1" }) };

/** Shared rules live in src/lib/http/feedbackStatusRoute.test.ts; this file pins the article identity. */
describe("article feedback status route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession
      .mockReset()
      .mockImplementation(roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }));
    mocks.getArticleFeedbackStore.mockReset();
  });

  it("refuses a cross-origin POST with 403 before touching the store", async () => {
    const response = await POST(
      new Request("https://dose.wiki/api/article-feedback/feedback-1/status", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ status: "resolved" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.getArticleFeedbackStore).not.toHaveBeenCalled();
  });
});
