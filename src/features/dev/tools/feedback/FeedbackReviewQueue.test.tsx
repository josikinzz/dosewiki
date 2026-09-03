import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import { FeedbackReviewQueue } from "./FeedbackReviewQueue";
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

function stubFetch(basePath: string, row: { id: string }, options: { holdTransition?: Deferred } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${basePath}/${row.id}/status` && init?.method === "POST") {
      if (options.holdTransition) {
        await new Promise<void>((resolve) => {
          options.holdTransition!.resolve = resolve;
        });
      }
      return Response.json({ ok: true, feedback: { ...row, status: "resolved" } });
    }

    if (url.startsWith(`${basePath}/queue`)) {
      return Response.json({ ok: true, feedback: [row] });
    }

    return Response.json({ error: "unexpected" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe.each([
  {
    name: "article",
    queue: <FeedbackReviewQueue adapter={articleFeedbackAdapter} />,
    basePath: "/api/article-feedback",
    row: articleRow,
    headline: "Mescaline",
  },
  {
    name: "site",
    queue: <FeedbackReviewQueue adapter={siteFeedbackAdapter} />,
    basePath: "/api/site-feedback",
    row: siteRow,
    headline: "Website technical issue",
  },
])("FeedbackReviewQueue with the $name adapter", ({ queue, basePath, row, headline }) => {
  it("renders the source's detail and sends the typed note with the decision", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(basePath, row);
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

  it("omits the note when the textarea is blank", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(basePath, row);
    render(queue);

    await screen.findAllByText(headline);
    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `${basePath}/${row.id}/status`,
        expect.objectContaining({ body: JSON.stringify({ status: "rejected" }) }),
      ),
    );
  });

  it("disables every decision while a transition is in flight and sends one request on a double click", async () => {
    const user = userEvent.setup();
    const hold: Deferred = { resolve: () => {} };
    const fetchMock = stubFetch(basePath, row, { holdTransition: hold });
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
});
