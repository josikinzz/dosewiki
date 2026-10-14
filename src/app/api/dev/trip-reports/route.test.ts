import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
  publishPublicCache: vi.fn(async () => []),
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

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: mocks.publishPublicCache,
}));

const editorSession = {
  ok: true as const,
  session: { user: { email: "editor@example.com", name: "Editor" } },
  role: "editor",
};

const reportFields = {
  title: "Alpine clarity",
  subject: { name: "nervewing" },
  substances: [{ name: "Psilocybin" }],
  onset: [{ time: "T+0:30", description: "Cold air sharpens." }],
  peak: [],
  offset: [],
  tags: ["outdoors"],
};

/** How the Postgres HTTP client rebuilds a thrown `PostgresError` on this side. */
function forwarded(data: unknown) {
  const error = new PostgresError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

const contributor = { email: "owner@example.com", name: "Owner" };

beforeEach(() => {
  vi.resetModules();
  mocks.requireRoleSession.mockReset().mockResolvedValue(editorSession);
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockResolvedValue([]);
  mocks.mutation.mockReset().mockResolvedValue({ updated: true, slug: "alpine-clarity" });
  mocks.publishPublicCache.mockClear();
  mocks.getServerDataWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: mocks.query, mutation: mocks.mutation },
    },
  });
});

describe("dev trip report corpus route", () => {
  it("keeps the corpus index at the editor floor", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", contributor));

    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports"));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("dev trip report record route", () => {
  function postRequest(body: unknown): Request {
    return new Request("https://dose.wiki/api/dev/trip-reports/record", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
      body: JSON.stringify({ expectedRevision: "0".repeat(64), ...(body as Record<string, unknown>) }),
    });
  }

  it("relays a stale snapshot as a 409", async () => {
    mocks.mutation.mockRejectedValue(
      new Error("Trip report alpine-clarity changed since it was opened; reload the portal before saving."),
    );

    const { POST } = await import("./record/route");
    const response = await POST(
      postRequest({ mode: "save", id: "report-1", expected: reportFields, updates: reportFields }),
    );

    expect(response.status).toBe(409);
  });

  it("relays a NOT_OWNER refusal as a 403", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", contributor));
    mocks.mutation.mockRejectedValue(
      forwarded({ code: "NOT_OWNER", message: "You do not own trip report alpine-clarity." }),
    );

    const { POST } = await import("./record/route");
    const response = await POST(
      postRequest({ mode: "save", id: "report-1", expected: reportFields, updates: reportFields }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_OWNER" });
  });

  it("lets a contributor read a record and relays NOT_OWNER on the read as well", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", contributor));
    mocks.query.mockResolvedValueOnce({ id: "report-1", slug: "alpine-clarity", fields: reportFields });

    const { GET } = await import("./record/route");
    const ok = await GET(new Request("https://dose.wiki/api/dev/trip-reports/record?id=report-1"));
    expect(ok.status).toBe(200);

    mocks.query.mockRejectedValueOnce(forwarded({ code: "NOT_OWNER", message: "You do not own it." }));
    const refused = await GET(new Request("https://dose.wiki/api/dev/trip-reports/record?id=report-2"));
    expect(refused.status).toBe(403);
  });

  it("still refuses a contributor's delete before touching Postgres", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", contributor));

    const { POST } = await import("./record/route");
    const response = await POST(postRequest({ mode: "delete", id: "report-1" }));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

});
