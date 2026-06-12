import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  })),
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

describe("trip report submission status route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeTransition.mockReset();
    mocks.getTripReportSubmissionStore.mockReset();
    mocks.getTripReportSubmissionStore.mockResolvedValue({
      transition: mocks.storeTransition,
    });
    mocks.storeTransition.mockResolvedValue({
      id: "submission-1",
      status: "accepted",
      reviewed_by: "editor@example.com",
      review_notes: "Good candidate.",
    });
  });

  it("updates submission status as the authenticated editor", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/status", {
        method: "POST",
        body: JSON.stringify({ status: "accepted", notes: "Good candidate." }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(mocks.storeTransition).toHaveBeenCalledWith("submission-1", {
      status: "accepted",
      reviewer: "editor@example.com",
      notes: "Good candidate.",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      submission: { id: "submission-1", status: "accepted" },
    });
  });
});
