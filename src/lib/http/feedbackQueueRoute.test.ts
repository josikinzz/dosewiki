import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn(), enforceRateLimit: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: authMocks.enforceRateLimit,
}));

import { feedbackQueueRoute } from "./feedbackQueueRoute";

class Unconfigured extends Error {}
type Status = "new" | "reviewing" | "resolved" | "rejected" | "spam";
const STATUSES: readonly Status[] = ["new", "reviewing", "resolved", "rejected", "spam"];
const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

const page = vi.fn();
const getStore = vi.fn();

const GET = feedbackQueueRoute<Status>({
  isStatus,
  getStore,
  StorageConfigurationError: Unconfigured,
  sourceLabel: "thing",
  unexpectedErrorLabel: "Failed to load thing queue:",
  unexpectedErrorMessage: "Unable to load thing right now.",
});

const counts = { new: 1, reviewing: 2, resolved: 250, rejected: 0, spam: 3 };

function queueRequest(query = ""): Request {
  return new Request(`https://dose.wiki/api/thing/queue${query}`);
}

describe("feedbackQueueRoute", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    page.mockReset().mockResolvedValue({ feedback: [{ id: "old", status: "new" }], nextCursor: null, counts });
    getStore.mockReset().mockResolvedValue({ page });
  });

  it("passes status, search, order, cursor and page size to the store and returns total apart from the page", async () => {
    page.mockResolvedValueOnce({ feedback: [{ id: "old", status: "new" }], nextCursor: "abc_-1", counts });
    const response = await GET(queueRequest("?status=new&q=%20ketamine%20&order=importance&cursor=abc_-0&limit=50"));

    expect(response.status).toBe(200);
    expect(page).toHaveBeenCalledWith({
      status: "new",
      search: "ketamine",
      order: "importance",
      cursor: "abc_-0",
      limit: 50,
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      feedback: [{ id: "old", status: "new" }],
      nextCursor: "abc_-1",
      counts,
      total: 1,
    });
  });

  it("defaults to every status, oldest first, one hundred rows, and totals every status", async () => {
    const response = await GET(queueRequest("?status=all"));

    expect(page).toHaveBeenCalledWith({ order: "oldest", limit: 100 });
    await expect(response.json()).resolves.toMatchObject({ total: 256 });
  });

  it("caps the page size at 250", async () => {
    await GET(queueRequest("?limit=5000"));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ limit: 250 }));
  });

  it.each([
    ["an unknown status", "?status=open", "Unknown thing feedback status: open"],
    ["an unknown order", "?order=random", "Unknown queue order: random"],
    ["an overlong search", `?q=${"x".repeat(201)}`, "Search text is limited to 200 characters."],
    ["a cursor with foreign characters", "?cursor=a%27%3B--", "That page of the queue is no longer valid. Reload the queue."],
  ])("refuses %s with 400 before touching the store", async (_label, query, message) => {
    const response = await GET(queueRequest(query));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(getStore).not.toHaveBeenCalled();
  });

  it("answers a cursor the server cannot decode with 400, not 500", async () => {
    page.mockRejectedValueOnce(new Error("Invalid feedback queue cursor."));
    const response = await GET(queueRequest("?cursor=bm90LWpzb24"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "That page of the queue is no longer valid. Reload the queue.",
    });
  });

  it("maps unconfigured storage to 503 and anything else to the generic 500", async () => {
    getStore.mockRejectedValueOnce(new Unconfigured("Storage is not configured."));
    const unconfigured = await GET(queueRequest());
    expect(unconfigured.status).toBe(503);

    page.mockRejectedValueOnce(new Error("boom"));
    const failed = await GET(queueRequest());
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "Unable to load thing right now." });
  });

  it("needs an editor session", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));
    expect((await GET(queueRequest())).status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });
});
