import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createArticleFeedbackRow, validateArticleFeedback } from "@/features/article/feedback/articleFeedback";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import {
  FeedbackReviewQueue,
  type FeedbackQueueFilter,
  type FeedbackQueueItem,
  type FeedbackSourceAdapter,
} from "./FeedbackReviewQueue";
import { siteFeedbackAdapter } from "./siteFeedbackAdapter";
import { queueResponse } from "@/test/feedbackQueueServer";

const articleRow = {
  id: "article-1",
  status: "new",
  schema_version: 1,
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "high",
  details: "The oral duration looks off.",
  source_url: "https://pubmed.example/study",
  contact_email: "reader@example.com",
  honeypot_triggered: false,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const resolvedArticleRow = {
  ...articleRow,
  id: "article-0",
  status: "resolved",
  substance_title: "Ketamine",
  details: "Fixed last week.",
  created_at: "2026-08-02T12:00:00.000Z",
};

const siteRow = {
  id: "site-1",
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

type Deferred = { resolve: () => void };

function stubFetch(
  basePath: string,
  rows: ({ id: string } & Record<string, unknown>)[],
  options: { holdTransition?: Deferred; failList?: boolean } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const transitioned = rows.find((row) => url === `${basePath}/${row.id}/status`);
    if (transitioned && init?.method === "POST") {
      if (options.holdTransition) {
        await new Promise<void>((resolve) => {
          options.holdTransition!.resolve = resolve;
        });
      }
      return Response.json({ ok: true, feedback: { ...transitioned, status: "resolved" } });
    }

    if (url.startsWith(`${basePath}/queue`)) {
      if (options.failList) {
        options.failList = false;
        return Response.json({ error: "Storage is warming up." }, { status: 503 });
      }
      return queueResponse(input, rows);
    }

    return Response.json({ error: "unexpected" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The queue as the tab mounts it: the filter starts automatic and is owned above the queue. */
function Queue<Item extends FeedbackQueueItem>({ adapter }: { adapter: FeedbackSourceAdapter<Item> }) {
  const [filter, setFilter] = useState<FeedbackQueueFilter | null>(null);
  return <FeedbackReviewQueue adapter={adapter} statusFilter={filter} onStatusFilterChange={setFilter} />;
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe.each([
  {
    name: "article",
    queue: <Queue adapter={articleFeedbackAdapter} />,
    basePath: "/api/article-feedback",
    row: articleRow,
    headline: "Mescaline",
  },
  {
    name: "site",
    queue: <Queue adapter={siteFeedbackAdapter} />,
    basePath: "/api/site-feedback",
    row: siteRow,
    headline: "Website technical issue",
  },
])("FeedbackReviewQueue with the $name adapter", ({ queue, basePath, row, headline }) => {
  it("renders the source's detail and sends the typed note with the decision", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(basePath, [row]);
    render(queue);

    expect((await screen.findAllByText(headline)).length).toBeGreaterThan(0);
    expect(screen.getByText("reader@example.com")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Review note"), "  Checked against the 2024 review.  ");
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${basePath}/${row.id}/status`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ status: "resolved", note: "Checked against the 2024 review." }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Review note")).toHaveValue(""));
  });

  it("shows every past decision in the log, oldest first, with who and why", async () => {
    stubFetch(basePath, [
      {
        ...row,
        status: "resolved",
        review_notes: "Fixed in the dosage table.",
        decision_log: [
          { at: "2026-08-02T09:00:00.000Z", actor: "first@example.com", from: "new", to: "reviewing" },
          {
            at: "2026-08-03T09:00:00.000Z",
            actor: "second@example.com",
            from: "reviewing",
            to: "resolved",
            note: "Fixed in the dosage table.",
          },
        ],
      },
    ]);
    render(queue);

    const log = await screen.findByRole("list", { name: "Decision log" });
    const entries = within(log).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("New to Reviewing");
    expect(entries[0]).toHaveTextContent("first@example.com");
    expect(entries[1]).toHaveTextContent("Reviewing to Resolved");
    expect(entries[1]).toHaveTextContent("second@example.com");
    expect(entries[1]).toHaveTextContent("Fixed in the dosage table.");
  });

  it("shows a review note stored before the log as a migrated entry", async () => {
    stubFetch(basePath, [
      { ...row, status: "rejected", review_notes: "Not reproducible.", reviewed_by: "first@example.com" },
    ]);
    render(queue);

    const log = await screen.findByRole("list", { name: "Decision log" });
    const [entry] = within(log).getAllByRole("listitem");
    expect(entry).toHaveTextContent("Earlier decision: Rejected");
    expect(entry).toHaveTextContent("first@example.com");
    expect(entry).toHaveTextContent("recorded before the decision log");
    expect(entry).toHaveTextContent("Not reproducible.");
  });

  it("asks before rejecting and only writes after the confirm, omitting a blank note", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(basePath, [row]);
    render(queue);

    await screen.findAllByText(headline);
    await user.click(screen.getByRole("button", { name: "Reject" }));

    const dialog = await screen.findByRole("dialog", { name: "Reject this feedback?" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Reject this feedback?" })).getByRole("button", { name: "Reject" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${basePath}/${row.id}/status`,
        expect.objectContaining({ body: JSON.stringify({ status: "rejected" }) }),
      ),
    );
  });

  it("asks before marking spam", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(basePath, [row]);
    render(queue);

    await screen.findAllByText(headline);
    await user.click(screen.getByRole("button", { name: "Spam" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Mark as spam?" })).getByRole("button", { name: "Mark as spam" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${basePath}/${row.id}/status`,
        expect.objectContaining({ body: JSON.stringify({ status: "spam" }) }),
      ),
    );
  });

  it("disables every decision while a transition is in flight and sends one request on a double click", async () => {
    const user = userEvent.setup();
    const hold: Deferred = { resolve: () => {} };
    const fetchMock = stubFetch(basePath, [row], { holdTransition: hold });
    render(queue);

    await screen.findAllByText(headline);
    const resolve = screen.getByRole("button", { name: "Resolve" });
    await user.dblClick(resolve);

    await waitFor(() => expect(resolve).toBeDisabled());
    expect(screen.getByRole("button", { name: "Reviewing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Spam" })).toBeDisabled();
    expect(screen.getByLabelText("Review note")).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    hold.resolve();

    await waitFor(() => expect(screen.getByRole("button", { name: "Reviewing" })).toBeEnabled());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("offers a retry when the list fails to load", async () => {
    const user = userEvent.setup();
    stubFetch(basePath, [row], { failList: true });
    render(queue);

    expect(await screen.findByText("Storage is warming up.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect((await screen.findAllByText(headline)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Storage is warming up.")).not.toBeInTheDocument();
  });
});

describe("FeedbackReviewQueue with a malformed list response", () => {
  it("shows a retryable error on a first load that returns an empty object, never an empty queue", async () => {
    const user = userEvent.setup();
    let malformed = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (malformed) {
        malformed = false;
        return Response.json({});
      }
      return queueResponse(input, [articleRow]);
    }));
    render(<Queue adapter={articleFeedbackAdapter} />);

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("No article feedback yet.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Mescaline")).length).toBeGreaterThan(0);
  });

  it("keeps the loaded rows when the refresh after a decision returns invalid JSON", async () => {
    const user = userEvent.setup();
    const second = { ...articleRow, id: "article-2", substance_title: "Psilocybin" };
    let lists = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return Response.json({ ok: true, feedback: { ...articleRow, status: "reviewing" } });
      }
      if (url.startsWith("/api/article-feedback/queue")) {
        lists += 1;
        return lists === 1
          ? queueResponse(input, [articleRow, second])
          : new Response("<html>502</html>", { status: 200 });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }));
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    await user.click(screen.getByRole("button", { name: "Reviewing" }));

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(within(list).getByText("Psilocybin")).toBeInTheDocument();
  });
});

describe("FeedbackReviewQueue after a decision", () => {
  const rowA = { ...articleRow, id: "article-a", substance_title: "Alprazolam" };
  const rowB = { ...articleRow, id: "article-b", substance_title: "Bromazepam" };
  const rowC = { ...articleRow, id: "article-c", substance_title: "Clonazepam" };

  /**
   * A queue of three New rows whose transition and post-decision refresh are
   * both held until the test releases them.
   */
  function stubHeldQueue() {
    let releaseTransition: () => void = () => {};
    let releaseRefresh: () => void = () => {};
    const transitionGate = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let lists = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        await transitionGate;
        return Response.json({ ok: true, feedback: { ...rowA, status: "resolved" } });
      }
      if (url.startsWith("/api/article-feedback/queue")) {
        lists += 1;
        if (lists === 1) {
          return queueResponse(input, [rowA, rowB, rowC]);
        }
        await refreshGate;
        // A new report arrived at the top while the admin worked.
        const arrived = { ...articleRow, id: "article-0", substance_title: "Zolpidem" };
        return queueResponse(input, [arrived, { ...rowA, status: "resolved" }, rowB, rowC]);
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }));
    return { releaseTransition: () => releaseTransition(), releaseRefresh: () => releaseRefresh() };
  }

  it("keeps the row the admin moved to, and the note typed there, through the decision and the refresh", async () => {
    const user = userEvent.setup();
    const held = stubHeldQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    expect(screen.getByRole("heading", { level: 3, name: "Alprazolam" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    // While the decision is in flight the admin moves on and starts a note.
    await user.click(within(list).getByText("Clonazepam"));
    await user.type(screen.getByLabelText("Review note"), "Dose table checked");

    held.releaseTransition();
    // The decided row leaves the New list; its notice belongs to that row, not this one.
    await waitFor(() => expect(within(list).queryByText("Alprazolam")).not.toBeInTheDocument());
    expect(screen.queryByText('Moved feedback for "Alprazolam" to resolved.')).not.toBeInTheDocument();
    held.releaseRefresh();
    await within(list).findByText("Zolpidem");

    expect(screen.getByRole("heading", { level: 3, name: "Clonazepam" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("Dose table checked");
  });

  it("hands the review to the next row after a decision and keeps it there when the refresh lands", async () => {
    const user = userEvent.setup();
    const held = stubHeldQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    held.releaseTransition();

    expect(await screen.findByRole("heading", { level: 3, name: "Bromazepam" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Review note"), "Half a thought");
    held.releaseRefresh();
    await within(list).findByText("Zolpidem");

    expect(screen.getByRole("heading", { level: 3, name: "Bromazepam" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("Half a thought");
  });

  it("refreshes the list without a loading label", async () => {
    const user = userEvent.setup();
    const held = stubHeldQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    held.releaseTransition();
    await screen.findByText('Moved feedback for "Alprazolam" to resolved.');

    expect(screen.queryByText("Loading feedback...")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    expect(within(list).getByText("Bromazepam")).toBeInTheDocument();

    held.releaseRefresh();
    await within(list).findByText("Zolpidem");
    expect(screen.queryByText("Loading feedback...")).not.toBeInTheDocument();
  });
});

describe("FeedbackReviewQueue intake triage", () => {
  it("files a honeypot submission under Spam, not New", async () => {
    const validation = validateArticleFeedback({
      substance_slug: "mescaline",
      substance_title: "Mescaline",
      category: "inaccurate",
      importance: "normal",
      details: "Cheap pills here.",
      honeypot: "https://spam.example",
    });
    if (!validation.ok) throw new Error("fixture should validate");
    const honeypotRow = createArticleFeedbackRow(validation.normalized, { id: "article-spam" });
    stubFetch("/api/article-feedback", [honeypotRow]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    expect(screen.getByText("1 spam")).toBeInTheDocument();
    expect(within(list).getByText("Spam")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("All");
  });

  it("shows each row's importance and sorts the list by it", async () => {
    const user = userEvent.setup();
    stubFetch("/api/article-feedback", [
      { ...articleRow, id: "article-low", substance_title: "Caffeine", importance: "low" },
      { ...articleRow, id: "article-critical", substance_title: "Fentanyl", importance: "critical" },
      { ...articleRow, id: "article-normal", substance_title: "Melatonin", importance: "normal" },
    ]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    // Changing the order reloads the list from the server, so read the list afresh each time.
    const titles = () =>
      within(screen.getByRole("listbox", { name: "Feedback queue" }))
        .getAllByRole("option")
        .map((option) => option.textContent ?? "");
    expect(within(within(list).getAllByRole("option")[1]).getByText("Critical")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Importance" }));

    await waitFor(() => expect(titles()[0]).toContain("Fentanyl"));
    expect(titles()[1]).toContain("Melatonin");
    expect(titles()[2]).toContain("Caffeine");
  });
});

describe("FeedbackReviewQueue reach", () => {
  const oldUnresolved = {
    ...articleRow,
    id: "old-unresolved",
    substance_title: "Tramadol",
    details: "Seizure threshold missing.",
    created_at: "2025-01-01T00:00:00.000Z",
  };
  const newerResolved = Array.from({ length: 250 }, (_, index) => ({
    ...articleRow,
    id: `resolved-${index}`,
    status: "resolved",
    substance_title: `Resolved ${index}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
  }));

  function stubServer(rows: ({ id: string } & Record<string, unknown>)[]) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/article-feedback/queue")
        ? queueResponse(input, rows)
        : Response.json({ error: "unexpected" }, { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const listbox = () => screen.getByRole("listbox", { name: "Feedback queue" });

  it("still exposes one old unresolved report under 250 newer resolved ones", async () => {
    stubServer([oldUnresolved, ...newerResolved]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    expect(await screen.findByRole("heading", { level: 3, name: "Tramadol" })).toBeInTheDocument();
    expect(within(listbox()).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("1 new · 250 resolved")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("New (1)");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Oldest first");
  });

  it("pages through everything, shows loaded apart from total, and keeps the selection and note while more load", async () => {
    const user = userEvent.setup();
    const fetchMock = stubServer([oldUnresolved, ...newerResolved]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    await screen.findByRole("heading", { level: 3, name: "Tramadol" });
    await user.click(screen.getByRole("combobox", { name: "Queue filter" }));
    await user.click(await screen.findByRole("option", { name: "All 251" }));

    expect(await screen.findByText("100 of 251 loaded")).toBeInTheDocument();
    await user.click(within(listbox()).getByText("Resolved 247"));
    await user.type(screen.getByLabelText("Review note"), "Reopen?");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("200 of 251 loaded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("251 of 251 loaded")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Resolved 247" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("Reopen?");
    const cursors = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), "https://dose.wiki").searchParams)
      .filter((params) => params.get("status") === "all")
      .map((params) => params.get("cursor"));
    expect(cursors).toEqual([null, "100", "200"]);
  });

  it("searches on the server, so a match outside the loaded rows is found", async () => {
    const user = userEvent.setup();
    const fetchMock = stubServer([oldUnresolved, ...newerResolved]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    await screen.findByRole("heading", { level: 3, name: "Tramadol" });
    await user.click(screen.getByRole("combobox", { name: "Queue filter" }));
    await user.click(await screen.findByRole("option", { name: "Resolved 250" }));
    await screen.findByText("100 of 250 loaded");

    await user.type(screen.getByRole("searchbox", { name: "Search feedback" }), "Resolved 3");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q=Resolved+3"), expect.anything()),
    );
    // "Resolved 3" and "Resolved 30" to "Resolved 39": the oldest ones sit past the first page.
    expect(await screen.findByText("11 of 11 loaded")).toBeInTheDocument();
    expect(within(listbox()).getByText("Resolved 3")).toBeInTheDocument();
  });

  it("opens on Reviewing when nothing is New but something is still being reviewed", async () => {
    stubServer([{ ...oldUnresolved, status: "reviewing" }, ...newerResolved.slice(0, 3)]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    expect(await screen.findByRole("heading", { level: 3, name: "Tramadol" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("Reviewing (1)");
  });
});

describe("FeedbackReviewQueue filter", () => {
  it("opens on the New rows when there are any and counts every status in the filter", async () => {
    const user = userEvent.setup();
    stubFetch("/api/article-feedback", [resolvedArticleRow, articleRow]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(within(list).getByText("Mescaline")).toBeInTheDocument();
    expect(screen.getByText("1 new · 1 resolved")).toBeInTheDocument();

    const filter = screen.getByRole("combobox", { name: "Queue filter" });
    expect(filter).toHaveTextContent("New");
    await user.click(filter);
    expect(await screen.findByRole("option", { name: "All 2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "New 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Resolved 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Spam 0" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "All 2" }));
    await waitFor(() =>
      expect(within(screen.getByRole("listbox", { name: "Feedback queue" })).getAllByRole("option")).toHaveLength(2),
    );
  });

  it("opens on everything when nothing is New", async () => {
    stubFetch("/api/article-feedback", [resolvedArticleRow]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    expect((await screen.findAllByText("Ketamine")).length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("All");
  });

  it("keeps a typed note when a row click is cancelled and drops it only on Discard", async () => {
    const user = userEvent.setup();
    stubFetch("/api/article-feedback", [articleRow, { ...articleRow, id: "article-2", substance_title: "Psilocybin" }]);
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    await user.type(screen.getByLabelText("Review note"), "Half a thought");

    await user.click(within(list).getByText("Psilocybin"));
    const dialog = await screen.findByRole("dialog", { name: "Discard the review note?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Review note")).toHaveValue("Half a thought");
    expect(screen.getByRole("heading", { level: 3, name: "Mescaline" })).toBeInTheDocument();

    await user.click(within(list).getByText("Psilocybin"));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Discard the review note?" })).getByRole("button", {
        name: "Discard changes",
      }),
    );

    expect(await screen.findByRole("heading", { level: 3, name: "Psilocybin" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("");
  });
});

describe("FeedbackReviewQueue keyboard triage and bulk actions", () => {
  const rowA = { ...articleRow, id: "article-a", substance_title: "Alprazolam", created_at: "2026-08-01T12:00:00.000Z" };
  const rowB = { ...articleRow, id: "article-b", substance_title: "Bromazepam", created_at: "2026-08-02T12:00:00.000Z" };
  const rowC = { ...articleRow, id: "article-c", substance_title: "Clonazepam", created_at: "2026-08-03T12:00:00.000Z" };

  /** A live stand-in: each POST moves the row to the posted status, and later lists show it. */
  function stubLiveQueue() {
    const rows = new Map<string, Record<string, unknown> & { id: string }>(
      [rowA, rowB, rowC].map((row) => [row.id, { ...row }]),
    );
    const posts: { id: string; body: Record<string, unknown> }[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const match = /^\/api\/article-feedback\/([^/]+)\/status$/.exec(url);
      if (match && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ id: match[1], body });
        const updated = { ...rows.get(match[1])!, status: body.status };
        rows.set(match[1], updated);
        return Response.json({ ok: true, feedback: updated });
      }
      if (url.startsWith("/api/article-feedback/queue")) {
        return queueResponse(input, [...rows.values()]);
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return posts;
  }

  it("moves the selection with j and k and resolves with a", async () => {
    const user = userEvent.setup();
    const posts = stubLiveQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    await screen.findByRole("heading", { level: 3, name: "Alprazolam" });
    await user.keyboard("j");
    expect(await screen.findByRole("heading", { level: 3, name: "Bromazepam" })).toBeInTheDocument();
    await user.keyboard("j");
    expect(await screen.findByRole("heading", { level: 3, name: "Clonazepam" })).toBeInTheDocument();
    await user.keyboard("k");
    expect(await screen.findByRole("heading", { level: 3, name: "Bromazepam" })).toBeInTheDocument();

    await user.keyboard("a");
    await waitFor(() => expect(posts).toEqual([{ id: "article-b", body: { status: "resolved" } }]));
  });

  it("asks before r rejects, types nothing into the note, and u takes the decision back", async () => {
    const user = userEvent.setup();
    const posts = stubLiveQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    await screen.findByRole("heading", { level: 3, name: "Alprazolam" });
    await user.keyboard("r");
    const dialog = await screen.findByRole("dialog", { name: "Reject this feedback?" });
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(posts).toEqual([{ id: "article-a", body: { status: "rejected" } }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.keyboard("u");
    await waitFor(() =>
      expect(posts[1]).toEqual({ id: "article-a", body: { status: "reviewing" } }),
    );

    await user.keyboard("n");
    expect(screen.getByLabelText("Review note")).toHaveFocus();
    expect(screen.getByLabelText("Review note")).toHaveValue("");
  });

  it("keeps the arrow keys on the queue listbox", async () => {
    stubLiveQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    const list = await screen.findByRole("listbox", { name: "Feedback queue" });
    await screen.findByRole("heading", { level: 3, name: "Alprazolam" });
    list.focus();
    await userEvent.setup().keyboard("{ArrowDown}");
    expect(await screen.findByRole("heading", { level: 3, name: "Bromazepam" })).toBeInTheDocument();
    expect(within(list).getByRole("option", { selected: true })).toHaveTextContent("Bromazepam");
  });

  it("marks every ticked row as spam after one confirm", async () => {
    const user = userEvent.setup();
    const posts = stubLiveQueue();
    render(<Queue adapter={articleFeedbackAdapter} />);

    await screen.findByRole("listbox", { name: "Feedback queue" });
    await user.click(screen.getByRole("checkbox", { name: "Select Alprazolam" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Clonazepam" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(within(screen.getByRole("toolbar", { name: "Bulk feedback actions" })).getByRole("button", { name: "Mark as spam" }));
    const dialog = await screen.findByRole("dialog", { name: "Mark 2 feedback items as spam?" });
    expect(within(dialog).getByText("Alprazolam")).toBeInTheDocument();
    expect(within(dialog).getByText("Clonazepam")).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Mark as spam" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { id: "article-a", body: { status: "spam" } },
        { id: "article-c", body: { status: "spam" } },
      ]),
    );
    expect(await screen.findByText("Marked 2 feedback items as spam.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("2 selected")).not.toBeInTheDocument());
  });
});
