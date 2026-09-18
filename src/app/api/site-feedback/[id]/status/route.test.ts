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
  getSiteFeedbackStore: vi.fn(),
}));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getSiteFeedbackStore: mocks.getSiteFeedbackStore,
  SiteFeedbackNotFoundError: class SiteFeedbackNotFoundError extends Error {},
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
}));

import { SiteFeedbackNotFoundError } from "@/features/site-feedback/siteFeedbackStore.server";
import { POST } from "./route";

function statusRequest(body: unknown): Request {
  return new Request("https://dose.wiki/api/site-feedback/feedback-1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "feedback-1" }) };

/** Shared rules live in src/lib/http/feedbackStatusRoute.test.ts; this file pins the site identity. */
describe("site feedback status route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.requireRoleSession
      .mockReset()
      .mockImplementation(roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }));
    mocks.transition.mockReset().mockResolvedValue({ id: "feedback-1", status: "resolved" });
    mocks.getSiteFeedbackStore.mockReset().mockResolvedValue({ transition: mocks.transition });
  });

  it("transitions through the site feedback store as the admin", async () => {
    const response = await POST(
      statusRequest({ status: "resolved", note: " Search focus bug shipped in 1.4. " }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.getSiteFeedbackStore).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledWith("feedback-1", {
      status: "resolved",
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      note: "Search focus bug shipped in 1.4.",
    });
  });

  it("accepts every site feedback status and nothing else", async () => {
    for (const status of ["new", "reviewing", "resolved", "rejected", "spam"]) {
      expect((await POST(statusRequest({ status }), context)).status).toBe(200);
    }
    expect((await POST(statusRequest({ status: "open" }), context)).status).toBe(400);
  });

  it("names site feedback in its 404 and its generic failure", async () => {
    mocks.transition.mockRejectedValueOnce(new SiteFeedbackNotFoundError("x"));
    const missing = await POST(statusRequest({ status: "resolved" }), context);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "Site feedback not found." });

    mocks.transition.mockRejectedValueOnce(new Error("boom"));
    const failed = await POST(statusRequest({ status: "resolved" }), context);
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "Unable to update site feedback right now." });
  });
});
