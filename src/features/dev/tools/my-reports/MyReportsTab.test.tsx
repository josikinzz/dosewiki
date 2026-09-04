import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MyReportsTab } from "./MyReportsTab";
import type { OwnedReportRecord, OwnedReportRow } from "./myReportsModel";

const fields: OwnedReportRecord["fields"] = {
  title: "Alpine clarity",
  subject: { name: "nervewing" },
  substances: [{ name: "Psilocybin" }],
  introduction: "Cold air.",
  onset: [{ time: "T+0:30", description: "Cold air sharpens." }],
  peak: [],
  offset: [],
  tags: ["outdoors"],
};

const ROWS: OwnedReportRow[] = [
  { id: "r1", slug: "alpine-clarity", title: "Alpine clarity", tripDate: "2026-02-01", createdAt: Date.UTC(2026, 2, 1) },
  { id: "r2", slug: "quiet-river", title: "Quiet river", createdAt: Date.UTC(2026, 3, 1) },
];

type Call = { path: string; body: Record<string, unknown> | null };

/** Serves the owned list and one record; records every save POST and answers it. */
function stubReportsApi(rows: OwnedReportRow[], saveStatus = 200) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dev.dose.wiki");
    if (url.pathname === "/api/dev/trip-reports/mine") {
      return Response.json({ ok: true, reports: rows });
    }
    if (url.pathname === "/api/dev/trip-reports/record" && !init) {
      return Response.json({
        ok: true,
        report: { id: url.searchParams.get("id"), slug: "alpine-clarity", fields },
      });
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path: url.pathname, body });
    if (url.pathname.endsWith("/owner")) {
      return Response.json({ ok: true, slug: "alpine-clarity", ownerEmail: String(body?.email).toLowerCase() });
    }
    if (saveStatus !== 200) {
      return Response.json({ error: "You do not own trip report alpine-clarity.", code: "NOT_OWNER" }, { status: saveStatus });
    }
    return Response.json({ ok: true, slug: "alpine-clarity" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("MyReportsTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the owned reports newest first with title, address and dates", async () => {
    stubReportsApi(ROWS);
    render(<MyReportsTab />);

    await screen.findByText("Alpine clarity");

    const slugs = [...document.querySelectorAll("tr[data-report]")].map((row) => row.getAttribute("data-report"));
    expect(slugs).toEqual(["quiet-river", "alpine-clarity"]);
    expect(screen.getByRole("link", { name: "/reports/alpine-clarity" })).toHaveAttribute("href", "/reports/alpine-clarity");
    expect(screen.getByText("2026-02-01")).toBeTruthy();
    expect(screen.getByText("2026-03-01")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    // Each row is also the phone card: labelled fields and the edit action
    // live inside it, since the header row is hidden below the tablet step.
    const row = document.querySelector('tr[data-report="alpine-clarity"]');
    if (!(row instanceof HTMLTableRowElement)) {
      throw new Error("no row for alpine-clarity");
    }
    const card = within(row);
    expect(card.getByRole("cell", { name: /^Address\s*\/reports\/alpine-clarity$/ })).toBeTruthy();
    expect(card.getByRole("cell", { name: /^Trip date\s*2026-02-01$/ })).toBeTruthy();
    expect(card.getByRole("cell", { name: /^Published\s*2026-03-01$/ })).toBeTruthy();
    expect(card.getByRole("button", { name: "Edit" })).toBeEnabled();
  });

  it("shows the empty state when nothing is owned", async () => {
    stubReportsApi([]);
    render(<MyReportsTab />);

    await screen.findByText("No reports yet");
  });

  it("opens a report, edits the title and saves it through the record route with the opened snapshot", async () => {
    const { calls } = stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[1]);
    const title = await screen.findByLabelText("Title");
    expect(title).toHaveValue("Alpine clarity");
    expect(screen.getByRole("button", { name: "Save report" })).toBeDisabled();

    await user.clear(title);
    await user.type(title, "Alpine clarity, revisited");
    await user.click(screen.getByRole("button", { name: "Save report" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe("/api/dev/trip-reports/record");
    expect(calls[0].body).toMatchObject({
      mode: "save",
      id: "r1",
      expected: { title: "Alpine clarity" },
      updates: { title: "Alpine clarity, revisited", tags: ["outdoors"] },
    });
    await screen.findByText("Saved /reports/alpine-clarity.");
  });

  it("surfaces a refused save without closing the editor", async () => {
    stubReportsApi(ROWS, 403);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[1]);
    const title = await screen.findByLabelText("Title");
    await user.type(title, "!");
    await user.click(screen.getByRole("button", { name: "Save report" }));

    await screen.findByText("You do not own trip report alpine-clarity.");
    expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity!");
  });

  it("offers the assign-owner form to admins only and posts to the owner route", async () => {
    const { calls } = stubReportsApi(ROWS);
    const user = userEvent.setup();
    const { unmount } = render(<MyReportsTab />);
    await screen.findByText("Alpine clarity");
    expect(screen.queryByText("Assign an owner")).toBeNull();
    unmount();

    render(<MyReportsTab canApprove />);
    await screen.findByText("Assign an owner");
    expect(screen.getByRole("button", { name: "Assign owner" })).toBeDisabled();

    await user.type(screen.getByLabelText("Report slug"), "alpine-clarity");
    await user.type(screen.getByLabelText("Member email"), "Owner@Example.com");
    await user.click(screen.getByRole("button", { name: "Assign owner" }));

    await screen.findByText("/reports/alpine-clarity now belongs to owner@example.com.");
    expect(calls).toEqual([
      { path: "/api/dev/trip-reports/alpine-clarity/owner", body: { email: "Owner@Example.com" } },
    ]);
  });
});
