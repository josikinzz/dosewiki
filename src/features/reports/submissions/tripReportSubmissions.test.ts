import { describe, expect, it } from "vitest";

import {
  buildDataTripReportImportPayload,
  createTripReportSubmission,
  transitionTripReportSubmission,
  validateTripReportSubmission,
  type TripReportSubmissionInput,
} from "./tripReportSubmissions";

const validSubmission: TripReportSubmissionInput = {
  report: {
    title: " Careful low dose museum walk ",
    subject: {
      name: " Anonymous ",
      trip_date: "2026-05-20",
      age: "28",
      gender: "not specified",
      medications: "none",
      setting: "Quiet museum and apartment",
    },
    substances: [{ name: " LSD ", dose: "75 ug", roa: " oral " }],
    introduction: "A planned low-dose experience with a sober friend nearby.",
    onset: [
      {
        time: " T+00:45 ",
        description: " First body lightness and mild visual sharpening. ",
      },
    ],
    peak: [
      {
        time: "T+02:30",
        description: "Strong color enhancement, introspection, and manageable stimulation.",
      },
    ],
    offset: [
      {
        time: "T+07:00",
        description: "Effects faded into tiredness with some residual stimulation.",
      },
    ],
    conclusion: "Useful but sleep was delayed, so the timing mattered.",
    tags: [" psychedelic ", "low dose", ""],
  },
  contact_email: " submitter@example.com ",
  may_contact: true,
  publish_consent: true,
  age_confirmed: true,
  honeypot: "",
  ip: "203.0.113.10",
  ip_hash_secret: "hash-secret",
  user_agent: "vitest",
};

describe("trip report submission intake", () => {
  it("turns a valid public submission into a normalized private submitted row", () => {
    const row = createTripReportSubmission(validSubmission, {
      id: "submission-1",
      now: new Date("2026-06-11T12:00:00.000Z"),
    });

    expect(row).toMatchObject({
      id: "submission-1",
      status: "submitted",
      schema_version: 1,
      title: "Careful low dose museum walk",
      author_name: "Anonymous",
      substance_names: ["LSD"],
      contact_email: "submitter@example.com",
      may_contact: true,
      publish_consent: true,
      age_confirmed: true,
      honeypot_triggered: false,
      user_agent: "vitest",
      created_at: "2026-06-11T12:00:00.000Z",
      updated_at: "2026-06-11T12:00:00.000Z",
    });
    expect(row.report.subject.name).toBe("Anonymous");
    expect(row.report.substances).toEqual([{ name: "LSD", dose: "75 ug", roa: "oral" }]);
    expect(row.report.tags).toEqual(["psychedelic", "low dose"]);
    expect(row.ip_hash).toMatch(/^sha256:/);
    expect(row.ip_hash).not.toContain("203.0.113.10");
  });

  it("reports validation errors before a submission is inserted", () => {
    const result = validateTripReportSubmission({
      ...validSubmission,
      publish_consent: false,
      age_confirmed: false,
      report: {
        ...validSubmission.report,
        title: " ",
        substances: [],
      },
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        "Title is required.",
        "At least one substance is required.",
        "Publish consent is required.",
        "Age confirmation is required.",
      ],
      warnings: [],
    });
  });

  it("refuses to store the identity and link fields a public submitter claimed", () => {
    const claimed: TripReportSubmissionInput = {
      ...validSubmission,
      report: {
        ...validSubmission.report,
        subject: {
          ...validSubmission.report.subject,
          profile_key: "FOUNDER",
          avatar_url: "https://attacker.example/face.png",
          pdf_url: "https://attacker.example/tracker.pdf",
        },
      },
    };

    const validation = validateTripReportSubmission(claimed);
    expect(validation).toMatchObject({
      ok: true,
      warnings: [
        "Contributor profile key was ignored; an editor assigns report attribution when publishing.",
        "Avatar URL was ignored; a published report shows the avatar of the contributor profile it is attributed to.",
        "PDF URL was ignored; outbound links on a published report are added by an editor, not by the submitter.",
      ],
    });

    const row = createTripReportSubmission(claimed, {
      id: "submission-claim",
      now: new Date("2026-06-11T12:00:00.000Z"),
    });
    const payload = buildDataTripReportImportPayload({ ...row, status: "accepted" });

    for (const field of ["profile_key", "avatar_url", "pdf_url"]) {
      expect(row.report.subject).not.toHaveProperty(field);
      expect(payload.subject).not.toHaveProperty(field);
    }
    expect(JSON.stringify(payload)).not.toContain("attacker.example");
  });

  it("keeps honeypot submissions private as spam while returning a stored row", () => {
    const row = createTripReportSubmission(
      { ...validSubmission, honeypot: "buy now" },
      { id: "submission-spam", now: new Date("2026-06-11T12:01:00.000Z") },
    );

    expect(row.status).toBe("spam");
    expect(row.honeypot_triggered).toBe(true);
  });

  it("enforces review status transitions and builds an accepted Postgres promotion payload", () => {
    const submitted = createTripReportSubmission(validSubmission, {
      id: "submission-2",
      now: new Date("2026-06-11T12:00:00.000Z"),
    });
    const accepted = transitionTripReportSubmission(submitted, {
      status: "accepted",
      reviewer: "editor@example.com",
      notes: "Good candidate.",
      now: new Date("2026-06-11T12:02:00.000Z"),
    });

    expect(accepted).toMatchObject({
      status: "accepted",
      reviewed_by: "editor@example.com",
      review_notes: "Good candidate.",
      reviewed_at: "2026-06-11T12:02:00.000Z",
      updated_at: "2026-06-11T12:02:00.000Z",
    });
    expect(() =>
      transitionTripReportSubmission(accepted, {
        status: "submitted",
        reviewer: "editor@example.com",
      }),
    ).toThrow("Illegal transition: accepted -> submitted.");
    expect(() =>
      transitionTripReportSubmission(accepted, {
        status: "exported",
        reviewer: "editor@example.com",
      }),
    ).toThrow("Illegal transition: accepted -> exported.");
    expect(buildDataTripReportImportPayload(accepted)).toMatchObject({
      slug: "careful-low-dose-museum-walk",
      title: "Careful low dose museum walk",
      featured: false,
      subject: { name: "Anonymous" },
      substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
    });
    expect(() =>
      buildDataTripReportImportPayload({
        ...accepted,
        status: "exported",
      }),
    ).toThrow("Only accepted submissions can be promoted. Current status: exported.");
  });
});
