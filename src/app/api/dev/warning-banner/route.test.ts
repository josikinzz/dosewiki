import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    warningBanners: {
      listPresets: "warningBanners.listPresets",
      upsertPreset: "warningBanners.upsertPreset",
      removePreset: "warningBanners.removePreset",
    },
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

const presetBody = {
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
    headers: { "Content-Type": "application/json" },
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
  convexMocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: convexMocks.query, mutation: convexMocks.mutation },
      adminKey: "admin-key",
    },
  });
  convexMocks.query.mockResolvedValue([]);
});

describe("warning banner preset route", () => {
  it("refuses an editor session with 403 on both verbs before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const saved = await POST(jsonRequest("POST", presetBody));
    const removed = await DELETE(jsonRequest("DELETE", { key: "opioid" }));

    expect(saved.status).toBe(403);
    expect(removed.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(convexMocks.query).not.toHaveBeenCalled();
    expect(convexMocks.mutation).not.toHaveBeenCalled();
  });

  it("saves a preset as the admin actor and revalidates the touched articles", async () => {
    convexMocks.mutation.mockResolvedValue({
      updated: true,
      key: "opioid",
      allSubstances: false,
      enabledSlugs: ["heroin"],
    });

    const response = await POST(jsonRequest("POST", presetBody));

    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledWith(
      "warningBanners.upsertPreset",
      expect.objectContaining({
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        key: "opioid",
        updatedBy: "admin@example.com",
      }),
    );
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith("convex-public:banners", { expire: 0 });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/heroin");
  });

  it("removes a preset as the admin actor", async () => {
    convexMocks.mutation.mockResolvedValue({ removed: true, key: "opioid" });

    const response = await DELETE(jsonRequest("DELETE", { key: "opioid" }));

    expect(response.status).toBe(200);
    expect(convexMocks.mutation).toHaveBeenCalledWith("warningBanners.removePreset", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      key: "opioid",
    });
  });
});
