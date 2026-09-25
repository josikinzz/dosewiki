import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({ get: vi.fn(), getArticleFeedbackStore: vi.fn() }));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => ({
  getArticleFeedbackStore: mocks.getArticleFeedbackStore,
  ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
}));

import { GET } from "./route";

const itemRequest = () => new Request("https://dose.wiki/api/article-feedback/feedback-1");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("article feedback item route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.get.mockReset().mockResolvedValue({ id: "feedback-1", status: "resolved" });
    mocks.getArticleFeedbackStore.mockReset().mockResolvedValue({ get: mocks.get });
  });

  it("reads one item by its public id, so a task link opens the same record", async () => {
    const response = await GET(itemRequest(), context("feedback-1"));

    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith("feedback-1");
    await expect(response.json()).resolves.toEqual({ ok: true, feedback: { id: "feedback-1", status: "resolved" } });
  });

  it("answers 404 for an id no row has", async () => {
    mocks.get.mockResolvedValueOnce(null);

    const response = await GET(itemRequest(), context("gone"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Article feedback not found." });
  });

  it("refuses a signed-out caller before reading the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));

    expect((await GET(itemRequest(), context("feedback-1"))).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
