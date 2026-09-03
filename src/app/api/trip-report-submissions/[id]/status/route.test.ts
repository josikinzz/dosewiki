import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  storeTransition: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };

const statusRequest = () =>
  new Request("https://dose.wiki/api/trip-report-submissions/submission-1/status", {
    method: "POST",
    body: JSON.stringify({ status: "accepted", notes: "Good candidate." }),
  });

describe("trip report submission status route", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
    mocks.storeTransition.mockReset();
    mocks.getTripReportSubmissionStore.mockReset();
    mocks.getTripReportSubmissionStore.mockResolvedValue({
      transition: mocks.storeTransition,
    });
    mocks.storeTransition.mockResolvedValue({
      id: "submission-1",
      status: "accepted",
      reviewed_by: "admin@example.com",
      review_notes: "Good candidate.",
    });
  });

  it("updates submission status as the signed-in admin, naming them as the actor", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(statusRequest(), { params: Promise.resolve({ id: "submission-1" }) });

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.storeTransition).toHaveBeenCalledWith("submission-1", {
      status: "accepted",
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      notes: "Good candidate.",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      submission: { id: "submission-1", status: "accepted" },
    });
  });

  it("refuses an editor before touching the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(statusRequest(), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.getTripReportSubmissionStore).not.toHaveBeenCalled();
    expect(mocks.storeTransition).not.toHaveBeenCalled();
  });
});
