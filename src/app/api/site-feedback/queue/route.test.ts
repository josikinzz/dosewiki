import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({ page: vi.fn(), getSiteFeedbackStore: vi.fn() }));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getSiteFeedbackStore: mocks.getSiteFeedbackStore,
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
}));

import { GET } from "./route";

/** Shared rules live in src/lib/http/feedbackQueueRoute.test.ts; this file pins the site identity. */
describe("site feedback queue route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.page.mockReset().mockResolvedValue({
      feedback: [],
      nextCursor: null,
      counts: { new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 },
    });
    mocks.getSiteFeedbackStore.mockReset().mockResolvedValue({ page: mocks.page });
  });

  it("reads one server-filtered page from the site store", async () => {
    const response = await GET(new Request("https://dose.wiki/api/site-feedback/queue?status=spam&q=watches&order=newest"));

    expect(response.status).toBe(200);
    expect(mocks.page).toHaveBeenCalledWith({ status: "spam", search: "watches", order: "newest", limit: 100 });
  });

  it("names site feedback in a refusal", async () => {
    const refused = await GET(new Request("https://dose.wiki/api/site-feedback/queue?status=open"));
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toEqual({ error: "Unknown site feedback status: open" });
  });
});
