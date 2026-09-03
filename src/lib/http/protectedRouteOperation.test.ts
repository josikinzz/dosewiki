import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonBodyError } from "./readJsonBody";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  requireAuthenticatedSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
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
    mocks.requireRoleSession.mockResolvedValue(editorSession);
    mocks.requireAuthenticatedSession.mockResolvedValue(editorSession);
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: convexCapability,
    });
  });

  it("returns unauthenticated responses without invoking the operation", async () => {
    const operation = vi.fn();
    mocks.requireRoleSession.mockResolvedValue(
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
    mocks.requireRoleSession.mockResolvedValue(
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
    expect(mocks.requireRoleSession).not.toHaveBeenCalled();
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

  describe("failure classification", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      error = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      warn.mockRestore();
      error.mockRestore();
    });

    async function handleThrown(thrown: unknown) {
      const { protectedRouteOperation } = await import("./protectedRouteOperation");
      const handler = protectedRouteOperation({
        auth: "editor",
        rateLimit: "editorSmallWrite",
        unexpectedErrorLabel: "test:",
        unexpectedErrorMessage: "Unable to save that edit right now.",
        operation: () => {
          throw thrown;
        },
      });

      return handler(request());
    }

    /** How the Convex HTTP client rebuilds a thrown `ConvexError` on this side. */
    function forwarded(data: unknown) {
      const thrown = new ConvexError("Server Error");
      (thrown as { data: unknown }).data = data;
      return thrown;
    }

    it("surfaces a deliberate Convex rejection with its own text and code", async () => {
      const response = await handleThrown(
        forwarded({
          code: "FIELD_CONFLICT",
          message:
            "This field changed since the article was loaded. Reload the article, then make the edit again.",
        }),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error:
          "This field changed since the article was loaded. Reload the article, then make the edit again.",
        code: "FIELD_CONFLICT",
      });
      // The reason still reaches the logs; the client only ever sees a sentence.
      expect(warn).toHaveBeenCalledWith("test:", expect.any(ConvexError));
      expect(error).not.toHaveBeenCalled();
    });

    it("keeps an internal failure generic and leaks nothing", async () => {
      const thrown = new Error(
        'Could not find public function for "substanceIndex:setArticleField"',
      );
      const response = await handleThrown(thrown);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
      expect(error).toHaveBeenCalledWith("test:", thrown);
    });

    it("keeps an auth failure generic, since it is not a ConvexError", async () => {
      // `convex/lib/auth.ts` extends `Error` on purpose so authorization
      // detail never becomes a client-visible sentence.
      const thrown = Object.assign(
        new Error("Authentication required: Please sign in or provide an API key"),
        { name: "AuthError" },
      );
      const response = await handleThrown(thrown);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
    });

    it("keeps a ConvexError with an unrenderable payload generic", async () => {
      const response = await handleThrown(forwarded({ code: "FIELD_CONFLICT" }));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
    });

    it("lets a route's own mapError win over the Convex classification", async () => {
      const { protectedRouteOperation } = await import("./protectedRouteOperation");
      const handler = protectedRouteOperation({
        auth: "editor",
        rateLimit: "editorSmallWrite",
        unexpectedErrorLabel: "test:",
        mapError: () => NextResponse.json({ error: "Route said so." }, { status: 418 }),
        operation: () => {
          throw forwarded({ code: "FIELD_CONFLICT", message: "Reload." });
        },
      });

      const response = await handler(request());

      expect(response.status).toBe(418);
      expect(await response.json()).toEqual({ error: "Route said so." });
    });
  });
});
