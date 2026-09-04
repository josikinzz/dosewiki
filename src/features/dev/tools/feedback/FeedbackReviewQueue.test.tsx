import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import {
  FeedbackReviewQueue,
  type FeedbackQueueFilter,
  type FeedbackQueueItem,
  type FeedbackSourceAdapter,
} from "./FeedbackReviewQueue";
import { siteFeedbackAdapter } from "./siteFeedbackAdapter";

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
  rows: { id: string }[],
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
      return Response.json({ ok: true, feedback: rows });
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
    expect(within(list).getAllByRole("option")).toHaveLength(2);
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
