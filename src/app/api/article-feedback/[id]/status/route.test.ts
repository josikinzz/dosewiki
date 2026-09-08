import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
  getArticleFeedbackStore: vi.fn(),
}));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => ({
  getArticleFeedbackStore: mocks.getArticleFeedbackStore,
  ArticleFeedbackNotFoundError: class ArticleFeedbackNotFoundError extends Error {},
  ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
}));

import { ArticleFeedbackNotFoundError } from "@/features/article/feedback/articleFeedbackStore.server";
import { POST } from "./route";

function statusRequest(body: unknown): Request {
  return new Request("https://dose.wiki/api/article-feedback/feedback-1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "feedback-1" }) };

/** Shared rules live in src/lib/http/feedbackStatusRoute.test.ts; this file pins the article identity. */
describe("article feedback status route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.requireRoleSession
      .mockReset()
      .mockImplementation(roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }));
    mocks.transition.mockReset().mockResolvedValue({ id: "feedback-1", status: "resolved" });
    mocks.getArticleFeedbackStore.mockReset().mockResolvedValue({ transition: mocks.transition });
  });

  it("transitions through the article feedback store as the admin", async () => {
    const response = await POST(
      statusRequest({ status: "resolved", note: " Fixed the duration table. " }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.getArticleFeedbackStore).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledWith("feedback-1", {
      status: "resolved",
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      note: "Fixed the duration table.",
    });
  });

  it("accepts every article feedback status and nothing else", async () => {
    for (const status of ["new", "reviewing", "resolved", "rejected", "spam"]) {
      expect((await POST(statusRequest({ status }), context)).status).toBe(200);
    }
    expect((await POST(statusRequest({ status: "open" }), context)).status).toBe(400);
  });

  it("names article feedback in its 404 and its generic failure", async () => {
    mocks.transition.mockRejectedValueOnce(new ArticleFeedbackNotFoundError("x"));
    const missing = await POST(statusRequest({ status: "resolved" }), context);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "Article feedback not found." });

    mocks.transition.mockRejectedValueOnce(new Error("boom"));
    const failed = await POST(statusRequest({ status: "resolved" }), context);
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "Unable to update article feedback right now." });
  });
});
