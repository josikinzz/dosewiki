import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { NEEDS_REVIEW_SUBMISSION_STATUSES } from "@/features/dev/tools/trip-report-portal/tripReportPortalModel";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  storeCount: vi.fn(),
  storeList: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: mocks.TripReportSubmissionStorageConfigurationError,
}));

describe("trip report needs-review count route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeCount.mockReset();
    mocks.storeList.mockReset();
    mocks.getTripReportSubmissionStore.mockReset();
    mocks.getTripReportSubmissionStore.mockResolvedValue({
      count: mocks.storeCount,
      list: mocks.storeList,
    });
    mocks.storeCount.mockResolvedValue(312);
  });

  it("counts exactly the Needs review statuses through the store's count call", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/needs-review-count"));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(mocks.storeCount).toHaveBeenCalledTimes(1);
    expect(mocks.storeCount).toHaveBeenCalledWith({ statuses: [...NEEDS_REVIEW_SUBMISSION_STATUSES] });
    // The badge never pays for a list download.
    expect(mocks.storeList).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    // Above the old 250-per-status list cap: the count is not truncated.
    await expect(response.json()).resolves.toEqual({ ok: true, count: 312 });
  });

  it("answers 503 when submission storage is not configured", async () => {
    mocks.getTripReportSubmissionStore.mockRejectedValue(
      new mocks.TripReportSubmissionStorageConfigurationError("Trip report submission storage is not configured."),
    );
    // Imported after resetModules so the route binds the hoisted store mock, as in the queue route test.
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/needs-review-count"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Trip report submission storage is not configured.",
    });
  });
});
