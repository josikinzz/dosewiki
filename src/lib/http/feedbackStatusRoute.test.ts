import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn(), enforceRateLimit: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: authMocks.enforceRateLimit,
}));

import { feedbackStatusRoute } from "./feedbackStatusRoute";

class NotFound extends Error {}
class Unconfigured extends Error {}
type Status = "new" | "reviewing" | "resolved";
const STATUSES: readonly Status[] = ["new", "reviewing", "resolved"];
const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

const ADMIN = { email: "admin@example.com", name: "Admin" };
const transition = vi.fn();
const getStore = vi.fn();

const POST = feedbackStatusRoute<Status>({
  isStatus,
  getStore,
  NotFoundError: NotFound,
  StorageConfigurationError: Unconfigured,
  notFoundMessage: "Thing not found.",
  unexpectedErrorLabel: "Failed to update thing status:",
  unexpectedErrorMessage: "Unable to update thing right now.",
});

function statusRequest(body: unknown): Request {
  return new Request("https://dose.wiki/api/thing/feedback-1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "feedback-1" }) };

describe("feedbackStatusRoute", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
    transition.mockReset().mockResolvedValue({ id: "feedback-1", status: "resolved" });
    getStore.mockReset().mockResolvedValue({ transition });
  });

  it("returns the rate limiter's response before checking the session", async () => {
    authMocks.enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(429);
    expect(authMocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(authMocks.requireRoleSession).not.toHaveBeenCalled();
    expect(getStore).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401 before touching the store", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });

  it("refuses an editor with 403 before touching the store, asking for the admin floor", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(getStore).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("stores the admin's trimmed note with the transition, naming them as the actor", async () => {
    const response = await POST(statusRequest({ status: "resolved", note: "  Fixed.  " }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      feedback: { id: "feedback-1", status: "resolved" },
    });
    expect(transition).toHaveBeenCalledWith("feedback-1", {
      status: "resolved",
      reviewer: "admin@example.com",
      actorEmail: "admin@example.com",
      note: "Fixed.",
    });
  });

  it("passes an undefined note when the note is absent, null, or blank", async () => {
    await POST(statusRequest({ status: "reviewing" }), context);
    await POST(statusRequest({ status: "reviewing", note: null }), context);
    await POST(statusRequest({ status: "reviewing", note: "   " }), context);

    expect(transition).toHaveBeenCalledTimes(3);
    for (const call of transition.mock.calls) {
      expect(call[1]).toEqual({
        status: "reviewing",
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
        note: undefined,
      });
    }
  });

  it("rejects a non-string note with 400 before reaching the store", async () => {
    const response = await POST(statusRequest({ status: "resolved", note: 42 }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "The review note must be text." });
    expect(transition).not.toHaveBeenCalled();
  });

  it("rejects a status outside the vocabulary with 400 before reaching the store", async () => {
    for (const status of ["archived", 7, null, undefined]) {
      const response = await POST(statusRequest({ status }), context);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "A valid feedback status is required." });
    }
    expect(transition).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 and an oversized body with 413", async () => {
    const malformed = await POST(statusRequest("{not json"), context);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "Invalid JSON body." });

    const oversized = await POST(
      statusRequest({ status: "resolved", note: "x".repeat(16 * 1024) }),
      context,
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({ error: "Payload too large." });
    expect(transition).not.toHaveBeenCalled();
  });

  it("maps the store's not-found error to 404 with the route's message", async () => {
    transition.mockRejectedValue(new NotFound("Thing not found: feedback-1"));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Thing not found." });
  });

  it("maps a storage configuration error to 503 with its own message", async () => {
    getStore.mockRejectedValue(new Unconfigured("Thing storage is not configured."));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Thing storage is not configured." });
  });

  it("relays an illegal transition as 400 with the store's sentence", async () => {
    transition.mockRejectedValue(new Error("Illegal transition: resolved -> new."));

    const response = await POST(statusRequest({ status: "new" }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Illegal transition: resolved -> new." });
  });

  it("keeps any other failure generic and logs it under the route's label", async () => {
    transition.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:3210"));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to update thing right now." });
    expect(console.error).toHaveBeenCalledWith("Failed to update thing status:", expect.any(Error));
  });
});
