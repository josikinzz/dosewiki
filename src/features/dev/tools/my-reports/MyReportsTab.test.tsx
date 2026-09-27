import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
import { MyReportsTab } from "./MyReportsTab";
import type { MemberSubmission, OwnedReportRecord, OwnedReportRow } from "./myReportsModel";
import { OWNERSHIP_RULE } from "./ownershipCopy";

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
function stubReportsApi(
  rows: OwnedReportRow[],
  saveStatus = 200,
  submissions: MemberSubmission[] = [],
  options: { saveError?: string; recordStatus?: number } = {},
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dev.dose.wiki");
    if (url.pathname === "/api/dev/trip-reports/mine") {
      return Response.json({ ok: true, reports: rows });
    }
    if (url.pathname === "/api/dev/trip-reports/mine/submissions") {
      return Response.json({ ok: true, submissions });
    }
    if (url.pathname === "/api/dev/trip-reports/record" && !init) {
      if (options.recordStatus) {
        return Response.json({ error: "That trip report no longer exists." }, { status: options.recordStatus });
      }
      return Response.json({
        ok: true,
        report: { id: url.searchParams.get("id"), slug: "alpine-clarity", fields, revision: "0".repeat(64) },
      });
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path: url.pathname, body });
    if (url.pathname.endsWith("/owner")) {
      return Response.json({ ok: true, slug: "alpine-clarity", ownerEmail: String(body?.email).toLowerCase() });
    }
    if (saveStatus !== 200) {
      return Response.json(
        { error: options.saveError ?? "You do not own trip report alpine-clarity.", code: "NOT_OWNER" },
        { status: saveStatus },
      );
    }
    return Response.json({
      ok: true,
      slug: "alpine-clarity",
      fields: { ...fields, ...(body?.updates as Partial<OwnedReportRecord["fields"]> ?? {}) },
      revision: "1".repeat(64),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** The row control that opens a report; its name starts with the report's title. */
function rowButton(title: string) {
  return screen.findByRole("button", { name: new RegExp(`^${title}`) });
}

describe("MyReportsTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the owned reports newest first with title, address and dates", async () => {
    stubReportsApi(ROWS);
    render(<MyReportsTab />);

    await screen.findByText("Alpine clarity");

    const slugs = [...document.querySelectorAll("li[data-report]")].map((row) => row.getAttribute("data-report"));
    expect(slugs).toEqual(["quiet-river", "alpine-clarity"]);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    // Each row is one control naming the report, its address, trip date and publication.
    const row = await rowButton("Alpine clarity");
    expect(row).toHaveTextContent("/reports/alpine-clarity");
    expect(row).toHaveTextContent("Trip Feb 1, 2026");
    const published = row.querySelector("time");
    expect(published).toHaveAttribute("datetime", new Date(Date.UTC(2026, 2, 1)).toISOString());
    expect(row).toBeEnabled();
    expect(await rowButton("Quiet river")).toHaveTextContent("No trip date");

    // Opening a report puts its live address in the pane header.
    await userEvent.setup().click(row);
    expect(await screen.findByRole("link", { name: /View live/ })).toHaveAttribute("href", "/reports/alpine-clarity");
    expect(row).toHaveAttribute("aria-current", "true");
  });

  it("shows the empty state when nothing is owned, stating who grants ownership", async () => {
    stubReportsApi([]);
    render(<MyReportsTab />);

    await screen.findByText("No reports yet");
    expect(screen.getByText((text) => text.includes(OWNERSHIP_RULE))).toBeTruthy();
    expect(screen.queryByText(/becomes yours when it is published/)).toBeNull();
  });

  it("lists the member's submissions with status, and the public reason on a rejected one", async () => {
    stubReportsApi([], 200, [
      {
        id: "sub-2",
        title: "Quiet river",
        status: "published",
        submitted_at: "2026-04-01T00:00:00.000Z",
        report_slug: "quiet-river",
      },
      {
        id: "sub-1",
        title: "Museum walk",
        status: "rejected",
        submitted_at: "2026-03-01T00:00:00.000Z",
        decided_at: "2026-03-02T00:00:00.000Z",
        public_reason: "The dose for the second substance is missing.",
      },
      { id: "sub-3", title: "Night drive", status: "new", submitted_at: "2026-05-01T00:00:00.000Z" },
    ]);
    render(<MyReportsTab />);

    await screen.findByRole("heading", { name: "Submissions" });
    const rejected = await waitFor(() => {
      const row = document.querySelector('[data-submission="sub-1"]');
      if (!(row instanceof HTMLElement)) throw new Error("no row for sub-1");
      return within(row);
    });
    expect(rejected.getByText("Museum walk")).toBeTruthy();
    expect(rejected.getByText("Rejected")).toBeTruthy();
    expect(rejected.getByText("The dose for the second substance is missing.")).toBeTruthy();

    const published = within(document.querySelector('[data-submission="sub-2"]') as HTMLElement);
    expect(published.getByText("Published")).toBeTruthy();
    expect(published.getByRole("link", { name: "/reports/quiet-river" })).toHaveAttribute("href", "/reports/quiet-river");

    const waiting = within(document.querySelector('[data-submission="sub-3"]') as HTMLElement);
    expect(waiting.getByText("New")).toBeTruthy();
    expect(waiting.getByText("Waiting on a reviewer.")).toBeTruthy();

    // Newest first, and the tally a member scans for.
    const order = [...document.querySelectorAll("[data-submission]")].map((row) => row.getAttribute("data-submission"));
    expect(order).toEqual(["sub-3", "sub-2", "sub-1"]);
    expect(screen.getByText("1 in review, 1 live, 1 turned down")).toBeTruthy();
  });

  it("opens a report, edits the title and saves it through the record route after the publish confirm", async () => {
    const { calls } = stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    const title = await screen.findByLabelText("Title");
    expect(title).toHaveValue("Alpine clarity");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /View live/ })).toHaveAttribute("href", "/reports/alpine-clarity");

    await user.clear(title);
    await user.type(title, "Alpine clarity, revisited");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Nothing is written until the publish confirm is accepted, and it names what changed.
    const confirmDialog = await screen.findByRole("dialog", { name: "Publish to /reports/alpine-clarity?" });
    expect(confirmDialog).toHaveTextContent("You changed the title.");
    expect(calls).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save and publish" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe("/api/dev/trip-reports/record");
    expect(calls[0].body).toMatchObject({
      mode: "save",
      id: "r1",
      expected: { title: "Alpine clarity" },
      updates: { title: "Alpine clarity, revisited", tags: ["outdoors"] },
    });
    // The result lands in the save dock, beside Save.
    const dock = screen.getByRole("contentinfo", { name: "Save" });
    await within(dock).findByText(/^Saved \/reports\/alpine-clarity\./);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancelling the publish confirm writes nothing and keeps the draft", async () => {
    const { calls } = stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    await user.type(await screen.findByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toHaveLength(0);
    expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity!");
  });

  it("surfaces a refused save without closing the editor", async () => {
    stubReportsApi(ROWS, 403);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    const title = await screen.findByLabelText("Title");
    await user.type(title, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Save and publish" }));

    await within(screen.getByRole("contentinfo", { name: "Save" })).findByText("You do not own trip report alpine-clarity.");
    expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity!");
  });

  it("guards Close and other rows' Edit while the draft is dirty", async () => {
    stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    await user.type(await screen.findByLabelText("Title"), "!");

    // Close asks first; keeping the draft leaves the editor and its text alone.
    await user.click(screen.getByRole("button", { name: "Close editor" }));
    await screen.findByRole("dialog", { name: "Discard your edits?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity!");

    // Opening another row asks the same question; discarding proceeds to it.
    await user.click(await rowButton("Quiet river"));
    await screen.findByRole("dialog", { name: "Discard your edits?" });
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity"));

    // A clean editor closes without a prompt.
    await user.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("reports a dirty draft to the shell, which only discards it on a rail click", async () => {
    stubReportsApi(ROWS);
    const add = vi.spyOn(window, "addEventListener");
    const user = userEvent.setup();
    const { nav, onTabChange } = renderInDevShell(<MyReportsTab />, { tab: "my-reports" });

    await user.click(await rowButton("Alpine clarity"));
    await user.type(await screen.findByLabelText("Title"), "!");

    expectRailMarksUnsaved(nav, "My reports");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("My reports: edits to /reports/alpine-clarity")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity"));
    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
    add.mockRestore();
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

    // A pasted page address resolves to its slug.
    await user.type(screen.getByLabelText("Report slug"), "https://dose.wiki/reports/alpine-clarity");
    await user.type(screen.getByLabelText("Member email"), "Owner@Example.com");
    await user.click(screen.getByRole("button", { name: "Assign owner" }));

    // Handing over edit rights asks first; nothing is posted before the confirm.
    const dialog = await screen.findByRole("dialog", { name: "Give edit rights to this member?" });
    expect(calls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Assign owner" }));

    await screen.findByText("/reports/alpine-clarity now belongs to owner@example.com, who can edit it from My reports.");
    expect(calls).toEqual([
      { path: "/api/dev/trip-reports/alpine-clarity/owner", body: { email: "Owner@Example.com" } },
    ]);
  });

  it("offers the latest version after a revision conflict, and loads it only after a confirm", async () => {
    const { fetchMock } = stubReportsApi(ROWS, 409, [], {
      saveError: "Trip report alpine-clarity changed since it was opened. Reload it and apply your edits again.",
    });
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    await user.type(await screen.findByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Save and publish" }));

    const dock = screen.getByRole("contentinfo", { name: "Save" });
    await within(dock).findByText("Someone saved this report after you opened it.");
    const reads = () => fetchMock.mock.calls.filter(([input, init]) => String(input).includes("/record") && !init).length;
    const before = reads();
    await user.click(within(dock).getByRole("button", { name: "Load the latest version" }));
    const dialog = await screen.findByRole("dialog", { name: "Load the latest version?" });
    expect(reads()).toBe(before);
    await user.click(within(dialog).getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Alpine clarity"));
    expect(reads()).toBe(before + 1);
    await within(dock).findByText(/Loaded the latest version/);
  });

  it("asks to publish on Cmd+S only when there is something to save", async () => {
    const { calls } = stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    const title = await screen.findByLabelText("Title");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.type(title, "!");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Publish to /reports/alpine-clarity?" });
    expect(calls).toHaveLength(0);
  });

  it("skips a tag the report already has", async () => {
    stubReportsApi(ROWS);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    const input = await screen.findByLabelText("Add tag");
    await user.type(input, "Outdoors{Enter}");
    expect(screen.getAllByRole("button", { name: /^Remove tag/ })).toHaveLength(1);
    await user.type(input, "night{Enter}");
    expect(screen.getByRole("button", { name: "Remove tag night" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("names the report that could not be opened", async () => {
    stubReportsApi(ROWS, 200, [], { recordStatus: 404 });
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await user.click(await rowButton("Alpine clarity"));
    await screen.findByText("Could not open Alpine clarity. That trip report no longer exists.");
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("opens the editor from a published submission the member owns", async () => {
    stubReportsApi(ROWS, 200, [
      { id: "sub-1", title: "Alpine clarity", status: "published", submitted_at: "2026-01-01T00:00:00.000Z", report_slug: "alpine-clarity" },
      { id: "sub-2", title: "Someone else's", status: "published", submitted_at: "2026-01-02T00:00:00.000Z", report_slug: "not-mine" },
    ]);
    const user = userEvent.setup();
    render(<MyReportsTab />);

    await screen.findByText("Someone else's");
    expect(screen.getAllByRole("button", { name: "Edit your report" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Edit your report" }));
    expect(await screen.findByLabelText("Title")).toHaveValue("Alpine clarity");
  });
});
