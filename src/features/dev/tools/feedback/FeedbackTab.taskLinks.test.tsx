import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDevRailBadgesForTests } from "@/features/dev/pages/useDevRailBadges";
import { queueResponse } from "@/test/feedbackQueueServer";

import { FeedbackTab } from "./FeedbackTab";

function row(id: string, title: string, status: string, day: number, details: string) {
  return {
    id,
    status,
    schema_version: 1,
    substance_slug: title.toLowerCase(),
    substance_title: title,
    category: "inaccurate",
    importance: "normal",
    details,
    contact_email: "reader@example.com",
    honeypot_triggered: false,
    created_at: `2026-08-0${day}T12:00:00.000Z`,
    updated_at: `2026-08-0${day}T12:00:00.000Z`,
  };
}

const rows = [
  row("fb-mescaline", "Mescaline", "new", 1, "The oral duration looks off."),
  row("fb-psilocybin", "Psilocybin", "reviewing", 2, "The dose duration table is inverted."),
  row("fb-lsd", "LSD", "resolved", 3, "Typo in the duration section."),
];

function stubQueue() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/article-feedback/queue") return queueResponse(input, rows);
      const item = /^\/api\/article-feedback\/([^/]+)$/.exec(url.pathname);
      if (item) {
        const found = rows.find((candidate) => candidate.id === decodeURIComponent(item[1]));
        return found
          ? Response.json({ ok: true, feedback: found })
          : Response.json({ error: "Article feedback not found." }, { status: 404 });
      }
      if (url.pathname === "/api/feedback/pending-count") return Response.json({ ok: true, article: 2, site: 0, total: 2 });
      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

/** The record under review, read from the Review heading's line. */
function reviewing(title: string) {
  return screen.findByText(new RegExp(`^${title} · received`));
}

const address = () => window.location.pathname + window.location.search;

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.history.replaceState(null, "", "/dev/article-feedback");
  resetDevRailBadgesForTests();
  stubQueue();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Feedback task links", () => {
  it("copies a task link that, reloaded, opens the same record in the same queue", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { unmount } = render(<FeedbackTab />);

    await reviewing("Mescaline");
    await user.click(screen.getByRole("combobox", { name: "Queue filter" }));
    await user.click(await screen.findByRole("option", { name: "Unresolved 2" }));
    await user.click(screen.getByRole("option", { name: /Psilocybin/ }));
    await reviewing("Psilocybin");
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(
      "http://localhost:3000/dev/article-feedback/fb-psilocybin?source=article&status=unresolved",
    );
    // The address bar holds the same link, so a reload lands on it too.
    expect(address()).toBe("/dev/article-feedback/fb-psilocybin?source=article&status=unresolved");

    unmount();
    // Another reviewer opens the link: the route resolves the item from the path.
    render(<FeedbackTab initialSource="article" initialId="fb-psilocybin" />);

    await reviewing("Psilocybin");
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("Unresolved (2)");
    expect(screen.getByRole("option", { name: /Psilocybin/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a linked record the current filter does not list, read on its own", async () => {
    window.history.replaceState(null, "", "/dev/article-feedback/fb-lsd?source=article&status=new");
    render(<FeedbackTab initialSource="article" initialId="fb-lsd" />);

    await reviewing("LSD");
    expect(fetch).toHaveBeenCalledWith("/api/article-feedback/fb-lsd", expect.anything());
    // The list keeps its own filter; nothing else took the review.
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("New (1)");
  });

  it("says a removed or inaccessible record is gone instead of selecting another row", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/dev/article-feedback/fb-deleted?source=article");
    render(<FeedbackTab initialSource="article" initialId="fb-deleted" />);

    expect(await screen.findByText("This item no longer exists or you cannot open it")).toBeInTheDocument();
    expect(screen.queryByText(/^Mescaline · received/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
    expect(address()).toBe("/dev/article-feedback/fb-deleted?source=article");

    await user.click(screen.getByRole("button", { name: "Show the queue" }));
    await reviewing("Mescaline");
  });

  it("restores the queue context (filter, order, search and selection) on returning from the article", async () => {
    window.history.replaceState(
      null,
      "",
      "/dev/article-feedback/fb-psilocybin?source=article&status=all&sort=newest&q=duration",
    );
    render(<FeedbackTab initialSource="article" initialId="fb-psilocybin" />);

    await reviewing("Psilocybin");
    expect(screen.getByRole("combobox", { name: "Queue filter" })).toHaveTextContent("All (3)");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Newest first");
    expect(screen.getByRole("searchbox", { name: "Search feedback" })).toHaveValue("duration");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-feedback/queue?status=all&order=newest&limit=100&q=duration"),
      expect.anything(),
    );
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toContain("LSD");
    expect(screen.getByRole("option", { name: /Psilocybin/ })).toHaveAttribute("aria-selected", "true");
  });

  it("never writes a search that names a reader's contact into the address", async () => {
    const user = userEvent.setup();
    render(<FeedbackTab />);
    await reviewing("Mescaline");

    await user.type(screen.getByRole("searchbox", { name: "Search feedback" }), "reader@example.com");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("q=reader%40example.com"), expect.anything()),
    );
    expect(address()).not.toContain("reader");
    expect(address()).not.toContain("example");
  });
});
