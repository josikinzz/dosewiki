import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonBodyError } from "./readJsonBody";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireEditorSession: vi.fn(),
  requireAuthenticatedSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: mocks.requireEditorSession,
}));

vi.mock("@/lib/auth/requireAuthenticatedSession", () => ({
  requireAuthenticatedSession: mocks.requireAuthenticatedSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

const editorSession = {
  ok: true,
  role: "editor",
  session: { user: { email: "editor@example.com", name: "Editor" } },
};

const convexCapability = {
  client: { mutation: vi.fn() },
  adminKey: "admin-key",
  deployment: { writeUrl: "https://example.convex.cloud" },
  health: {
    adminKeyConfigured: true,
    convexUrlConfigured: true,
    canSaveToConvex: true,
    issues: [],
  },
};

function request(body: unknown = { value: "ok" }) {
  return new Request("https://dose.wiki/api/test", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("protectedRouteOperation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireEditorSession.mockResolvedValue(editorSession);
    mocks.requireAuthenticatedSession.mockResolvedValue(editorSession);
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: convexCapability,
    });
  });

  it("returns unauthenticated responses without invoking the operation", async () => {
    const operation = vi.fn();
    mocks.requireEditorSession.mockResolvedValue(
      {
        ok: false,
        response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
      },
    );
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns unauthorized responses without invoking the operation", async () => {
    const operation = vi.fn();
    mocks.requireEditorSession.mockResolvedValue(
      {
        ok: false,
        response: NextResponse.json({ error: "Editor access required." }, { status: 403 }),
      },
    );
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Editor access required." });
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns rate-limit responses before auth and operation work", async () => {
    const operation = vi.fn();
    mocks.enforceRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 }),
    );
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request());

    expect(response.status).toBe(429);
    expect(mocks.requireEditorSession).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps invalid JSON before invoking the operation", async () => {
    const operation = vi.fn();
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      body: { maxBytes: 1024 },
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body." });
    expect(operation).not.toHaveBeenCalled();
  });

  it("maps missing write capability without invoking the operation", async () => {
    const operation = vi.fn();
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Convex admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          convexUrlConfigured: true,
          canSaveToConvex: false,
          issues: ["Missing CONVEX_ADMIN_KEY on the server."],
        },
      },
    });
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      body: { maxBytes: 1024 },
      capabilities: [{ type: "convexWrite" }],
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Convex admin key is not configured on the server.",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("parses the body and invokes the operation with auth and capabilities", async () => {
    const operation = vi.fn(() => NextResponse.json({ ok: true }));
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation<{ value?: unknown }, { value: string }>({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      body: {
        maxBytes: 1024,
        parse: (body) => {
          if (typeof body.value !== "string") {
            throw new JsonBodyError(400, "Value is required.");
          }

          return { value: body.value };
        },
      },
      capabilities: [{ type: "convexWrite" }],
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request({ value: "parsed" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(operation).toHaveBeenCalledWith({
      request: expect.any(Request),
      auth: editorSession,
      actorEmail: "editor@example.com",
      body: { value: "parsed" },
      convexWrite: convexCapability,
    });
  });
});
