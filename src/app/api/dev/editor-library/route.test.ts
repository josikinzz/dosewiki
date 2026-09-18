import { getFunctionName } from "@server/postgres/runtime/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
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

function queriedNames(): string {
  return mocks.query.mock.calls
    .map(([reference]) => getFunctionName(reference as never))
    .join(" ");
}

beforeEach(() => {
  vi.resetModules();
  mocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockResolvedValue({ page: [], continueCursor: "", isDone: true });
  mocks.getServerDataWriteCapability.mockReset().mockReturnValue({
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

    expect(mocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "diagnosticRead");
    expect(response.status).toBe(200);
  });

  it("drains the slim list projection by default", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("https://dose.wiki/api/dev/editor-library"));

    expect(await response.json()).toMatchObject({ ok: true, scope: "list", articles: [] });
    // The default drain must never be a whole-article projection: that is the
    // 16.7 MB read this route exists to stop paying on every tab.
    expect(queriedNames()).toContain("getEditorLibraryPage");
    expect(queriedNames()).not.toContain("getEditorBySlug");
  });

  it("drains the tag-registry projection under its own scope", async () => {
    mocks.query.mockResolvedValue({
      page: [{ slug: "lsd", title: "LSD" }],
      continueCursor: "",
      isDone: true,
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/editor-library?scope=tag-registry"),
    );

    expect(await response.json()).toMatchObject({
      ok: true,
      scope: "tag-registry",
      entries: [{ slug: "lsd" }],
    });
    expect(queriedNames()).toContain("getTagRegistryPage");
    expect(queriedNames()).not.toContain("getEditorPage");
    expect(queriedNames()).not.toContain("getEditorLibraryPage");
  });

  it("rejects an unknown scope instead of falling through to the list drain", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://dose.wiki/api/dev/editor-library?scope=full"),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("list");
    expect(body.error).toContain("tag-registry");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["list", "tag-registry"])(
    "fails the %s drain loudly when the page cap runs out before the cursor is done",
    async (scope) => {
      mocks.query.mockResolvedValue({
        page: [{ slug: "lsd" }],
        continueCursor: "next",
        isDone: false,
      });
      const { GET } = await import("./route");

      const response = await GET(
        new Request(`https://dose.wiki/api/dev/editor-library?scope=${scope}`),
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain("200 pages");
      expect(mocks.query).toHaveBeenCalledTimes(200);
    },
  );

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
