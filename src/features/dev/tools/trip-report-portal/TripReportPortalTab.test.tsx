import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripReportPortalTab } from "./TripReportPortalTab";

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

const acceptedSubmission = { ...submission, status: "accepted" };

const publishedReport = {
  id: "report-1",
  slug: "alpine-clarity",
  featured: false,
  license: "author-retained",
  profileKey: null,
  createdAt: Date.parse("2024-02-02T00:00:00Z"),
  fields: {
    title: "Alpine clarity",
    subject: { name: "nervewing", trip_date: "2024-02-02" },
    substances: [{ name: "Psilocybin", dose: "3 g" }],
    introduction: "A walk above the treeline.",
    onset: [{ time: "T+0:30", description: "Cold air sharpens." }],
    peak: [],
    offset: [],
    tags: ["outdoors"],
  },
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

function stubCorpus(submissions: unknown[], reports: unknown[] = [publishedReport]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dev/trip-reports")) {
        return Response.json({ ok: true, reports, contributors: [{ key: "NERVEWING", displayName: "nervewing" }] });
      }

      if (url.includes("/queue")) {
        return Response.json({ ok: true, submissions });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

describe("TripReportPortalTab", () => {
  beforeEach(() => {
    stubCorpus([submission]);
  });

  it("indexes the published corpus and the intake queue as one list", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    // The needs-review bucket opens first, so the queued row is what shows.
    expect(await screen.findByText("Careful low dose museum walk")).toBeInTheDocument();
    expect(screen.queryByText("Alpine clarity")).not.toBeInTheDocument();

    // Both origins are counted in the corpus stats.
    expect(screen.getByText(/2 reports · 2 authors · 2 substances/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Published/ }));
    expect(await screen.findByText("Alpine clarity")).toBeInTheDocument();
    expect(screen.queryByText("Careful low dose museum walk")).not.toBeInTheDocument();
  });

  it("keeps the submission review transitions reachable from a needs-review row", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));

    expect(
      await screen.findByText(
        (_, element) => element?.tagName === "LI" && element.textContent === "LSD — 75 ug, oral",
      ),
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

  it("previews and publishes an accepted submission through the promotion endpoint", async () => {
    const user = userEvent.setup();
    stubCorpus([acceptedSubmission]);
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/dev/trip-reports")) {
        return Response.json({ ok: true, reports: [], contributors: [] });
      }

      if (url.includes("/queue")) {
        return Response.json({ ok: true, submissions: [acceptedSubmission] });
      }

      if (url.includes("/promote")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { publish?: boolean };
        return Response.json({ ok: true, published: body.publish === true, payload: promotionPayload });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    render(<TripReportPortalTab />);

    // An accepted submission is in neither the needs-review nor the published
    // bucket, so All is where an editor finds it.
    await user.click(await screen.findByRole("button", { name: /^All/ }));
    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));

    await user.click(screen.getByRole("button", { name: "Preview publish" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/promote",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ publish: false }) }),
      ),
    );
    expect(await screen.findByText("Promotion payload")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/promote",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ publish: true }) }),
      ),
    );
  });

  it("saves a published report against the snapshot it opened", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    await user.click(await screen.findByRole("button", { name: /^Published/ }));
    await user.click(await screen.findByRole("option", { name: /Alpine clarity/ }));

    const title = await screen.findByLabelText("Report title");
    await user.clear(title);
    await user.type(title, "Alpine clarity revisited");

    await user.click(screen.getByRole("button", { name: "Save report" }));

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url]) =>
        String(url).includes("/api/dev/trip-reports/record"),
      );
      expect(call).toBeDefined();

      const body = JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"));
      expect(body.mode).toBe("save");
      expect(body.id).toBe("report-1");
      // The concurrency guard carries the snapshot the editor opened, not the edit.
      expect(body.expected.title).toBe("Alpine clarity");
      expect(body.updates.title).toBe("Alpine clarity revisited");
      // An untouched attribution field must not be sent at all.
      expect("profile_key" in body).toBe(false);
    });
  });

  it("requires the slug typed back before it will delete a report", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    await user.click(await screen.findByRole("button", { name: /^Published/ }));
    await user.click(await screen.findByRole("option", { name: /Alpine clarity/ }));
    await user.click(await screen.findByRole("button", { name: "Delete this report" }));

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type the report slug to confirm deletion"), "alpine-clarity");
    expect(confirmButton).toBeEnabled();
  });
});
