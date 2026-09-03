import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/auth/roles";
import {
  invalidateDevRailBadge,
  resetDevRailBadgesForTests,
  useDevRailBadges,
} from "./useDevRailBadges";

function Badges({ role = "admin" }: { role?: AppRole | null }) {
  const counts = useDevRailBadges(role);
  return (
    <>
      <span data-testid="trip-reports">{counts["trip-reports"] ?? "none"}</span>
      <span data-testid="feedback">{counts.feedback ?? "none"}</span>
    </>
  );
}

type Answer = number | "fail";

/**
 * One answer queue per endpoint; the last answer repeats. Trip reports answer
 * `{ count }`, feedback answers `{ article, site, total }`, and the rail reads
 * the field each endpoint owns.
 */
function stubCounts(answers: { tripReports?: Answer[]; feedback?: Answer[] }) {
  const queues = {
    "/api/dev/trip-reports/needs-review-count": [...(answers.tripReports ?? [0])],
    "/api/feedback/pending-count": [...(answers.feedback ?? [0])],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const queue = queues[url as keyof typeof queues];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === "fail") {
        return Response.json({ error: "down" }, { status: 503 });
      }

      return url === "/api/feedback/pending-count"
        ? Response.json({ ok: true, article: next, site: 0, total: next })
        : Response.json({ ok: true, count: next });
    }),
  );
}

describe("useDevRailBadges", () => {
  beforeEach(() => {
    resetDevRailBadgesForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows each badge's count once its endpoint answers, and hides zero", async () => {
    stubCounts({ tripReports: [3], feedback: [0] });
    render(<Badges />);

    expect(screen.getByTestId("trip-reports")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("3"));
    expect(screen.getByTestId("feedback")).toHaveTextContent("none");
    expect(fetch).toHaveBeenCalledWith("/api/dev/trip-reports/needs-review-count");
    expect(fetch).toHaveBeenCalledWith("/api/feedback/pending-count");
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
    expect(fetch).toHaveBeenCalledTimes(3);
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

  it("does not fetch for a role below the badged tabs' floor", async () => {
    stubCounts({ tripReports: [0] });
    const { rerender } = render(<Badges role="editor" />);
    expect(fetch).not.toHaveBeenCalled();

    rerender(<Badges role="admin" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("none");
  });

  it("keeps the previous count when a refetch fails", async () => {
    stubCounts({ tripReports: [4, "fail"] });
    render(<Badges />);
    await waitFor(() => expect(screen.getByTestId("trip-reports")).toHaveTextContent("4"));

    act(() => {
      invalidateDevRailBadge("trip-reports");
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("trip-reports")).toHaveTextContent("4");
  });
});
