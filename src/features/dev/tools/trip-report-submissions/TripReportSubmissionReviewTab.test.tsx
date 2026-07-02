import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripReportSubmissionReviewTab } from "./TripReportSubmissionReviewTab";

const submission = {
  id: "submission-1",
  status: "submitted",
  schema_version: 1,
  title: "Careful low dose museum walk",
  author_name: "Anonymous",
  substance_names: ["LSD"],
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
  honeypot_triggered: false,
  created_at: "2026-06-11T12:00:00.000Z",
  updated_at: "2026-06-11T12:00:00.000Z",
};

const acceptedSubmission = {
  ...submission,
  status: "accepted",
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

describe("TripReportSubmissionReviewTab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/queue")) {
          return Response.json({ ok: true, submissions: [submission] });
        }

        if (url.includes("/status")) {
          return Response.json({ ok: true, submission: { ...submission, status: "accepted" } });
        }

        return Response.json({ error: "unexpected" }, { status: 500 });
      }),
    );
  });

  it("loads private submissions and sends review status updates", async () => {
    const user = userEvent.setup();
    render(<TripReportSubmissionReviewTab />);

    expect(await screen.findByText("Private Convex intake queue for public trip report drafts.")).toBeInTheDocument();
    expect(await screen.findAllByText("Careful low dose museum walk")).toHaveLength(2);
    expect(
      screen.getByText((_, element) => element?.tagName === "LI" && element.textContent === "LSD — 75 ug, oral"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "accepted", notes: "Accepted for Convex promotion." }),
        }),
      ),
    );
  });

  it("previews and publishes accepted submissions through the promotion endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/queue")) {
        return Response.json({ ok: true, submissions: [acceptedSubmission] });
      }

      if (url.includes("/promote")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { publish?: boolean };
        return Response.json({
          ok: true,
          published: body.publish === true,
          submission: body.publish ? { ...acceptedSubmission, status: "exported" } : acceptedSubmission,
          reportId: body.publish ? "trip-report-id" : undefined,
          payload: promotionPayload,
        });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    render(<TripReportSubmissionReviewTab />);
    expect(await screen.findAllByText("Careful low dose museum walk")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Preview publish" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/promote",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ publish: false }),
        }),
      ),
    );
    expect(await screen.findByText("Promotion payload")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/promote",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ publish: true }),
        }),
      ),
    );
  });
});
