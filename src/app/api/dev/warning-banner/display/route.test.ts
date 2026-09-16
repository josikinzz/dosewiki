import type * as NextCache from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    siteConfig: { saveBannerDisplay: "siteConfig.saveBannerDisplay" },
    warningBanners: { listPresets: "warningBanners.listPresets" },
  },
}));

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
}));

vi.mock("@server/data/publicLibrary", () => ({
  invalidatePublicDerivedDataCache: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const dataMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
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
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: dataMocks.query, mutation: dataMocks.mutation },
      adminKey: "admin-key",
    },
  });
  dataMocks.query.mockResolvedValue([]);
});

describe("banner display route", () => {
  it("refuses a signed-out caller before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(401);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor session with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 56 }));

    expect(response.status).toBe(403);
    expect(dataMocks.query).not.toHaveBeenCalled();
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("clamps an out-of-range but legal number rather than rejecting it", async () => {
    dataMocks.mutation.mockResolvedValue({ iconSize: 72 });
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 400 }));

    expect(response.status).toBe(200);
    expect(dataMocks.mutation.mock.calls[0][1].iconSize).toBe(72);
  });

  it("rejects a payload that is not a finite number instead of writing the default", async () => {
    const { POST } = await import("./route");

    for (const body of [{ iconSize: "56" }, { iconSize: null }, {}]) {
      const response = await POST(saveRequest(body));
      expect(response.status).toBe(400);
    }

    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  // A global size change stales every article showing any banner. The banner
  // identity drops the shared preset list, but each article holds its own ISR
  // entry under `revalidate = 3600`, so without the per-article identities
  // readers keep the old glyph size for up to an hour.
  it("invalidates current and mirror articles only for the deduplicated enabled presets", async () => {
    dataMocks.mutation.mockResolvedValue({ iconSize: 30 });
    dataMocks.query.mockResolvedValue([
      { key: "opioid", enabled: true, enabledSlugs: ["heroin", "fentanyl"] },
      { key: "benzo", enabled: true, enabledSlugs: ["fentanyl", "diazepam"] },
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 30 }));

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("data-public:banners", { expire: 0 });
    expect(cacheMocks.revalidatePath.mock.calls).toEqual([
      ["/heroin"], ["/zh/heroin"],
      ["/fentanyl"], ["/zh/fentanyl"],
      ["/diazepam"], ["/zh/diazepam"],
    ]);
  });

  it("invalidates only the banner cache when no preset is enabled", async () => {
    dataMocks.mutation.mockResolvedValue({ iconSize: 44 });
    dataMocks.query.mockResolvedValue([
      { key: "draft", enabled: false, enabledSlugs: ["mescaline"] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(saveRequest({ iconSize: 44 }));

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag.mock.calls).toEqual([
      ["data-public:banners", { expire: 0 }],
    ]);
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });
});
