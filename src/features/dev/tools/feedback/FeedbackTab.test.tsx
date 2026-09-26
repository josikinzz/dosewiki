import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDevRailBadgesForTests, useDevRailBadges } from "@/features/dev/pages/useDevRailBadges";

import { queueResponse } from "@/test/feedbackQueueServer";

import { FeedbackTab } from "./FeedbackTab";

const articleRow = {
  id: "article-1",
  status: "new",
  schema_version: 1,
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "high",
  details: "The oral duration looks off.",
  honeypot_triggered: false,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

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

/**
 * Both queues plus the rail's count endpoint. The pending total answers from
 * `pendingTotals` in order and repeats the last value.
 */
function stubFeedback(pendingTotals: number[] = [0]) {
  const totals = [...pendingTotals];
  const siteRows = [technicalRow, spamRow];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/feedback/pending-count") {
        const total = totals.length > 1 ? totals.shift() : totals[0];
        return Response.json({ ok: true, article: total, site: 0, total });
      }

      if (url.pathname.endsWith("/status") && init?.method === "POST") {
        return Response.json({ ok: true, feedback: { ...technicalRow, status: "resolved" } });
      }

      if (url.pathname === "/api/article-feedback/queue") {
        return queueResponse(input, [articleRow]);
      }

      if (url.pathname === "/api/site-feedback/queue") {
        return queueResponse(input, siteRows);
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
  window.history.replaceState(null, "", "/dev/article-feedback");
  resetDevRailBadgesForTests();
  stubFeedback();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FeedbackTab", () => {
  it("opens on article feedback and switches to the site queue through the source filter, keeping the filter in the URL", async () => {
    const user = userEvent.setup();
    render(<FeedbackTab />);

    expect((await screen.findAllByText("Mescaline")).length).toBeGreaterThan(0);
    const filter = screen.getByRole("group", { name: "Feedback source" });
    expect(screen.getByRole("button", { name: "Article" })).toHaveAttribute("aria-pressed", "true");
    expect(filter).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Site" }));

    expect((await screen.findAllByText("Website technical issue")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Mescaline")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.pathname + window.location.search).toBe("/dev/article-feedback?source=site");

    await user.click(screen.getByRole("button", { name: "Article" }));

    expect((await screen.findAllByText("Mescaline")).length).toBeGreaterThan(0);
    expect(window.location.search).toBe("?source=article");
  });

  it("presets the site queue from the route filter, as /dev/site-feedback resolves to", async () => {
    render(<FeedbackTab initialSource="site" />);

    expect((await screen.findAllByText("Website technical issue")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Site" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/article-feedback/queue"));
  });

  it("falls back to article feedback for a filter value the tab does not know", async () => {
    render(<FeedbackTab initialSource="nonsense" />);

    expect((await screen.findAllByText("Mescaline")).length).toBeGreaterThan(0);
  });

  it("offers only the transitions the status machine allows", async () => {
    const user = userEvent.setup();
    render(<FeedbackTab initialSource="site" />);

    // The queue opens on New; the spam row lives under Spam, from where only `reviewing` is reachable.
    await screen.findAllByText("Website technical issue");
    await user.click(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: /^Spam/ }));
    expect(await screen.findByRole("heading", { level: 3, name: "Miscellaneous" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as spam" })).not.toBeInTheDocument();
  });

  it("keeps the chosen status across sources and in the URL, and asks the site queue for that status", async () => {
    const user = userEvent.setup();
    render(<FeedbackTab />);

    await screen.findAllByText("Mescaline");
    await user.click(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "Spam, 0" }));

    expect(window.location.search).toBe("?source=article&status=spam");
    expect(await screen.findByText(/^No spam article feedback\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Site" }));

    expect(await screen.findAllByText("Miscellaneous")).not.toHaveLength(0);
    expect(screen.queryByText("Website technical issue")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Spam, 1" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?source=site&status=spam");
    // The status filter runs on the server, so every spam row is reachable, not only a recent window.
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/site-feedback/queue?status=spam&"), expect.anything());
  });

  it("reads the status filter from the address on load", async () => {
    window.history.replaceState(null, "", "/dev/article-feedback?source=site&status=spam");
    render(<FeedbackTab initialSource="site" />);

    expect(await screen.findAllByText("Miscellaneous")).not.toHaveLength(0);
    expect(screen.queryByText("Website technical issue")).not.toBeInTheDocument();
  });

  it("invalidates the rail badge after a transition", async () => {
    const user = userEvent.setup();
    stubFeedback([1, 0]);

    function Badge() {
      const count = useDevRailBadges("admin").feedback;
      return <span data-testid="badge">{count === undefined ? "none" : String(count)}</span>;
    }

    render(
      <>
        <Badge />
        <FeedbackTab initialSource="site" />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("1"));
    await screen.findAllByText("Website technical issue");
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("none"));
  });

  it("shows each source's pending count in the source filter, from the rail's count", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/feedback/pending-count") {
        return Response.json({ ok: true, article: 3, site: 0, total: 3 });
      }
      if (url.pathname === "/api/article-feedback/queue") {
        return queueResponse(input, [articleRow]);
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    function Rail() {
      useDevRailBadges("admin");
      return null;
    }

    render(
      <>
        <Rail />
        <FeedbackTab />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Article 3" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Site 0" })).toBeInTheDocument();
  });

  it("says in the opened queue when the pending count is only the last known one", async () => {
    const user = userEvent.setup();
    const answers: ("fail" | number)[] = [12, "fail", 11];
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/feedback/pending-count") {
        const next = answers.length > 1 ? answers.shift()! : answers[0];
        return next === "fail"
          ? Response.json({ error: "down" }, { status: 503 })
          : Response.json({ ok: true, article: next, site: 0, total: next });
      }
      if (url.pathname === "/api/article-feedback/queue") {
        return queueResponse(input, [articleRow]);
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    function Rail() {
      const count = useDevRailBadges("admin").feedback;
      return <span data-testid="badge">{count ?? "none"}</span>;
    }

    render(
      <>
        <Rail />
        <FeedbackTab />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("12"));
    await screen.findAllByText("Mescaline");
    expect(screen.queryByText(/last known count/)).not.toBeInTheDocument();

    // The next refresh fails: the badge keeps 12 and the queue says it is the last known count.
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText(/12 feedback items is the last known count/)).toBeInTheDocument();
    expect(screen.getByTestId("badge")).toHaveTextContent("12");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("11"));
    expect(screen.queryByText(/last known count/)).not.toBeInTheDocument();
  });

  it("asks before a source switch drops a typed note, and starts the site queue fresh after Discard", async () => {
    const user = userEvent.setup();
    render(<FeedbackTab />);

    await screen.findAllByText("Mescaline");
    await user.type(screen.getByLabelText("Review note"), "Checked the pharmacology table.");
    expect(screen.getByLabelText("Review note")).toHaveValue("Checked the pharmacology table.");

    await user.click(screen.getByRole("button", { name: "Site" }));
    const dialog = await screen.findByRole("dialog", { name: "Discard the review note?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Article" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Review note")).toHaveValue("Checked the pharmacology table.");

    await user.click(screen.getByRole("button", { name: "Site" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Discard the review note?" })).getByRole("button", {
        name: "Discard changes",
      }),
    );

    await screen.findAllByText("Website technical issue");
    expect(screen.getByLabelText("Review note")).toHaveValue("");
  });

  it("drops a late article list once the site queue has been chosen", async () => {
    const user = userEvent.setup();
    // Executor form: the project lib target predates Promise.withResolvers.
    let releaseArticle: () => void = () => {};
    const articleGate = new Promise<void>((resolve) => {
      releaseArticle = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/article-feedback/queue") {
        await articleGate;
        return queueResponse(input, [articleRow]);
      }

      if (url.pathname === "/api/site-feedback/queue") {
        return queueResponse(input, [technicalRow, spamRow]);
      }

      return Response.json({ ok: true, article: 0, site: 0, total: 0 });
    });

    render(<FeedbackTab />);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/article-feedback/queue?"), expect.anything()),
    );

    await user.click(screen.getByRole("button", { name: "Site" }));
    await screen.findAllByText("Website technical issue");

    releaseArticle();
    // Give the stale response every chance to land before asserting it did not.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText("Mescaline")).not.toBeInTheDocument();
    expect(screen.getAllByText("Website technical issue").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "New, 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spam, 1" })).toBeInTheDocument();
  });
});
