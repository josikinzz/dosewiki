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
  storeTransition: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };

const statusRequest = (body: unknown = { status: "accepted", notes: "Good candidate." }) =>
  new Request("https://dose.wiki/api/trip-report-submissions/submission-1/status", {
    method: "POST",
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ id: "submission-1" }) };

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

  it("maps the store's not-found error to 404 with the route's message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Imported after resetModules so the class is the same object the route checks with instanceof.
    const { TripReportSubmissionNotFoundError } = await import(
      "@/features/reports/submissions/dataTripReportSubmissionStore"
    );
    mocks.storeTransition.mockRejectedValue(new TripReportSubmissionNotFoundError("submission-1"));
    const { POST } = await import("./route");

    const response = await POST(statusRequest(), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Trip report submission not found." });
  });

  it("relays an illegal transition as 400 with the store's sentence", async () => {
    mocks.storeTransition.mockRejectedValue(new Error("Illegal transition: imported -> accepted."));
    const { POST } = await import("./route");

    const response = await POST(statusRequest(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Illegal transition: imported -> accepted." });
  });

  it("rejects a status outside the vocabulary with 400 before reaching the store", async () => {
    const { POST } = await import("./route");

    for (const status of ["archived", 7, null, undefined]) {
      const response = await POST(statusRequest({ status }), context);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "A valid submission status is required." });
    }
    expect(mocks.getTripReportSubmissionStore).not.toHaveBeenCalled();
    expect(mocks.storeTransition).not.toHaveBeenCalled();
  });
});
