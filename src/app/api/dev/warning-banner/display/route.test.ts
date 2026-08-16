import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../convex/_generated/api", () => ({
  api: {
    siteConfig: { saveBannerDisplay: "siteConfig.saveBannerDisplay" },
    warningBanners: { listPresets: "warningBanners.listPresets" },
  },
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
}));

vi.mock("@server/convex/publicData", () => ({
  PUBLIC_CONVEX_CACHE_TAGS: { banners: "convex-public:banners" },
}));

const authMocks = vi.hoisted(() => ({ requireEditorSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: authMocks.requireEditorSession,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireEditorSession.mockResolvedValue({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  });
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
  it("refuses a non-editor before touching Convex", async () => {
    authMocks.requireEditorSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Editor session required." }, { status: 401 }),
    });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(401);
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

  // A global size change stales every article showing any banner. The tag drops
  // the shared preset list, but each article holds its own ISR entry under
  // `revalidate = 3600`, so without the per-path sweep readers keep the old
  // glyph size for up to an hour.
  it("revalidates the banners tag and every article covered by an enabled preset", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 30 });
    convexMocks.query.mockResolvedValue([
      { key: "opioid", enabled: true, enabledSlugs: ["heroin", "fentanyl"] },
      { key: "benzo", enabled: true, enabledSlugs: ["fentanyl", "diazepam"] },
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    await POST(saveRequest({ iconSize: 30 }));

    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public:banners", { expire: 0 });
    expect(convexMocks.query).toHaveBeenCalledWith("warningBanners.listPresets", {});
    expect(cacheMocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/heroin",
      "/fentanyl",
      "/diazepam",
    ]);
  });

  it("still revalidates the tag when no preset is enabled", async () => {
    convexMocks.mutation.mockResolvedValue({ iconSize: 44 });
    convexMocks.query.mockResolvedValue([
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 44 }));

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public:banners", { expire: 0 });
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
