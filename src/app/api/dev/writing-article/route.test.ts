import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    effectIndexArticles: {
      upsertArticle: "effectIndexArticles.upsertArticle",
      getForEditor: "effectIndexArticles.getForEditor",
      listForEditor: "effectIndexArticles.listForEditor",
    },
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

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

import { POST } from "./route";

const SAVE = {
  slug: "field-guide",
  expectedRevision: "a".repeat(64),
  operationId: "11111111-1111-4111-8111-111111111111",
  bodyFormat: "markdown",
  kind: "article",
  status: "draft",
  title: "Field guide",
  teaser: "",
  coverImageUrl: "",
  body: "A body.",
  tags: [],
  authorProfileKeys: [],
};

function saveRequest(overrides: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/writing-article", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ ...SAVE, ...overrides }),
  });
}

describe("writing article route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
  });

  it("refuses an editor saving a row with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const response = await POST(saveRequest({}));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});

describe("writing article route rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    mocks.mutation.mockResolvedValue({ slug: "field-guide", created: false });
  });

  it("publishes the writing-articles identity so both public deployments refresh", async () => {
    const response = await POST(saveRequest({}));

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "writing-articles" }],
      source: "manual",
    });
  });


  it("rejects an original slug that is not a string before reaching Convex", async () => {
    const response = await POST(saveRequest({ originalSlug: 42 }));

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects an original slug outside the slug grammar before reaching Convex", async () => {
    for (const originalSlug of ["Field Notes", "field--notes", "../field-notes", "field_notes"]) {
      const response = await POST(saveRequest({ originalSlug }));

      expect(response.status).toBe(400);
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });


  it("delivers a rename collision verbatim so the editor can pick another slug", async () => {
    // The Convex HTTP client rebuilds a thrown `ConvexError` with its payload
    // on `data`, which is what the constructor does with an object argument.
    mocks.mutation.mockRejectedValue(
      new ConvexError({
        code: "SLUG_TAKEN",
        message: '"field-guide" already belongs to "Field guide (old)". Choose another slug.',
      }),
    );

    const response = await POST(saveRequest({ originalSlug: "field-notes" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: '"field-guide" already belongs to "Field guide (old)". Choose another slug.',
      code: "SLUG_TAKEN",
    });
  });

  it("reports a renamed row that vanished as missing", async () => {
    mocks.mutation.mockRejectedValue(
      new ConvexError({
        code: "ARTICLE_NOT_FOUND",
        message: 'No article found for slug "field-notes".',
      }),
    );

    const response = await POST(saveRequest({ originalSlug: "field-notes" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'No article found for slug "field-notes".',
      code: "ARTICLE_NOT_FOUND",
    });
  });

});
