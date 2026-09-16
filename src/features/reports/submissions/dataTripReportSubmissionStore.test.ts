import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { DataTripReportSubmissionStore } from "./dataTripReportSubmissionStore";
import type { TripReportSubmissionInput } from "./tripReportSubmissions";

vi.mock("@server/postgres/runtime/api", () => ({
  makeFunctionReference: (name: string) => ({ name }),
}));

const validSubmission: TripReportSubmissionInput = {
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
  may_contact: false,
  publish_consent: true,
  age_confirmed: true,
  ip: "203.0.113.10",
  ip_hash_secret: "hash-secret",
  user_agent: "vitest",
};

function createClientRecorder() {
  const calls: Array<{ kind: "mutation" | "serviceMutation" | "query"; name: string; args: Record<string, unknown> }> = [];
  const insertedRow = {
    id: "submission-1",
    status: "submitted",
    schema_version: 1,
    title: "Careful low dose museum walk",
    author_name: "Anonymous",
    substance_names: ["LSD"],
    report: validSubmission.report,
    may_contact: false,
    publish_consent: true,
    age_confirmed: true,
    honeypot_triggered: false,
    created_at: "2026-06-11T12:00:00.000Z",
    updated_at: "2026-06-11T12:00:00.000Z",
  };
  const promotionPayload = {
    slug: "careful-low-dose-museum-walk",
    title: "Careful low dose museum walk",
    featured: false,
    subject: { name: "Anonymous" },
    substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
    onset: [],
    peak: [],
    offset: [],
    tags: ["psychedelic"],
  };

  return {
    calls,
    client: {
      mutation: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
        calls.push({ kind: "mutation", name: reference.name, args });
        if (reference.name === "tripReportSubmissions:promote") {
          return {
            submission: { ...insertedRow, status: "exported" },
            reportId: "tripReportId",
            payload: promotionPayload,
          };
        }
        return insertedRow;
      }),
      mutationAsService: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
        calls.push({ kind: "serviceMutation", name: reference.name, args });
        return insertedRow;
      }),
      query: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
        calls.push({ kind: "query", name: reference.name, args });
        if (reference.name === "tripReportSubmissions:list") {
          return [insertedRow];
        }
        if (reference.name === "tripReportSubmissions:listByStatuses") {
          return [insertedRow];
        }
        if (reference.name === "tripReportSubmissions:countByStatus") {
          return 7;
        }
        if (reference.name === "tripReportSubmissions:previewPromotion") {
          return { row: { ...insertedRow, status: "accepted" }, payload: promotionPayload };
        }
        return insertedRow;
      }),
    },
  };
}

describe("DataTripReportSubmissionStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates public submissions before writing private rows through Postgres", async () => {
    const recorder = createClientRecorder();
    const store = new DataTripReportSubmissionStore({
      client: recorder.client,
      apiKey: "test-key",
      idFactory: () => "submission-1",
    });

    await expect(
      store.create({
        ...validSubmission,
        publish_consent: false,
        report: { ...validSubmission.report, title: " ", substances: [] },
      }),
    ).rejects.toMatchObject({
      errors: ["Title is required.", "At least one substance is required.", "Publish consent is required."],
    });
    expect(recorder.calls).toEqual([]);

    const result = await store.create(validSubmission);

    expect(result.row).toMatchObject({
      id: "submission-1",
      status: "submitted",
      title: "Careful low dose museum walk",
      substance_names: ["LSD"],
    });
    expect(result.warnings).toEqual([]);
    expect(recorder.calls[0]).toMatchObject({
      kind: "serviceMutation",
      name: "tripReportSubmissions:create",
      args: {
        apiKey: "test-key",
        submission: expect.objectContaining({
          id: "submission-1",
          ip_hash: expect.stringMatching(/^sha256:/),
        }),
      },
    });
    expect(JSON.stringify(recorder.calls)).not.toContain("203.0.113.10");
  });

  it("never sends submitter-claimed identity or link fields to Postgres", async () => {
    const recorder = createClientRecorder();
    const store = new DataTripReportSubmissionStore({
      client: recorder.client,
      apiKey: "test-key",
      idFactory: () => "submission-1",
    });

    const result = await store.create({
      ...validSubmission,
      report: {
        ...validSubmission.report,
        subject: {
          name: "Not The Founder",
          profile_key: "FOUNDER",
          avatar_url: "https://attacker.example/face.png",
          pdf_url: "https://attacker.example/tracker.pdf",
        },
      },
    });

    const [createCall] = recorder.calls;
    const submission = createCall.args.submission as { report: { subject: Record<string, unknown> } };

    for (const field of ["profile_key", "avatar_url", "pdf_url"]) {
      expect(submission.report.subject).not.toHaveProperty(field);
    }
    expect(JSON.stringify(recorder.calls)).not.toContain("FOUNDER");
    expect(JSON.stringify(recorder.calls)).not.toContain("attacker.example");
    expect(result.warnings).toEqual([
      "Contributor profile key was ignored; an editor assigns report attribution when publishing.",
      "Avatar URL was ignored; a published report shows the avatar of the contributor profile it is attributed to.",
      "PDF URL was ignored; outbound links on a published report are added by an editor, not by the submitter.",
    ]);
  });

  it("uses private Postgres functions for editor queue reads and explicit promotion, naming the actor", async () => {
    const recorder = createClientRecorder();
    const store = new DataTripReportSubmissionStore({
      client: recorder.client,
      apiKey: "test-key",
    });

    await expect(store.list({ status: "submitted", limit: 25 })).resolves.toHaveLength(1);
    await expect(
      store.previewPromotion("submission-1", {
        reviewer: "editor@example.com",
        actorEmail: "editor@example.com",
      }),
    ).resolves.toMatchObject({
      payload: {
        slug: "careful-low-dose-museum-walk",
        featured: false,
      },
    });
    await expect(
      store.promote("submission-1", {
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
        notes: "Published from accepted submission.",
        profileKey: "ADA",
        confirmAuthorNameClaim: true,
      }),
    ).resolves.toMatchObject({
      submission: { status: "exported" },
      payload: { slug: "careful-low-dose-museum-walk" },
    });
    await expect(
      store.transition("submission-1", {
        status: "accepted",
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
      }),
    ).resolves.toMatchObject({ id: "submission-1" });

    expect(recorder.calls.map((call) => [call.kind, call.name, call.args])).toEqual([
      ["query", "tripReportSubmissions:list", { apiKey: "test-key", status: "submitted", limit: 25 }],
      [
        "query",
        "tripReportSubmissions:previewPromotion",
        {
          apiKey: "test-key",
          actorEmail: "editor@example.com",
          id: "submission-1",
          reviewer: "editor@example.com",
        },
      ],
      [
        "mutation",
        "tripReportSubmissions:promote",
        {
          apiKey: "test-key",
          actorEmail: "admin@example.com",
          id: "submission-1",
          reviewer: "admin@example.com",
          notes: "Published from accepted submission.",
          profileKey: "ADA",
          confirmAuthorNameClaim: true,
        },
      ],
      [
        "mutation",
        "tripReportSubmissions:transition",
        {
          apiKey: "test-key",
          actorEmail: "admin@example.com",
          id: "submission-1",
          status: "accepted",
          reviewer: "admin@example.com",
        },
      ],
    ]);
  });

  it("counts queue rows through the private count query instead of listing them", async () => {
    const recorder = createClientRecorder();
    const store = new DataTripReportSubmissionStore({
      client: recorder.client,
      apiKey: "test-key",
    });

    await expect(store.count({ statuses: ["submitted", "reviewing"] })).resolves.toBe(7);

    expect(recorder.calls.map((call) => [call.kind, call.name, call.args])).toEqual([
      [
        "query",
        "tripReportSubmissions:countByStatus",
        { apiKey: "test-key", statuses: ["submitted", "reviewing"] },
      ],
    ]);
  });

  it("lists every row in a status set through the uncapped private query, sending no limit", async () => {
    const recorder = createClientRecorder();
    const store = new DataTripReportSubmissionStore({
      client: recorder.client,
      apiKey: "test-key",
    });

    await expect(store.listByStatuses({ statuses: ["submitted", "reviewing"] })).resolves.toHaveLength(1);

    expect(recorder.calls.map((call) => [call.kind, call.name, call.args])).toEqual([
      [
        "query",
        "tripReportSubmissions:listByStatuses",
        { apiKey: "test-key", statuses: ["submitted", "reviewing"] },
      ],
    ]);
  });
});

