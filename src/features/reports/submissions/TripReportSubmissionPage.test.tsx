import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

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

  function encode(payload: unknown): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  // Asserted against the flavor flag so the suite also passes under an Effect
  // Index build (`NEXT_PUBLIC_SITE_FLAVOR=effectindex vitest run`).
  it.runIf(!SITE_FLAVOR_CONFIG.showPiruLinks)("ignores a Piru fragment where the flavor has no Piru links", () => {
    const hash = `#piru=${encode({ v: 1, title: "Saturday at home" })}`;
    window.history.replaceState(null, "", `/reports/submit${hash}`);

    render(<TripReportSubmissionPage />);

    expect(window.location.hash).toBe(hash);
    expect(screen.getByLabelText(/^Title/)).toHaveValue("");
    expect(screen.queryByRole("link", { name: "Piru" })).not.toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });

  describe.runIf(SITE_FLAVOR_CONFIG.showPiruLinks)("Piru session import", () => {
    afterEach(() => {
      window.history.replaceState(null, "", "/");
    });

    it("imports once under Strict Mode without showing the promotion", async () => {
      window.history.replaceState(null, "", `/reports/submit#piru=${encode({ v: 1, title: "Imported session" })}`);
      render(<StrictMode><TripReportSubmissionPage /></StrictMode>);
      expect(await screen.findByText("Filled in from your Piru session. Check everything before you submit.")).toBeInTheDocument();
      expect(screen.queryByText(/If you log your sessions/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Imported session");
    });

    it("fills the report from the fragment and leaves consents and contact alone", async () => {
      window.history.replaceState(
        null,
        "",
        `/reports/submit#piru=${encode({
          v: 1,
          source: "piru",
          title: "Saturday at home",
          substances: [
            { name: "MDMA", slug: "mdma", dose: "120 mg", roa: "oral" },
            { name: "Cannabis", dose: "1 joint", roa: "inhalation" },
          ],
          introduction: "Quiet evening with a friend.",
          timeline: {
            onset: [{ time: "T+0:30", description: "Warmth in the chest." }],
            peak: [{ time: "T+1:45", description: "<script>alert(1)</script>" }],
          },
          conclusion: "Slept well.",
          tags: ["entactogen", "at home"],
          publish_consent: true,
          age_confirmed: true,
          contact_email: "x@example.com",
        })}`,
      );

      render(<TripReportSubmissionPage />);

      expect(
        await screen.findByText("Filled in from your Piru session. Check everything before you submit."),
      ).toBeInTheDocument();
      expect(window.location.hash).toBe("");
      expect(window.location.pathname).toBe("/reports/submit");

      expect(screen.getByLabelText(/^Title/)).toHaveValue("Saturday at home");
      expect(screen.getByLabelText(/Substance 1 name/)).toHaveValue("MDMA");
      expect(screen.getByLabelText(/Substance 1 dose/)).toHaveValue("120 mg");
      expect(screen.getByLabelText(/Substance 1 ROA/)).toHaveValue("oral");
      expect(screen.getByLabelText(/Substance 2 ROA/)).toHaveValue("inhaled");
      expect(screen.getByRole("tab", { name: /Detailed/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText(/Introduction/)).toHaveValue("Quiet evening with a friend.");
      expect(screen.getByLabelText(/Onset entry 1 time/)).toHaveValue("T+00:30");
      expect(screen.getByLabelText(/Peak entry 1 description/)).toHaveValue(
        "<script>alert(1)</script>",
      );
      expect(document.querySelector("script")).toBeNull();
      expect(screen.getByLabelText(/Conclusion/)).toHaveValue("Slept well.");
      expect(screen.getByLabelText(/Tags/)).toHaveValue("entactogen, at home");

      expect(screen.getByLabelText(/Contact email/)).toHaveValue("");
      expect(screen.getByLabelText(/Author or pseudonym/)).toHaveValue("");
      for (const id of ["may-contact", "publish-consent", "age-confirmed"]) {
        expect(document.getElementById(id)).not.toBeChecked();
      }
      expect(screen.getByRole("progressbar", { name: "Required fields complete" })).toHaveAttribute(
        "aria-valuenow",
        "2",
      );

      fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
      expect(
        screen.queryByText("Filled in from your Piru session. Check everything before you submit."),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Piru" })).not.toBeInTheDocument();
    });

    it("leaves the form empty and says so when the fragment cannot be read", async () => {
      window.history.replaceState(null, "", "/reports/submit#piru=%%%not-base64");

      render(<TripReportSubmissionPage />);

      expect(
        await screen.findByText("The Piru session could not be read, so the form starts empty."),
      ).toBeInTheDocument();
      expect(window.location.hash).toBe("");
      expect(screen.getByLabelText(/^Title/)).toHaveValue("");
    });

    it("does nothing without a piru fragment", () => {
      window.history.replaceState(null, "", "/reports/submit#core-details");

      render(<TripReportSubmissionPage />);

      expect(window.location.hash).toBe("#core-details");
      expect(screen.queryByText(/Piru session/)).not.toBeInTheDocument();
    });

    it("points readers who did not come from Piru to its About page entry", async () => {
      window.history.replaceState(null, "", "/reports/submit");

      render(<TripReportSubmissionPage />);

      expect(await screen.findByRole("link", { name: "Piru" })).toHaveAttribute(
        "href",
        "/about#collaboration-piru",
      );
    });
  });
});
