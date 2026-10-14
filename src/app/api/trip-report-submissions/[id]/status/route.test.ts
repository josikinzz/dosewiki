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

const statusRequest = (origin = "https://dose.wiki") =>
  new Request("https://dose.wiki/api/trip-report-submissions/submission-1/status", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ status: "accepted", notes: "Good candidate." }),
  });

const context = { params: Promise.resolve({ id: "submission-1" }) };

describe("trip report submission status route", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
    mocks.storeTransition.mockReset();
    mocks.getTripReportSubmissionStore.mockReset().mockResolvedValue({ transition: mocks.storeTransition });
  });

  it("refuses an editor before touching the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(statusRequest(), context);

    expect(response.status).toBe(403);
    expect(mocks.getTripReportSubmissionStore).not.toHaveBeenCalled();
    expect(mocks.storeTransition).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin POST with 403 before the session or store", async () => {
    const { POST } = await import("./route");

    const response = await POST(statusRequest("https://evil.example"), context);

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).not.toHaveBeenCalled();
    expect(mocks.getTripReportSubmissionStore).not.toHaveBeenCalled();
  });
});
