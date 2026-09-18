import type * as NextCache from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    warningBanners: {
      listEditorPresets: "warningBanners.listEditorPresets",
      upsertPreset: "warningBanners.upsertPreset",
      removePreset: "warningBanners.removePreset",
    },
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

const presetBody = {
  action: "publish",
  scope: "preset",
  baseHash: "a".repeat(64),
  changeId: "warning-change",
  key: "opioid",
  tone: "danger",
  icon: "lucide:skull",
  severityLabel: "High risk",
  headline: "Opioids can stop your breathing.",
  points: ["Never use alone."],
  enabled: true,
  allSubstances: false,
  enabledSlugs: ["heroin"],
};

function jsonRequest(method: "POST" | "DELETE", body: unknown) {
  return new Request("https://dose.wiki/api/dev/warning-banner", {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
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

describe("warning banner preset route", () => {
  it("refuses an editor session with 403 on both verbs before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const saved = await POST(jsonRequest("POST", presetBody));
    const removed = await DELETE(jsonRequest("DELETE", { key: "opioid" }));

    expect(saved.status).toBe(403);
    expect(removed.status).toBe(403);
    expect(dataMocks.query).not.toHaveBeenCalled();
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("invalidates current and removed article pages while reporting remote publication pending", async () => {
    dataMocks.mutation.mockResolvedValue({
      updated: true,
      key: "opioid",
      allSubstances: false,
      enabledSlugs: ["heroin"],
      affectedSlugs: ["heroin", "removed-article"],
    });

    const response = await POST(jsonRequest("POST", presetBody));

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("data-public:banners", { expire: 0 });
    for (const slug of ["heroin", "removed-article"]) {
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${slug}`);
      expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/zh/${slug}`);
    }
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalledWith("/", "layout");
    expect(await response.json()).toMatchObject({ publication: { status: "pending" } });
  });

  it("expires the root layout for a preset that covers every substance", async () => {
    dataMocks.mutation.mockResolvedValue({
      updated: true,
      key: "opioid",
      allSubstances: true,
      enabledSlugs: [],
      affectedSlugs: ["heroin"],
    });

    const response = await POST(
      jsonRequest("POST", { ...presetBody, allSubstances: true, enabledSlugs: [] }),
    );

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("data-public:banners", { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("invalidates the banner cache and articles that lose a deleted preset", async () => {
    dataMocks.mutation.mockResolvedValue({
      removed: true,
      key: "opioid",
      allSubstances: false,
      affectedSlugs: ["heroin"],
    });

    const response = await DELETE(
      jsonRequest("DELETE", {
        key: "opioid",
        scope: "preset",
        baseHash: "a".repeat(64),
        changeId: "warning-change",
      }),
    );

    expect(response.status).toBe(200);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("data-public:banners", { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/heroin");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/zh/heroin");
    expect(await response.json()).toMatchObject({ publication: { status: "pending" } });
  });

  it("rejects missing revision guards without writing or invalidating caches", async () => {
    const saved = await POST(jsonRequest("POST", { ...presetBody, baseHash: undefined }));
    const removed = await DELETE(jsonRequest("DELETE", { key: "opioid" }));

    expect(saved.status).toBe(400);
    expect(removed.status).toBe(400);
    expect(dataMocks.mutation).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

});
