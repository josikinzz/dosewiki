import { PostgresError } from "@server/postgres/runtime/values";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonBodyError } from "./readJsonBody";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

const editorSession = {
  ok: true,
  role: "editor",
  session: { user: { email: "editor@example.com", name: "Editor" } },
};

const dataCapability = {
  client: { mutation: vi.fn() },
  adminKey: "admin-key",
  deployment: { writeUrl: "postgres://db.example/dosewiki" },
  health: {
    adminKeyConfigured: true,
    backend: "postgres",
    postgresUrlConfigured: true,
    canSaveToPostgres: true,
    issues: [],
  },
};

function request(body: unknown = { value: "ok" }) {
  return new Request("https://dose.wiki/api/test", {
    method: "POST",
    headers: { Origin: "https://dose.wiki", "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("protectedRouteOperation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireRoleSession.mockResolvedValue(editorSession);
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: dataCapability,
    });
  });
  it("rejects foreign, opaque, and missing origins before any authenticated mutation", async () => {
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    let stored = "original";
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      unexpectedErrorLabel: "test:",
      operation: () => { stored = "changed"; return NextResponse.json({ ok: true }); },
    });
    for (const origin of ["https://attacker.example", "null", undefined]) {
      const response = await handler(new Request("https://dev.dose.wiki/api/test", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      }));
      expect(response.status).toBe(403);
      expect(stored).toBe("original");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    const response = await handler(new Request("https://dev.dose.wiki/api/test", {
      method: "POST", headers: { Origin: "https://dev.dose.wiki", "Sec-Fetch-Site": "same-origin" },
    }));
    expect(response.status).toBe(200);
    expect(stored).toBe("changed");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
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

  it("gates every route through the role floor it declares, contributor included", async () => {
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    for (const floor of ["contributor", "editor", "admin"] as const) {
      mocks.requireRoleSession.mockClear();
      const handler = protectedRouteOperation({
        auth: floor,
        rateLimit: "editorSmallWrite",
        unexpectedErrorLabel: "test:",
        operation: () => NextResponse.json({ ok: true }),
      });

      await handler(request());

      expect(mocks.requireRoleSession).toHaveBeenCalledWith(floor);
    }
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
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: false,
      failure: {
        type: "configuration",
        missing: ["adminKey"],
        message: "Postgres admin key is not configured on the server.",
        health: {
          adminKeyConfigured: false,
          backend: "postgres",
          postgresUrlConfigured: true,
          canSaveToPostgres: false,
          issues: ["Missing DATA_ADMIN_KEY on the server."],
        },
      },
    });
    const { protectedRouteOperation } = await import("./protectedRouteOperation");
    const handler = protectedRouteOperation({
      auth: "editor",
      rateLimit: "editorSmallWrite",
      body: { maxBytes: 1024 },
      capabilities: [{ type: "dataWrite" }],
      unexpectedErrorLabel: "test:",
      operation,
    });

    const response = await handler(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Postgres admin key is not configured on the server.",
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
      capabilities: [{ type: "dataWrite" }],
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
      dataWrite: dataCapability,
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

    /** Reproduces the native structured error payload seen at the route boundary. */
    function forwarded(data: unknown) {
      const thrown = new PostgresError("Server Error");
      (thrown as { data: unknown }).data = data;
      return thrown;
    }

    it("surfaces a deliberate Postgres rejection with its own text and code", async () => {
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
      expect(warn).toHaveBeenCalledWith("test:", expect.any(PostgresError));
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

    it("keeps an auth failure generic, since it is not a PostgresError", async () => {
      // `server/lib/auth.ts` extends `Error` on purpose so authorization
      // detail never becomes a client-visible sentence.
      const thrown = Object.assign(
        new Error("Authentication required: Please sign in or provide an API key"),
        { name: "AuthError" },
      );
      const response = await handleThrown(thrown);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
    });

    it("keeps a PostgresError with an unrenderable payload generic", async () => {
      const response = await handleThrown(forwarded({ code: "FIELD_CONFLICT" }));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
    });

    it("lets a route's own mapError win over the Postgres classification", async () => {
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
