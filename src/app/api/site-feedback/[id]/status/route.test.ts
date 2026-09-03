import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  storeTransition: vi.fn(),
  getSiteFeedbackStore: vi.fn(),
}));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getSiteFeedbackStore: mocks.getSiteFeedbackStore,
  SiteFeedbackNotFoundError: class SiteFeedbackNotFoundError extends Error {},
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
}));

import { POST } from "./route";

function statusRequest(body: unknown): Request {
  return new Request("https://dose.wiki/api/site-feedback/feedback-1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: { id: "feedback-1" } };

describe("site feedback status route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
    mocks.storeTransition.mockReset().mockResolvedValue({ id: "feedback-1", status: "resolved" });
    mocks.getSiteFeedbackStore.mockReset().mockResolvedValue({ transition: mocks.storeTransition });
  });

  it("refuses an editor before touching the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.getSiteFeedbackStore).not.toHaveBeenCalled();
    expect(mocks.storeTransition).not.toHaveBeenCalled();
  });

  it("stores the admin's trimmed note with the transition, naming them as the actor", async () => {
    const response = await POST(
      statusRequest({ status: "resolved", note: "  Search focus bug shipped in 1.4.  " }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.storeTransition).toHaveBeenCalledWith("feedback-1", {
      status: "resolved",
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      note: "Search focus bug shipped in 1.4.",
    });
  });

  it("leaves the stored note untouched when the note is absent or blank", async () => {
    await POST(statusRequest({ status: "reviewing" }), context);
    await POST(statusRequest({ status: "reviewing", note: "   " }), context);

    expect(mocks.storeTransition).toHaveBeenCalledTimes(2);
    for (const call of mocks.storeTransition.mock.calls) {
      expect(call[1]).toEqual({
        status: "reviewing",
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
        note: undefined,
      });
    }
  });

  it("rejects a non-string note before reaching the store", async () => {
    const response = await POST(statusRequest({ status: "resolved", note: 42 }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The review note must be text." });
    expect(mocks.storeTransition).not.toHaveBeenCalled();
  });
});
