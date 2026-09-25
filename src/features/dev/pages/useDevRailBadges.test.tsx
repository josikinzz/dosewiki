/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/auth/roles";
import userEvent from "@testing-library/user-event";

import { DevRailBadgeFreshness } from "./DevRailBadgeFreshness";
import {
  invalidateDevRailBadge,
  resetDevRailBadgesForTests,
  useDevRailBadges,
} from "./useDevRailBadges";

function Badges({ role = "admin", email }: { role?: AppRole | null; email?: string }) {
  const counts = useDevRailBadges(role, email);
  return (
    <>
      <span data-testid="trip-reports">{counts["trip-reports"] ?? "none"}</span>
      <span data-testid="feedback">{counts.feedback ?? "none"}</span>
      <span data-testid="proposals">{counts.proposals ?? "none"}</span>
      <span data-testid="citations">{counts.citations ?? "none"}</span>
      <span data-testid="glossary-feedback">{counts["glossary-feedback"] ?? "none"}</span>
    </>
  );
}

type Answer = number | "fail";

/**
 * One answer queue per endpoint; the last answer repeats. Trip reports and
 * citations answer `{ count }`, feedback answers `{ article, site, total }`,
 * glossary feedback answers `{ total }`, proposals answer `{ submitted }`, and
 * the rail reads the field each endpoint owns.
 */
function stubCounts(answers: {
  tripReports?: Answer[];
  feedback?: Answer[];
  proposals?: Answer[];
  citations?: Answer[];
  glossary?: Answer[];
}) {
  const queues = {
    "/api/dev/trip-reports/needs-review-count": [...(answers.tripReports ?? [0])],
    "/api/feedback/pending-count": [...(answers.feedback ?? [0])],
    "/api/dev/proposals/count": [...(answers.proposals ?? [0])],
    "/api/citation-evidence/open-count": [...(answers.citations ?? [0])],
    "/api/glossary-feedback/pending-count": [...(answers.glossary ?? [0])],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const queue = queues[url as keyof typeof queues];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === "fail") {
        return Response.json({ error: "down" }, { status: 503 });
      }

      if (url === "/api/feedback/pending-count") {
        return Response.json({ ok: true, article: next, site: 0, total: next });
      }
      if (url === "/api/dev/proposals/count") {
        return Response.json({ ok: true, submitted: next });
      }
      if (url === "/api/glossary-feedback/pending-count") {
        return Response.json({ ok: true, total: next });
      }
      return Response.json({ ok: true, count: next });
    }),
  );
}

describe("useDevRailBadges", () => {
  beforeEach(() => {
    resetDevRailBadgesForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows each badge's count once its endpoint answers, and hides zero", async () => {
    stubCounts({ tripReports: [3], feedback: [0], proposals: [2] });
    render(<Badges />);

    expect(screen.getByTestId("trip-reports")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("3"));
    await waitFor(() => expect(screen.getByTestId("proposals")).toHaveTextContent("2"));
    expect(screen.getByTestId("feedback")).toHaveTextContent("none");
    expect(fetch).toHaveBeenCalledWith("/api/dev/trip-reports/needs-review-count");
    expect(fetch).toHaveBeenCalledWith("/api/feedback/pending-count");
    expect(fetch).toHaveBeenCalledWith("/api/dev/proposals/count");
  });

  it("sums the feedback sources through the endpoint's total", async () => {
    stubCounts({ feedback: [7] });
    render(<Badges />);

    await waitFor(() => expect(screen.getByTestId("feedback")).toHaveTextContent("7"));
  });

  it("counts open citation articles and pending glossary feedback", async () => {
    stubCounts({ citations: [6], glossary: [2] });
    render(<Badges />);

    await waitFor(() => expect(screen.getByTestId("citations")).toHaveTextContent("6"));
    await waitFor(() => expect(screen.getByTestId("glossary-feedback")).toHaveTextContent("2"));
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/open-count");
    expect(fetch).toHaveBeenCalledWith("/api/glossary-feedback/pending-count");
  });

  it("asks a translator only for the glossary feedback count", async () => {
    stubCounts({ glossary: [3] });
    render(<Badges role="translator" />);

    await waitFor(() => expect(screen.getByTestId("glossary-feedback")).toHaveTextContent("3"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches only the invalidated badge after a transition", async () => {
    stubCounts({ tripReports: [3, 2], feedback: [5, 4] });
    render(<Badges />);
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("3"));
    await waitFor(() => expect(screen.getByTestId("feedback")).toHaveTextContent("5"));

    act(() => {
      invalidateDevRailBadge("feedback");
    });

    await waitFor(() => expect(screen.getByTestId("feedback")).toHaveTextContent("4"));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("3");
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("keeps the last counts across a remount and still refetches", async () => {
    stubCounts({ tripReports: [3, 1] });
    const first = render(<Badges />);
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("3"));
    first.unmount();

    render(<Badges />);
    // Painted from the store immediately, no blink back to nothing.
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("3");
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("1"));
  });

  it("asks only for the badges whose tab floor the role meets", async () => {
    stubCounts({ tripReports: [0], proposals: [1] });
    const { rerender } = render(<Badges role="contributor" />);
    expect(fetch).not.toHaveBeenCalled();

    // The queue is an editor tab: an editor asks for that count and no admin count.
    rerender(<Badges role="editor" />);
    await waitFor(() => expect(screen.getByTestId("proposals")).toHaveTextContent("1"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/dev/proposals/count");

    rerender(<Badges role="admin" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("none");
  });

  it("keeps the previous count when a refetch fails", async () => {
    stubCounts({ tripReports: [4, "fail"] });
    render(<Badges />);
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("4"));

    act(() => {
      invalidateDevRailBadge("trip-reports");
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("4");
  });

  it("refreshes proposals from another session when the window regains focus", async () => {
    stubCounts({ proposals: [0, 2] });
    render(<Badges />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByTestId("proposals")).toHaveTextContent("2"));
  });

  it("hides another account's cached counts and refetches for the new actor", async () => {
    stubCounts({ proposals: [3, 1] });
    const { rerender } = render(<Badges role="editor" email="ada@example.com" />);
    await waitFor(() => expect(screen.getByTestId("proposals")).toHaveTextContent("3"));
    rerender(<Badges role="editor" email="ben@example.com" />);
    expect(screen.getByTestId("proposals")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("proposals")).toHaveTextContent("1"));
    rerender(<Badges role={null} />);
    expect(screen.getByTestId("proposals")).toHaveTextContent("none");
  });

  it("updates while visible without polling a hidden tab", async () => {
    vi.useFakeTimers();
    stubCounts({ proposals: [1, 2, 3] });
    await act(async () => { render(<Badges role="editor" />); });
    expect(screen.getByTestId("proposals")).toHaveTextContent("1");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByTestId("proposals")).toHaveTextContent("2");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(screen.getByTestId("proposals")).toHaveTextContent("2");
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
    }
  });

  describe("freshness", () => {
    function Queue() {
      const counts = useDevRailBadges("admin");
      return (
        <>
          <span data-testid="badge">{counts["trip-reports"] ?? "none"}</span>
          <DevRailBadgeFreshness badge="trip-reports" noun="reports" />
        </>
      );
    }

    it("keeps 12 as the last known count when a refresh fails, and clears the stale line on success", async () => {
      const user = userEvent.setup();
      stubCounts({ tripReports: [12, "fail", 9] });
      render(<Queue />);
      await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("12"));
      // A healthy count says nothing in the queue.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      act(() => {
        invalidateDevRailBadge("trip-reports");
      });

      const line = await screen.findByRole("status");
      expect(line).toHaveTextContent(/12 reports is the last known count/);
      // Never replaced by zero, and the rail badge is not turned into an alert.
      expect(screen.getByTestId("badge")).toHaveTextContent("12");

      await user.click(screen.getByRole("button", { name: "Retry" }));

      await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("9"));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("says the count is unknown, not zero, when the first load fails", async () => {
      stubCounts({ tripReports: ["fail"] });
      render(<Queue />);

      const line = await screen.findByRole("status");
      expect(line).toHaveTextContent("The count of waiting reports could not load.");
      expect(screen.getByTestId("badge")).toHaveTextContent("none");
    });

    it("treats a malformed answer as a failed refresh", async () => {
      stubCounts({ tripReports: [4] });
      render(<Queue />);
      await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("4"));
      vi.mocked(fetch).mockImplementation(async () => Response.json({ ok: true }));

      act(() => {
        invalidateDevRailBadge("trip-reports");
      });

      expect(await screen.findByRole("status")).toHaveTextContent(/4 reports is the last known count/);
    });
  });
});
