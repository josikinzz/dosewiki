import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetDevRailBadgesForTests,
  useDevRailBadges,
} from "@/features/dev/pages/useDevRailBadges";
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

/** The index projection the corpus endpoint returns: no report body in it. */
const publishedReport = {
  id: "report-1",
  slug: "alpine-clarity",
  title: "Alpine clarity",
  subject: { name: "nervewing", trip_date: "2024-02-02" },
  substances: [{ name: "Psilocybin", dose: "3 g" }],
  tags: ["outdoors"],
  featured: false,
  license: "author-retained",
  profileKey: null,
  createdAt: Date.parse("2024-02-02T00:00:00Z"),
};

/** The body the record endpoint hands back once that row is opened. */
const publishedReportRecord = {
  id: "report-1",
  slug: "alpine-clarity",
  revision: "0".repeat(64),
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

function stubCorpus(submissions: (typeof submission)[], reports: unknown[] = [publishedReport]) {
  const storedSubmissions = submissions.map((row) => ({ ...row, review_notes: "" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      // The record endpoint serves both the GET body read and the POST writes.
      if (url.includes("/api/dev/trip-reports/record")) {
        return init?.method === "POST"
          ? Response.json({ ok: true, slug: "alpine-clarity", fields: publishedReportRecord.fields, revision: "1".repeat(64) })
          : Response.json({ ok: true, report: publishedReportRecord });
      }

      if (url.includes("/api/dev/trip-reports")) {
        return Response.json({ ok: true, reports, contributors: [{ key: "NERVEWING", displayName: "nervewing" }] });
      }

      if (url.endsWith("/status") && init?.method === "POST") {
        const segments = url.split("/");
        const id = segments[segments.length - 2];
        const row = storedSubmissions.find((entry) => entry.id === id);
        if (!row) return Response.json({ error: "Not found" }, { status: 404 });
        const decision = JSON.parse(String(init.body)) as { status: string; notes: string };
        row.status = decision.status;
        row.review_notes = decision.notes;
        return Response.json({ ok: true, submission: row });
      }

      if (url.includes("/queue")) {
        const requestUrl = new URL(url, "https://dose.wiki");
        const id = requestUrl.searchParams.get("id");
        if (id) {
          const submission = storedSubmissions.find((row) => row.id === id);
          return submission
            ? Response.json({ ok: true, submission })
            : Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({
          ok: true,
          needsReview: storedSubmissions.filter((row) => row.status === "submitted" || row.status === "reviewing"),
          history: storedSubmissions.filter((row) => row.status !== "submitted" && row.status !== "reviewing"),
        });
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

  it("holds every pending row in the Needs review bucket, past the capped queue page", async () => {
    const pending = Array.from({ length: 300 }, (_, index) => ({
      ...submission,
      id: `submission-${index}`,
      title: `Pending report ${index}`,
    }));
    const accepted = { ...acceptedSubmission, id: "accepted-1", title: "Accepted report" };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/dev/trip-reports") {
        return Response.json({ ok: true, reports: [publishedReport], contributors: [] });
      }

      if (url.pathname === "/api/trip-report-submissions/queue") {
        const id = url.searchParams.get("id");
        if (id) {
          const row = [...pending, accepted].find((entry) => entry.id === id);
          return row ? Response.json({ ok: true, submission: row }) : Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({ ok: true, needsReview: pending, history: [accepted] });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    render(<TripReportPortalTab />);

    expect(await screen.findByRole("button", { name: /^Needs review/ })).toHaveTextContent("300");
    // The capped page still contributes what the scoped read does not carry.
    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("302");
    expect(screen.getByRole("button", { name: /^Published/ })).toHaveTextContent("1");
  });

  it("persists the decision note with an accepted submission", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    // The controller paints its cached corpus before fetching. Wait for this
    // fixture rather than querying all 300 cached rows from the preceding case.
    await screen.findByText("2 reports · 2 authors · 2 substances");

    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));

    expect(
      await screen.findByText(
        (_, element) => element?.tagName === "LI" && element.textContent === "LSD · 75 ug, oral",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Decision note"));
    await user.paste("  Sober sitter present.  ");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/trip-report-submissions/submission-1/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "accepted", notes: "Sober sitter present." }),
        }),
      ),
    );
    expect(await screen.findByText("Sober sitter present.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("requires confirmation before removing a submission from the review queue", async () => {
    const user = userEvent.setup();
    render(<TripReportPortalTab />);

    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));
    await user.click(await screen.findByRole("button", { name: "Mark as spam" }));

    const dialog = await screen.findByRole("dialog", { name: "Mark as spam?" });
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/trip-report-submissions/submission-1/status",
      expect.anything(),
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/trip-report-submissions/submission-1/status",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));
    const rejectionDialog = await screen.findByRole("dialog", { name: "Reject this submission?" });
    await user.click(await within(rejectionDialog).findByRole("button", { name: "Reject" }));

    await waitFor(() => {
      const post = vi.mocked(fetch).mock.calls.find(([url]) =>
        String(url) === "/api/trip-report-submissions/submission-1/status",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ status: "rejected" });
      expect(screen.queryByRole("option", { name: /Careful low dose museum walk/ })).not.toBeInTheDocument();
    });
  });

  it("steps between queued rows from the review header without closing", async () => {
    const user = userEvent.setup();
    stubCorpus([
      submission,
      { ...submission, id: "submission-2", title: "Second museum walk", created_at: "2026-06-10T12:00:00.000Z" },
    ]);
    render(<TripReportPortalTab />);

    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));
    expect(await screen.findByText("1 of 2 in list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous in list" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next in list" }));
    expect(await screen.findByRole("heading", { name: "Second museum walk" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2 in list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next in list" })).toBeDisabled();
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
        const requestUrl = new URL(url, "https://dose.wiki");
        return requestUrl.searchParams.has("id")
          ? Response.json({ ok: true, submission: acceptedSubmission })
          : Response.json({ ok: true, needsReview: [], history: [acceptedSubmission] });
      }

      if (url.includes("/promote")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { publish?: boolean };
        return Response.json({
          ok: true,
          published: body.publish === true,
          submission: body.publish ? { ...acceptedSubmission, status: "exported" } : acceptedSubmission,
          payload: promotionPayload,
        });
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
    // The terminal, public-facing write sits behind the confirm dialog.
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish" }));

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
      const call = vi.mocked(fetch).mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/dev/trip-reports/record") &&
          (init as RequestInit | undefined)?.method === "POST",
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

  it("renders an error state instead of an empty list when the queue request fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dev/trip-reports")) {
        return Response.json({ ok: true, reports: [publishedReport], contributors: [] });
      }

      if (url.includes("/queue")) {
        return Response.json({ error: "Trip report submission storage is not configured." }, { status: 503 });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    render(<TripReportPortalTab />);

    expect(await screen.findByText("Submission queue unavailable")).toBeInTheDocument();
    expect(screen.getByText("Trip report submission storage is not configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // The failed Needs review source stays explicitly incomplete rather than
    // masquerading as an empty queue, while the independent published source
    // remains usable.
    expect(screen.getByRole("button", { name: /^Needs review/ })).toHaveTextContent("…");
    expect(screen.queryByText(/No reports/)).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /^Published/ }));
    expect(await screen.findByText("Alpine clarity")).toBeInTheDocument();
  });

  it("invalidates the rail badge after a submission transition", async () => {
    const user = userEvent.setup();
    resetDevRailBadgesForTests();
    const counts = [1, 0];
    const corpusFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/needs-review-count")) {
        return Response.json({ ok: true, count: counts.length > 1 ? counts.shift() : counts[0] });
      }

      if (url.includes("/status")) {
        return Response.json({ ok: true, submission: { ...submission, status: "accepted" } });
      }

      return corpusFetch(input, init);
    });

    function Badge() {
      const count = useDevRailBadges("admin")["trip-reports"];
      return <span data-testid="badge">{count === undefined ? "none" : String(count)}</span>;
    }

    render(
      <>
        <Badge />
        <TripReportPortalTab />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("1"));
    await user.click(await screen.findByRole("option", { name: /Careful low dose museum walk/ }));
    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("none"));
  });
});
