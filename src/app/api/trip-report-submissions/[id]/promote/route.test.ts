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
  storePreviewPromotion: vi.fn(),
  storePromote: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

describe("trip report submission promotion route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storePreviewPromotion.mockReset();
    mocks.storePromote.mockReset();
    mocks.getTripReportSubmissionStore.mockReset();
    mocks.getTripReportSubmissionStore.mockResolvedValue({
      previewPromotion: mocks.storePreviewPromotion,
      promote: mocks.storePromote,
    });
    mocks.storePreviewPromotion.mockResolvedValue({
      row: { id: "submission-1", status: "accepted" },
      payload: {
        slug: "careful-low-dose-museum-walk",
        title: "Careful low dose museum walk",
        featured: false,
        subject: { name: "Anonymous" },
        substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
        onset: [],
        peak: [],
        offset: [],
        tags: [],
      },
    });
    mocks.storePromote.mockResolvedValue({
      submission: { id: "submission-1", status: "exported" },
      reportId: "trip-report-id",
      payload: {
        slug: "careful-low-dose-museum-walk",
        title: "Careful low dose museum walk",
        featured: false,
        subject: { name: "Anonymous" },
        substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
        onset: [],
        peak: [],
        offset: [],
        tags: [],
      },
    });
  });

  it("previews an accepted submission without publishing automatically", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: false }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(mocks.storePreviewPromotion).toHaveBeenCalledWith("submission-1");
    expect(mocks.storePromote).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      published: false,
      payload: {
        slug: "careful-low-dose-museum-walk",
        featured: false,
      },
    });
  });

  it("publishes through the Convex promotion path only when explicitly requested", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(mocks.storePromote).toHaveBeenCalledWith("submission-1", {
      reviewer: "editor@example.com",
      notes: "Published from accepted trip report submission.",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      published: true,
      submission: { id: "submission-1", status: "exported" },
      reportId: "trip-report-id",
      payload: {
        slug: "careful-low-dose-museum-walk",
        featured: false,
      },
    });
  });
});
