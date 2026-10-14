import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    replications: {
      updateEditorialFields: "replications.updateEditorialFields",
      bulkUpdateEditorialFields: "replications.bulkUpdateEditorialFields",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

vi.mock("@server/translation/segmentStore", () => ({
  enqueueTranslationJobs: vi.fn(async () => {}),
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

const snapshot = {
  title: "Drifting",
  artist: "Archive Artist",
  role: "replication",
  effect_slug: "drifting",
  credit_line: null,
  effect_tags: [],
};

function editorialRequest(body: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/replications/editorial", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

const singleEdit = {
  mode: "single",
  id: "replication-id",
  expected: snapshot,
  updates: { ...snapshot, title: "Drifting (revised)" },
};

const bulkEdit = {
  mode: "bulk",
  items: [{ id: "replication-id", expected: snapshot }],
  patch: { artist: "Renamed Artist" },
};

describe("replication editorial route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerDataWriteCapability.mockReturnValue({
      ok: true,
      capability: {
        client: { mutation: mocks.mutation },
        adminKey: "admin-key",
        getAdminIntentToken: vi.fn(() => "maintenance-token"),
      },
    });
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
  });

  it("refuses an editor's single edit with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(editorialRequest(singleEdit));

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("refuses an editor's bulk edit with 403 before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(editorialRequest(bulkEdit));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("answers 409 and publishes nothing when every bulk item is stale", async () => {
    mocks.mutation.mockResolvedValue({
      updated: 0,
      slugs: [],
      conflicts: [{ id: "replication-id", slug: "drifting-replication", reason: "Someone saved it after you loaded the studio." }],
    });

    const response = await POST(editorialRequest(bulkEdit));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      updated: 0,
      conflicts: [{ id: "replication-id" }],
    });
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("answers 409 and publishes nothing while every item still lacks a source", async () => {
    mocks.mutation.mockResolvedValue({
      updated: 0,
      slugs: [],
      published: [],
      conflicts: [{ id: "replication-id", slug: "drifting-replication", reason: "It needs a source before it can publish.", code: "incomplete" }],
    });

    const response = await POST(editorialRequest({ ...bulkEdit, patch: { publish: true } }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Nothing was published/),
    });
    expect(mocks.mutation).toHaveBeenCalledWith(
      "replications.bulkUpdateEditorialFields",
      expect.objectContaining({ publish: true }),
    );
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("refuses a bulk editorial change that names rows without expected values", async () => {
    const response = await POST(
      editorialRequest({ mode: "bulk", ids: ["replication-id"], artist: "Renamed Artist" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
