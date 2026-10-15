import { describe, expect, it } from "vitest";

import {
  buildDataTripReportImportPayload,
  createTripReportSubmission,
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
});
