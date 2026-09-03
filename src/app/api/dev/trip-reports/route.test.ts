import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

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

beforeEach(() => {
  vi.resetModules();
  mocks.requireRoleSession.mockReset().mockResolvedValue(editorSession);
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockResolvedValue([]);
  mocks.mutation.mockReset().mockResolvedValue({ updated: true, slug: "alpine-clarity" });
  mocks.revalidatePath.mockReset();
  mocks.getServerConvexWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: mocks.query, mutation: mocks.mutation },
    },
  });
});

describe("dev trip report corpus route", () => {
  it("requires an editor session and reads under the diagnostic limit", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports"));

    expect(mocks.requireRoleSession).toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(response.status).toBe(200);
  });

  it("refuses a non-editor without touching Convex", async () => {
    mocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Editor access required" }), { status: 403 }),
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports"));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("forwards the signed-in editor as the Convex actor", async () => {
    const { GET } = await import("./route");
    await GET(new Request("https://dose.wiki/api/dev/trip-reports"));

    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: "scoped-token", actorEmail: "editor@example.com" }),
    );
  });
});

describe("dev trip report record route", () => {
  function postRequest(body: unknown): Request {
    return new Request("https://dose.wiki/api/dev/trip-reports/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("requires an editor session and writes under the small-write limit", async () => {
    const { POST } = await import("./record/route");

    const response = await POST(
      postRequest({ mode: "save", id: "report-1", expected: reportFields, updates: reportFields }),
    );

    expect(mocks.requireRoleSession).toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "editorSmallWrite");
    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalled();
  });

  it("refuses a non-editor without touching Convex", async () => {
    mocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Editor access required" }), { status: 403 }),
    });

    const { POST } = await import("./record/route");
    const response = await POST(postRequest({ mode: "delete", id: "report-1" }));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects a body that names no supported mode", async () => {
    const { POST } = await import("./record/route");
    const response = await POST(postRequest({ mode: "publish", id: "report-1" }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("normalizes the snapshot before comparing, so trailing whitespace is not a conflict", async () => {
    const { POST } = await import("./record/route");
    await POST(
      postRequest({
        mode: "save",
        id: "report-1",
        expected: { ...reportFields, title: "  Alpine clarity  " },
        updates: reportFields,
      }),
    );

    const [, args] = mocks.mutation.mock.calls[0];
    expect(args.expected.title).toBe("Alpine clarity");
  });

  it("omits the profile key entirely when the editor did not touch it", async () => {
    const { POST } = await import("./record/route");
    await POST(
      postRequest({ mode: "save", id: "report-1", expected: reportFields, updates: reportFields }),
    );

    const [, args] = mocks.mutation.mock.calls[0];
    expect(args.profileKey).toBeUndefined();
  });

  it("relays a byline claim refusal as a 409 rather than a generic failure", async () => {
    mocks.mutation.mockRejectedValue(
      new Error('Author name "nervewing" matches contributor profile "NERVEWING".'),
    );

    const { POST } = await import("./record/route");
    const response = await POST(
      postRequest({ mode: "save", id: "report-1", expected: reportFields, updates: reportFields }),
    );

    expect(response.status).toBe(409);
  });

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
});
