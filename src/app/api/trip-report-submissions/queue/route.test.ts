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
  storeList: vi.fn(),
  getTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getTripReportSubmissionStore: mocks.getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

describe("trip report submissions editor queue route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeList.mockReset();
    mocks.getTripReportSubmissionStore.mockReset();
    mocks.getTripReportSubmissionStore.mockResolvedValue({
      list: mocks.storeList,
    });
    mocks.storeList.mockResolvedValue([
      {
        id: "submission-1",
        status: "submitted",
        schema_version: 1,
        title: "Careful low dose museum walk",
        author_name: "Anonymous",
        substance_names: ["LSD"],
        report: {
          title: "Careful low dose museum walk",
          subject: { name: "Anonymous" },
          substances: [{ name: "LSD" }],
          onset: [],
          peak: [],
          offset: [],
          tags: [],
        },
        may_contact: false,
        publish_consent: true,
        age_confirmed: true,
        honeypot_triggered: false,
        created_at: "2026-06-11T12:00:00.000Z",
        updated_at: "2026-06-11T12:00:00.000Z",
      },
    ]);
  });

  it("returns private submissions for editors using the diagnostic read limit", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/trip-report-submissions/queue?status=submitted"),
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(mocks.storeList).toHaveBeenCalledWith({ status: "submitted", limit: 100 });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      submissions: [{ id: "submission-1", status: "submitted" }],
    });
  });
});
