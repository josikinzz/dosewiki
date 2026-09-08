import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    siteConfig: { saveBannerDisplay: "siteConfig.saveBannerDisplay" },
    warningBanners: { listPresets: "warningBanners.listPresets" },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const convexMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: convexMocks.getServerConvexWriteCapability,
}));

function saveRequest(body: unknown) {
  return new Request("https://dose.wiki/api/dev/warning-banner/display", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "editor@example.com", name: "Editor" }),
  );
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: convexMocks.query, mutation: convexMocks.mutation },
      adminKey: "admin-key",
    },
  });
  convexMocks.query.mockResolvedValue([]);
});

describe("banner display route", () => {
  it("refuses a signed-out caller before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(401);
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor session with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.query).not.toHaveBeenCalled();
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("stores the size and echoes what Convex actually kept", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 56 });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, iconSize: 56 });
    expect(convexMocks.mutation).toHaveBeenCalledWith("siteConfig.saveBannerDisplay", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      iconSize: 56,
    });
  });

  it("clamps an out-of-range but legal number rather than rejecting it", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 72 });
    const { POST } = await import("./route");

    await POST(saveRequest({ iconSize: 400 }));

    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "siteConfig.saveBannerDisplay",
      expect.objectContaining({ iconSize: 72 }),
    );
  });

  it("rejects a payload that is not a finite number instead of writing the default", async () => {
    const { POST } = await import("./route");

    for (const body of [{ iconSize: "56" }, { iconSize: null }, {}]) {
      const response = await POST(saveRequest(body));
      expect(response.status).toBe(400);
    }

    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  // A global size change stales every article showing any banner. The banner
  // identity drops the shared preset list, but each article holds its own ISR
  // entry under `revalidate = 3600`, so without the per-article identities
  // readers keep the old glyph size for up to an hour.
  it("publishes the banner setting and every article covered by an enabled preset", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 30 });
    convexMocks.query.mockResolvedValue([
      { key: "opioid", enabled: true, enabledSlugs: ["heroin", "fentanyl"] },
      { key: "benzo", enabled: true, enabledSlugs: ["fentanyl", "diazepam"] },
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    await POST(saveRequest({ iconSize: 30 }));

    expect(convexMocks.query).toHaveBeenCalledWith("warningBanners.listPresets", {});
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [
        { kind: "banners" },
        { kind: "article", slug: "heroin" },
        { kind: "article", slug: "fentanyl" },
        { kind: "article", slug: "diazepam" },
      ],
      source: "manual",
    });
  });

  it("still publishes the banner setting when no preset is enabled", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 44 });
    convexMocks.query.mockResolvedValue([
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 44 }));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "banners" }],
      source: "manual",
    });
  });
});
