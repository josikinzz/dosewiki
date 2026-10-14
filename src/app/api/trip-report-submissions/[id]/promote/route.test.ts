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
  storePreviewPromotion: vi.fn(),
  storePromote: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

function promoteRequest(body: unknown, origin = "https://dose.wiki"): Request {
  return new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "submission-1" }) };

describe("trip report submission promotion route", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
    mocks.storePreviewPromotion.mockReset();
    mocks.storePromote.mockReset();
    mocks.getTripReportSubmissionStore.mockReset().mockResolvedValue({
      previewPromotion: mocks.storePreviewPromotion,
      promote: mocks.storePromote,
    });
  });

  it("names the suggested owner without granting ownership", async () => {
    mocks.storePromote.mockResolvedValueOnce({
      submission: { id: "submission-1", status: "exported" },
      reportId: "trip-report-id",
      payload: { slug: "careful-low-dose-museum-walk" },
      suggestedOwner: { email: "owner@example.com", username: "nervewing" },
    });
    const { POST } = await import("./route");

    const response = await POST(promoteRequest({ publish: true }), context);

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      published: true,
      suggestedOwner: { email: "owner@example.com", username: "nervewing" },
    });
  });

  it("refuses a cross-origin POST with 403 before the session or store", async () => {
    const { POST } = await import("./route");

    const response = await POST(promoteRequest({ publish: true }, "https://evil.example"), context);

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).not.toHaveBeenCalled();
    expect(mocks.storePromote).not.toHaveBeenCalled();
    expect(mocks.storePreviewPromotion).not.toHaveBeenCalled();
  });

  it("refuses to publish for an editor without calling the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(promoteRequest({ publish: true }), context);

    expect(response.status).toBe(403);
    expect(mocks.storePromote).not.toHaveBeenCalled();
    expect(mocks.storePreviewPromotion).not.toHaveBeenCalled();
  });
});
