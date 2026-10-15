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
  getSiteFeedbackStore: vi.fn(),
}));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getSiteFeedbackStore: mocks.getSiteFeedbackStore,
  SiteFeedbackNotFoundError: class SiteFeedbackNotFoundError extends Error {},
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "feedback-1" }) };

describe("site feedback status route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession
      .mockReset()
      .mockImplementation(roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }));
    mocks.getSiteFeedbackStore.mockReset().mockResolvedValue({ transition: vi.fn() });
  });

  it("refuses a cross-origin POST with 403 before touching the store", async () => {
    const response = await POST(
      new Request("https://dose.wiki/api/site-feedback/feedback-1/status", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ status: "resolved" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.getSiteFeedbackStore).not.toHaveBeenCalled();
  });
});
