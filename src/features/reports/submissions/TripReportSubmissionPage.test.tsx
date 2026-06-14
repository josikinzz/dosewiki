import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TripReportSubmissionPage } from "./TripReportSubmissionPage";

function changeField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
}

function clickLabel(text: RegExp) {
  const label = screen.getByText(text).closest("label");
  expect(label).not.toBeNull();
  fireEvent.click(label as HTMLLabelElement);
}

describe("TripReportSubmissionPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits the public form to the private trip report intake endpoint", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            ok: true,
            id: "submission-1",
            warnings: ["Narrative is short; keep in review queue."],
          },
          { status: 202 },
        ),
      ),
    );

    render(<TripReportSubmissionPage />);

    expect(screen.getByRole("progressbar", { name: "Required fields complete" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    await user.click(screen.getByRole("tab", { name: /Detailed/ }));

    changeField(/^Title/, "Careful low dose museum walk");
    changeField(/Author or pseudonym/, "Anonymous");
    changeField(/Substance 1 name/, "LSD");
    changeField(/Substance 1 dose/, "75 ug");
    changeField(/Substance 1 ROA/, "oral");
    changeField(/Setting/, "Quiet museum and apartment");
    changeField(/Introduction/, "A planned low-dose experience with a sober friend nearby.");
    changeField(/Onset entry 1 time/, "T+00:45");
    changeField(/Onset entry 1 description/, "First body lightness and mild visual sharpening.");
    changeField(/Peak entry 1 description/, "Strong color enhancement and manageable stimulation.");
    changeField(/Offset entry 1 description/, "Effects faded into tiredness.");
    changeField(/Conclusion/, "Useful but sleep was delayed, so the timing mattered.");
    changeField(/Tags/, "psychedelic, low dose");
    changeField(/Contact email/, "submitter@example.com");
    clickLabel(/Editors may contact me/);
    clickLabel(/I consent/);
    clickLabel(/I confirm I am at least 18 years old/);

    expect(screen.getByRole("progressbar", { name: "Required fields complete" })).toHaveAttribute(
      "aria-valuenow",
      "4",
    );

    await user.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("/api/trip-report-submissions");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    expect(body).toMatchObject({
      contact_email: "submitter@example.com",
      may_contact: true,
      publish_consent: true,
      age_confirmed: true,
      report: {
        title: "Careful low dose museum walk",
        subject: {
          name: "Anonymous",
          setting: "Quiet museum and apartment",
        },
        substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
        introduction: "A planned low-dose experience with a sober friend nearby.",
        onset: [
          {
            time: "T+00:45",
            description: "First body lightness and mild visual sharpening.",
          },
        ],
        peak: [
          {
            description: "Strong color enhancement and manageable stimulation.",
          },
        ],
        offset: [
          {
            description: "Effects faded into tiredness.",
          },
        ],
        conclusion: "Useful but sleep was delayed, so the timing mattered.",
        tags: ["psychedelic", "low dose"],
      },
      website: "",
    });
    expect(await screen.findByText("Report received")).toBeInTheDocument();
    expect(screen.getByText("Narrative is short; keep in review queue.")).toBeInTheDocument();
  });

  it("renders backend validation errors", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "Submission validation failed.",
            errors: ["At least one substance is required."],
          },
          { status: 400 },
        ),
      ),
    );

    render(<TripReportSubmissionPage />);

    changeField(/^Title/, "Careful low dose museum walk");
    changeField(/Substance 1 name/, "LSD");
    clickLabel(/I consent/);
    clickLabel(/I confirm I am at least 18 years old/);
    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(await screen.findByText("Submission failed")).toBeInTheDocument();
    expect(screen.getByText("Submission validation failed.")).toBeInTheDocument();
    expect(screen.getByText("At least one substance is required.")).toBeInTheDocument();
  });
});
