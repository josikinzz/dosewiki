/**
 * Saved views: the count the Cmd+K palette shows for a view equals the rows
 * the view's queue lists, because both come from the same server read.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDevRailBadgesForTests } from "@/features/dev/pages/useDevRailBadges";
import { FeedbackTab } from "@/features/dev/tools/feedback/FeedbackTab";
import { QueueTab } from "@/features/dev/tools/queue/QueueTab";
import type { ProposalSummary } from "@/features/dev/tools/queue/queueModel";
import { queueResponse } from "@/test/feedbackQueueServer";

import { clearDevRecordSourceCache, devRecordSourcesFor } from "./devRecordSources";
import type { PaletteRecord } from "./devCommandPaletteModel";

const feedback = (id: string, status: string, day: number) => ({
  id,
  status,
  schema_version: 1,
  substance_slug: id,
  substance_title: `Substance ${id}`,
  category: "inaccurate",
  importance: "normal",
  details: "Details",
  honeypot_triggered: false,
  created_at: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  updated_at: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
});

const feedbackRows = [
  feedback("a", "new", 1),
  feedback("b", "reviewing", 2),
  feedback("c", "resolved", 3),
  feedback("d", "new", 4),
  feedback("e", "spam", 5),
  feedback("f", "reviewing", 6),
];

const proposal = (id: string, isAuthor: boolean, status: ProposalSummary["status"]): ProposalSummary => ({
  _id: id,
  proposerName: "Ada",
  isAuthor,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  status,
  targets: [{ kind: "article", key: id, baseHash: "h" }],
  summary: `Proposal ${id}`,
  commentCount: 0,
});

const proposals = [
  proposal("p1", true, "submitted"),
  proposal("p2", true, "changes_requested"),
  proposal("p3", true, "applied"),
  proposal("p4", false, "submitted"),
  proposal("p5", true, "submitted"),
];

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  clearDevRecordSourceCache();
  resetDevRailBadgesForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/article-feedback/queue") return queueResponse(input, feedbackRows);
      if (url.pathname === "/api/site-feedback/queue") return queueResponse(input, []);
      if (url.pathname === "/api/dev/proposals") return Response.json({ ok: true, proposals });
      if (url.pathname === "/api/dev/review-recommendations") return Response.json({ ok: true, recommendations: [] });
      return Response.json({ ok: true, article: 0, site: 0, total: 0 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function viewsFor(tab: "article-feedback" | "queue"): Promise<PaletteRecord[]> {
  const [source] = devRecordSourcesFor(new Set([tab]));
  return source.load({ role: "admin" });
}

const countIn = (view: PaletteRecord) => Number(/^(\d+) /.exec(view.detail ?? "")?.[1]);

describe("saved view counts", () => {
  it("Oldest unresolved counts exactly the rows its queue lists, oldest first", async () => {
    const view = (await viewsFor("article-feedback")).find((entry) => entry.key.includes("article"))!;
    const count = countIn(view);
    expect(count).toBe(4);

    window.history.replaceState(null, "", view.href);
    render(<FeedbackTab initialSource="article" />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    const rows = within(list).getAllByRole("option");
    expect(rows).toHaveLength(count);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Substance a"),
      expect.stringContaining("Substance b"),
      expect.stringContaining("Substance d"),
      expect.stringContaining("Substance f"),
    ]);
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent(`Unresolved (${count})`);
  });

  it("My pending proposals counts exactly the rows the view lists", async () => {
    const [view] = await viewsFor("queue");
    const count = countIn(view);
    expect(count).toBe(3);

    window.history.replaceState(null, "", view.href);
    render(<QueueTab canApprove onLoadIntoEditor={vi.fn(async () => undefined)} />);

    await screen.findByRole("button", { name: `My pending ${count}` });
    const listed = ["submitted", "changes_requested", "applied", "closed"].flatMap((id) =>
      screen.queryByTestId(`queue-group-${id}`) ? within(screen.getByTestId(`queue-group-${id}`)).getAllByRole("button") : [],
    );
    expect(listed).toHaveLength(count);
  });
});
