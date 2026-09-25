import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedbackQueueItem } from "./FeedbackReviewQueue";
import type { FeedbackPageQuery } from "./feedbackQueueModel";
import { createFeedbackRequests } from "./feedbackRequests";

const requests = createFeedbackRequests<FeedbackQueueItem>("/api/article-feedback");

const row = { id: "a", status: "new", details: "Off", created_at: "2026-08-01T00:00:00.000Z" };
const counts = { new: 1, reviewing: 0, resolved: 250, rejected: 0, spam: 0 };
const firstPage: FeedbackPageQuery = { status: "new", search: "", sort: "oldest", cursor: null };

function respondWith(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedback page client", () => {
  it("asks the server for one filtered, searched, ordered page and returns rows, counts and the cursor", async () => {
    const fetchMock = respondWith(Response.json({ ok: true, feedback: [row], counts, nextCursor: "next", total: 1 }));

    await expect(
      requests.fetchPage({ status: "new", search: "  ketamine ", sort: "importance", cursor: "abc" }),
    ).resolves.toEqual({ rows: [row], counts, nextCursor: "next" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-feedback/queue?status=new&order=importance&limit=100&q=ketamine&cursor=abc",
      { cache: "no-store" },
    );
  });

  it("returns an empty page only when the server says it is empty", async () => {
    respondWith(Response.json({ ok: true, feedback: [], counts: { ...counts, new: 0 }, nextCursor: null }));
    await expect(requests.fetchPage(firstPage)).resolves.toMatchObject({ rows: [], nextCursor: null });
  });

  it.each([
    ["an empty object", () => Response.json({})],
    ["invalid JSON", () => new Response("<html>gateway</html>", { status: 200 })],
    ["a list that is not an array", () => Response.json({ feedback: "none", counts, nextCursor: null })],
    ["rows that are not feedback", () => Response.json({ feedback: [1, 2], counts, nextCursor: null })],
    ["rows without a status", () => Response.json({ feedback: [{ id: "a" }], counts, nextCursor: null })],
    ["a top-level array", () => Response.json([row])],
    ["missing counts", () => Response.json({ feedback: [row], nextCursor: null })],
    ["a count that is not a number", () => Response.json({ feedback: [row], counts: { ...counts, new: "1" }, nextCursor: null })],
    ["a missing cursor", () => Response.json({ feedback: [row], counts })],
  ])("rejects %s with a retryable error instead of an empty queue", async (_label, response) => {
    respondWith(response());
    await expect(requests.fetchPage(firstPage)).rejects.toThrow(/Try again/);
  });

  it("keeps the server's error message on a failed response", async () => {
    respondWith(Response.json({ error: "Storage is warming up." }, { status: 503 }));
    await expect(requests.fetchPage(firstPage)).rejects.toThrow("Storage is warming up.");
  });

  it("pages a source that returns its whole list under the same contract, and still validates it", async () => {
    const local = createFeedbackRequests<FeedbackQueueItem>("/api/glossary-feedback", {
      listUrl: "/api/glossary-feedback/queue?locale=de",
    });
    const fetchMock = respondWith(Response.json({ ok: true, feedback: [row, { ...row, id: "b", status: "resolved" }] }));

    await expect(local.fetchPage(firstPage)).resolves.toEqual({
      rows: [row],
      counts: { new: 1, reviewing: 0, resolved: 1, rejected: 0, spam: 0 },
      nextCursor: null,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/glossary-feedback/queue?locale=de", { cache: "no-store" });

    respondWith(Response.json({}));
    await expect(local.fetchPage(firstPage)).rejects.toThrow(/Try again/);
  });
});

describe("feedback transition client", () => {
  it("rejects a success response that carries no updated row", async () => {
    respondWith(Response.json({ ok: true }));
    await expect(requests.transition("a", { status: "resolved" })).rejects.toThrow(/Refresh/);
  });

  it("returns the updated row", async () => {
    respondWith(Response.json({ ok: true, feedback: { id: "a", status: "resolved" } }));
    await expect(requests.transition("a", { status: "resolved" })).resolves.toEqual({ id: "a", status: "resolved" });
  });
});
