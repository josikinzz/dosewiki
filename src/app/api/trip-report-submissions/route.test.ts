import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTripReportSubmission,
  validateTripReportSubmission,
  type TripReportSubmissionInput,
} from "@/features/reports/submissions/tripReportSubmissions";

vi.mock("server-only", () => ({}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn((request: Request) => request.headers.get("x-forwarded-for") ?? "unknown"),
}));

const mocks = vi.hoisted(() => ({
  storeCreate: vi.fn(),
  getPublicTripReportSubmissionStore: vi.fn(),
}));

vi.mock("@/features/reports/submissions/tripReportSubmissionStore.server", () => ({
  getPublicTripReportSubmissionStore: mocks.getPublicTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError: class TripReportSubmissionStorageConfigurationError extends Error {},
}));

const validBody = {
  report: {
    title: "Careful low dose museum walk",
    subject: { name: "Anonymous" },
    substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
    introduction: "A planned low-dose experience with a sober friend nearby.",
    onset: [{ description: "First body lightness and mild visual sharpening." }],
    peak: [{ description: "Strong color enhancement, introspection, and manageable stimulation." }],
    offset: [{ description: "Effects faded into tiredness with some residual stimulation." }],
    conclusion: "Useful but sleep was delayed, so the timing mattered.",
    tags: ["psychedelic"],
  },
  contact_email: "submitter@example.com",
  may_contact: true,
  publish_consent: true,
  age_confirmed: true,
  website: "",
};

describe("trip report submissions public route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeCreate.mockReset();
    mocks.getPublicTripReportSubmissionStore.mockReset();
    mocks.getPublicTripReportSubmissionStore.mockResolvedValue({
      create: mocks.storeCreate,
    });
    mocks.storeCreate.mockResolvedValue({
      row: createTripReportSubmission(
        {
          ...validBody,
          honeypot: "",
          ip_hash_secret: "hash-secret",
          ip: "203.0.113.10",
          user_agent: "vitest",
        },
        { id: "submission-1", now: new Date("2026-06-11T12:00:00.000Z") },
      ),
      warnings: [],
    });
  });

  it("rate-limits and stores valid public submissions without exposing review state", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "vitest",
        },
        body: JSON.stringify(validBody),
      }),
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicTripReportSubmit");
    expect(mocks.storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: "submitter@example.com",
        honeypot: "",
        ip: "203.0.113.10",
        user_agent: "vitest",
      }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: "submission-1",
      status: "received",
      warnings: [],
    });
  });

  it("keeps submitted identity and link fields out of the stored row and says so", async () => {
    // Mirrors DataTripReportSubmissionStore.create so the assertion covers the
    // real normalization rather than a fixture.
    mocks.storeCreate.mockImplementation(async (input: TripReportSubmissionInput) => {
      const validation = validateTripReportSubmission(input);
      if (validation.ok === false) {
        throw new Error(validation.errors.join(" "));
      }

      return {
        row: createTripReportSubmission(input, {
          id: "submission-1",
          now: new Date("2026-06-11T12:00:00.000Z"),
        }),
        warnings: validation.warnings,
      };
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dose.wiki/api/trip-report-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validBody,
          report: {
            ...validBody.report,
            subject: {
              name: "Not The Founder",
              profile_key: "FOUNDER",
              avatar_url: "https://attacker.example/face.png",
              pdf_url: "https://attacker.example/tracker.pdf",
            },
          },
        }),
      }),
    );

    const { row } = await mocks.storeCreate.mock.results[0].value;
    for (const field of ["profile_key", "avatar_url", "pdf_url"]) {
      expect(row.report.subject).not.toHaveProperty(field);
    }
    expect(JSON.stringify(row)).not.toContain("attacker.example");
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: "submission-1",
      status: "received",
      warnings: [
        "Contributor profile key was ignored; an editor assigns report attribution when publishing.",
        "Avatar URL was ignored; a published report shows the avatar of the contributor profile it is attributed to.",
        "PDF URL was ignored; outbound links on a published report are added by an editor, not by the submitter.",
      ],
    });
  });
});
