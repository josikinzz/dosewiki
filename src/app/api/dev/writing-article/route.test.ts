import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: vi.fn(async () => ({
    ok: true,
    session: { user: { email: "editor@example.com", name: "Editor" } },
    role: "editor",
  })),
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...SAVE, ...overrides }),
  });
}

describe("writing article route rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    mocks.mutation.mockResolvedValue({ slug: "field-guide", created: false });
  });

  it("forwards the loaded row's slug so the mutation renames instead of inserting", async () => {
    const response = await POST(saveRequest({ originalSlug: "field-notes" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, slug: "field-guide", created: false });
    expect(mocks.mutation).toHaveBeenCalledWith(
      "effectIndexArticles.upsertArticle",
      expect.objectContaining({ slug: "field-guide", originalSlug: "field-notes" }),
    );
  });

  it("sends no original slug for a new row", async () => {
    await POST(saveRequest({}));

    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ originalSlug: undefined });
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
      expect(await response.json()).toEqual({
        error: "The original slug must be a valid slug: lowercase letters, digits and single hyphens.",
      });
    }
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("treats a blank original slug as a new row", async () => {
    await POST(saveRequest({ originalSlug: "  " }));

    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({ originalSlug: undefined });
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

  it("writes the kind the editor sent, never the tab it was sent from", async () => {
    // A blog post opened from the Writing tab saves as a blog post: the route
    // has no notion of the tab and must not normalize kind on the way through.
    await POST(saveRequest({ kind: "blog", originalSlug: "field-guide" }));

    expect(mocks.mutation.mock.calls[0][1]).toMatchObject({
      slug: "field-guide",
      originalSlug: "field-guide",
      kind: "blog",
    });
  });
});
