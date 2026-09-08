/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/auth/roles";
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
    </>
  );
}

type Answer = number | "fail";

/**
 * One answer queue per endpoint; the last answer repeats. Trip reports answer
 * `{ count }`, feedback answers `{ article, site, total }`, proposals answer
 * `{ submitted }`, and the rail reads the field each endpoint owns.
 */
function stubCounts(answers: { tripReports?: Answer[]; feedback?: Answer[]; proposals?: Answer[] }) {
  const queues = {
    "/api/dev/trip-reports/needs-review-count": [...(answers.tripReports ?? [0])],
    "/api/feedback/pending-count": [...(answers.feedback ?? [0])],
    "/api/dev/proposals/count": [...(answers.proposals ?? [0])],
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
    expect(fetch).toHaveBeenCalledTimes(4);
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
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("none");
  });

  it("keeps the previous count when a refetch fails", async () => {
    stubCounts({ tripReports: [4, "fail"] });
    render(<Badges />);
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("4"));

    act(() => {
      invalidateDevRailBadge("trip-reports");
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("4");
  });

  it("refreshes proposals from another session when the window regains focus", async () => {
    stubCounts({ proposals: [0, 2] });
    render(<Badges />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
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
});
