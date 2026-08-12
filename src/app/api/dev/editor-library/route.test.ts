import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireEditorSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: mocks.requireEditorSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

const editorSession = {
  ok: true as const,
  session: { user: { email: "editor@example.com", name: "Editor" } },
  role: "editor",
};

function queriedNames(): string {
  return mocks.query.mock.calls
    .map(([reference]) => getFunctionName(reference as never))
    .join(" ");
}

beforeEach(() => {
  vi.resetModules();
  mocks.requireEditorSession.mockReset().mockResolvedValue(editorSession);
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockResolvedValue({ page: [], continueCursor: "", isDone: true });
  mocks.getServerConvexWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: mocks.query },
    },
  });
});

describe("dev editor library route", () => {
  it("requires an editor session and reads under the diagnostic limit", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/editor-library"));

    expect(mocks.requireEditorSession).toHaveBeenCalled();
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(response.status).toBe(200);
  });

  it("drains the slim list projection by default", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/editor-library"));

    expect(await response.json()).toMatchObject({ ok: true, scope: "list", articles: [] });
    // The default drain must never be the whole-article projection: that is the
    // 16.7 MB read this route exists to stop paying on every tab.
    expect(queriedNames()).toContain("getEditorLibraryPage");
    expect(queriedNames()).not.toContain("getEditorPage");
  });

  it("drains whole articles only when a caller asks for the full scope", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/editor-library?scope=full"),
    );

    expect(await response.json()).toMatchObject({ ok: true, scope: "full" });
    expect(queriedNames()).toContain("getEditorPage");
  });

  it("hydrates one article by slug, carrying the id fallback", async () => {
    mocks.query.mockResolvedValue({ slug: "lsd", title: "LSD" });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/editor-library?slug=lsd&id=282"),
    );

    expect(await response.json()).toMatchObject({
      ok: true,
      scope: "article",
      article: { slug: "lsd" },
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: "lsd", id: 282, apiKey: "scoped-token" }),
    );
  });

  it("404s a slug the corpus does not hold", async () => {
    mocks.query.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/editor-library?slug=not-a-substance"),
    );

    expect(response.status).toBe(404);
  });
});
