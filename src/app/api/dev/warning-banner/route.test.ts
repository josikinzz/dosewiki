import type * as NextCache from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    warningBanners: {
      listEditorPresets: "warningBanners.listEditorPresets",
      upsertPreset: "warningBanners.upsertPreset",
      removePreset: "warningBanners.removePreset",
    },
  },
}));

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: cacheMocks.revalidatePath,
}));

const publishMocks = vi.hoisted(() => ({
  publishPublicCache: vi.fn(async () => [
    { target: "local", status: "accepted", attempts: 1 },
  ]),
}));

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

  it("publishes the banner setting and every touched article, removals included", async () => {
    convexMocks.mutation.mockResolvedValue({
      updated: true,
      key: "opioid",
      allSubstances: false,
      enabledSlugs: ["heroin"],
      affectedSlugs: ["heroin", "removed-article"],
    });

    const response = await POST(jsonRequest("POST", presetBody));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [
        { kind: "banners" },
        { kind: "article", slug: "heroin" },
        { kind: "article", slug: "removed-article" },
      ],
      source: "manual",
    });
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      publication: [{ target: "local", status: "accepted" }],
    });
  });

  it("expires the root layout for a preset that covers every substance", async () => {
    convexMocks.mutation.mockResolvedValue({
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
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "banners" }],
      source: "manual",
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("publishes the banner setting when a preset is deleted", async () => {
    convexMocks.mutation.mockResolvedValue({
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
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "banners" }, { kind: "article", slug: "heroin" }],
      source: "manual",
    });
  });

});
