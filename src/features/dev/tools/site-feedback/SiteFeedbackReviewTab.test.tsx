import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteFeedbackReviewTab } from "./SiteFeedbackReviewTab";

const technicalRow = {
  id: "feedback-1",
  status: "new",
  schema_version: 1,
  category: "technical",
  urgency: "high",
  details: "The search box throws on every keystroke.",
  page: "https://dose.wiki/lsd",
  email: "reader@example.com",
  honeypot_triggered: false,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const spamRow = {
  id: "feedback-2",
  status: "spam",
  schema_version: 1,
  category: "misc",
  details: "Buy cheap watches.",
  honeypot_triggered: true,
  created_at: "2026-08-02T12:00:00.000Z",
  updated_at: "2026-08-02T12:00:00.000Z",
};

function stubQueue(rows: Array<{ status: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/status") && init?.method === "POST") {
        return Response.json({ ok: true, feedback: { ...technicalRow, status: "resolved" } });
      }

      if (url.includes("/api/site-feedback/queue")) {
        const status = new URL(url, "https://dose.wiki").searchParams.get("status");
        return Response.json({
          ok: true,
          feedback: status ? rows.filter((row) => row.status === status) : rows,
        });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

// Radix Select drives its listbox through pointer-capture APIs jsdom lacks.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  stubQueue([technicalRow, spamRow]);
});

describe("SiteFeedbackReviewTab", () => {
  it("lists the queue with category and urgency and opens the first row", async () => {
    render(<SiteFeedbackReviewTab />);

    // Queue row: category headline plus the urgency line for bug-like rows.
    expect(await screen.findAllByText("Website technical issue")).not.toHaveLength(0);
    expect(screen.getAllByText("High — degrades the site")).not.toHaveLength(0);
    expect(screen.getByText("Miscellaneous")).toBeInTheDocument();

    // The first row is auto-selected; its details render in queue row + review pane.
    expect(screen.getAllByText("The search box throws on every keystroke.")).toHaveLength(2);
    expect(screen.getByText("reader@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://dose.wiki/lsd" })).toBeInTheDocument();
  });

  it("posts a valid status transition for the selected row", async () => {
    const user = userEvent.setup();
    render(<SiteFeedbackReviewTab />);

    await screen.findAllByText("Website technical issue");
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/site-feedback/feedback-1/status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            status: "resolved",
            notes: "Resolved — issue addressed or no change needed.",
          }),
        }),
      ),
    );
  });

  it("disables transitions the status machine forbids", async () => {
    const user = userEvent.setup();
    render(<SiteFeedbackReviewTab />);

    // Select the spam row: from `spam` only `reviewing` is reachable.
    await user.click(await screen.findByText("Miscellaneous"));

    expect(screen.getByRole("button", { name: "Reviewing" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Spam" })).toBeDisabled();
  });

  it("refetches the queue with the spam filter", async () => {
    const user = userEvent.setup();
    render(<SiteFeedbackReviewTab />);

    await screen.findAllByText("Website technical issue");
    await user.click(screen.getByRole("combobox", { name: "Queue filter" }));
    await user.click(await screen.findByRole("option", { name: "Spam" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/site-feedback/queue?status=spam"),
    );
    expect(await screen.findAllByText("Miscellaneous")).not.toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByText("Website technical issue")).not.toBeInTheDocument(),
    );
  });
});
