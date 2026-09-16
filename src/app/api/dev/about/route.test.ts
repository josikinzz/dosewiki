import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    siteConfig: {
      saveAbout: "siteConfig.saveAbout",
    },
  },
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

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

import { POST } from "./route";

const SAVE = {
  aboutMarkdown: "# Mission\n\nWe index {{compoundCount}} compounds.",
  aboutSubtitle: "An open substance library.",
  founderProfileKeys: ["josie", " sam ", "JOSIE"],
};

function saveRequest(body: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/about", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ expected: null, expectedRevision: 0, operationId: "about-fixture-operation", ...body }),
  });
}

describe("about route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    mocks.mutation.mockResolvedValue({ updated: true, id: "about-id", revision: 1, replayed: false, unchanged: false });
  });

  it("refuses an editor saving About with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(saveRequest(SAVE));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("saves the whole document through siteConfig.saveAbout and publishes the About identity", async () => {
    const response = await POST(saveRequest(SAVE));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      revision: 1, replayed: false, unchanged: false,
      about: {
        aboutMarkdown: SAVE.aboutMarkdown,
        aboutSubtitle: SAVE.aboutSubtitle,
        founderProfileKeys: ["JOSIE", "SAM"],
        revision: 1,
      },
    });
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "about" }],
      source: "manual",
    });
  });

  it("rejects a document missing its page copy before reaching Postgres", async () => {
    const response = await POST(saveRequest({ ...SAVE, aboutMarkdown: undefined }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "The page copy must be a string." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects founder keys that are not all strings", async () => {
    const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["josie", 42] }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects founder keys outside the contributor key grammar", async () => {
    for (const key of ["jo sie", "josie!", "jösie", "a".repeat(201)]) {
      const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["josie", key] }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Each founder key must be a contributor profile key: letters, digits, and hyphens only.",
      });
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("accepts hyphenated and numeric founder keys", async () => {
    const response = await POST(saveRequest({ ...SAVE, founderProfileKeys: ["kay-two", "rho2"] }));

    expect(response.status).toBe(200);
    expect((await response.json()).about.founderProfileKeys).toEqual(["KAY-TWO", "RHO2"]);
  });
});
