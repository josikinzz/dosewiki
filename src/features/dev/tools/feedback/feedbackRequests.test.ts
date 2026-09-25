import { afterEach, describe, expect, it, vi } from "vitest";

import { createFeedbackRequests } from "./feedbackRequests";

const requests = createFeedbackRequests<{ id: string; status: string }>("/api/article-feedback");

function respondWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedback list client", () => {
  it("returns the rows of a well-formed response", async () => {
    respondWith(Response.json({ ok: true, feedback: [{ id: "a", status: "new" }] }));
    await expect(requests.fetchList()).resolves.toEqual([{ id: "a", status: "new" }]);
  });

  it("returns an empty list only when the server says it is empty", async () => {
    respondWith(Response.json({ ok: true, feedback: [] }));
    await expect(requests.fetchList()).resolves.toEqual([]);
  });

  it.each([
    ["an empty object", () => Response.json({})],
    ["invalid JSON", () => new Response("<html>gateway</html>", { status: 200 })],
    ["a list that is not an array", () => Response.json({ feedback: "none" })],
    ["rows that are not feedback", () => Response.json({ feedback: [1, 2] })],
    ["rows without a status", () => Response.json({ feedback: [{ id: "a" }] })],
    ["a top-level array", () => Response.json([{ id: "a", status: "new" }])],
  ])("rejects %s with a retryable error instead of an empty queue", async (_label, response) => {
    respondWith(response());
    await expect(requests.fetchList()).rejects.toThrow(/Try again/);
  });

  it("keeps the server's error message on a failed response", async () => {
    respondWith(Response.json({ error: "Storage is warming up." }, { status: 503 }));
    await expect(requests.fetchList()).rejects.toThrow("Storage is warming up.");
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
