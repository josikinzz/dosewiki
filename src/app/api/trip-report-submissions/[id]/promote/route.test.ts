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

describe("trip report submission promotion route", () => {
  beforeEach(() => {
    vi.resetModules();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
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

  it("previews an accepted submission without publishing automatically, as an editor", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
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
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(mocks.storePreviewPromotion).toHaveBeenCalledWith("submission-1", {
      profileKey: undefined,
      confirmAuthorNameClaim: false,
      reviewer: "editor@example.com",
      actorEmail: "editor@example.com",
    });
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

  it("publishes through the Postgres promotion path only when explicitly requested", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(mocks.storePromote).toHaveBeenCalledWith("submission-1", {
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      notes: "Published from accepted trip report submission.",
      profileKey: undefined,
      confirmAuthorNameClaim: false,
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

  it("refuses to publish for an editor without calling the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.storePromote).not.toHaveBeenCalled();
    expect(mocks.storePreviewPromotion).not.toHaveBeenCalled();
  });

  it("forwards editor-assigned contributor attribution to the promotion", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true, profile_key: " ada " }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(mocks.storePromote).toHaveBeenCalledWith("submission-1", {
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      notes: "Published from accepted trip report submission.",
      profileKey: "ada",
      confirmAuthorNameClaim: false,
    });
    expect(response.status).toBe(200);
  });

  it("rejects a promotion key that does not resolve to a contributor profile", async () => {
    mocks.storePromote.mockRejectedValue(new Error('Contributor profile "GHOST" not found.'));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true, profile_key: "GHOST" }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Contributor profile not found." });
  });

  it("relays an unadjudicated author-name claim as a conflict the editor must resolve", async () => {
    // Postgres frames a thrown mutation error with its own request prefix and a
    // stack; the editor only needs the sentence naming the two ways out.
    mocks.storePromote.mockRejectedValue(
      new Error(
        "[DATA M(tripReportSubmissions:promote)] [Request ID: abc] Server Error\n" +
          'Uncaught Error: Author name "nervewing" matches contributor profile "NERVEWING". ' +
          "Assign that profile key to attribute the report, or confirm publishing it without attribution.\n" +
          "    at handler (../server/tripReportSubmissions.ts:1:1)",
      ),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        'Author name "nervewing" matches contributor profile "NERVEWING". ' +
        "Assign that profile key to attribute the report, or confirm publishing it without attribution.",
    });
  });

  it("forwards the editor's acknowledgement of a matching byline", async () => {
    const { POST } = await import("./route");

    await POST(
      new Request("https://dose.wiki/api/trip-report-submissions/submission-1/promote", {
        method: "POST",
        body: JSON.stringify({ publish: true, confirm_author_name_claim: true }),
      }),
      { params: Promise.resolve({ id: "submission-1" }) },
    );

    expect(mocks.storePromote).toHaveBeenCalledWith("submission-1", {
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      notes: "Published from accepted trip report submission.",
      profileKey: undefined,
      confirmAuthorNameClaim: true,
    });
  });
});
