import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
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
    headers: { "content-type": "application/json", origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "feedback-1" }) };

describe("feedbackStatusRoute", () => {
  beforeEach(() => {
    authMocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    authMocks.requireRoleSession.mockReset();
    transition.mockReset();
    getStore.mockReset().mockResolvedValue({ transition });
  });

  it.each([
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["no Origin", {}],
    ["a cross-site fetch", { origin: "https://dose.wiki", "sec-fetch-site": "cross-site" }],
  ])("refuses %s with 403 before the limiter, session, or store", async (_label, headers) => {
    const response = await POST(
      new Request("https://dose.wiki/api/thing/feedback-1/status", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ status: "resolved" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ORIGIN_REQUIRED" });
    expect(authMocks.enforceRateLimit).not.toHaveBeenCalled();
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

  it("reports a frozen transition as the shared 503 freeze refusal", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin"));
    transition.mockRejectedValue(new DataWriteFrozenError("siteFeedback:transition"));

    const response = await POST(statusRequest({ status: "resolved" }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
  });
});
