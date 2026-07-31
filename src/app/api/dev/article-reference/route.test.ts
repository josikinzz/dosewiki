import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    substanceIndex: { appendArticleReference: "substanceIndex.appendArticleReference" },
  },
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

/**
 * Typed loosely on purpose: these stand in for two different result shapes
 * apiece — an allowed session and a refusal that carries its own response.
 */
const authMocks = vi.hoisted(() => ({
  requireEditorSession: vi.fn(async (): Promise<unknown> => null),
  enforceRateLimit: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireEditorSession: authMocks.requireEditorSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: authMocks.enforceRateLimit,
}));

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

/** How the Convex HTTP client rebuilds a thrown `ConvexError` on this side. */
function forwarded(data: unknown) {
  const error = new ConvexError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

function addRequest(body: Record<string, unknown>) {
  return new Request("https://dose.wiki/api/dev/article-reference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function doiRequest() {
  return addRequest({ slug: "2c-b", source: "10.1000/example", title: "An example study" });
}

describe("article reference route", () => {
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
    authMocks.enforceRateLimit.mockResolvedValue(null);
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
  });

  it("derives the reference server-side and never takes the client's word for support status", async () => {
    mocks.mutation.mockImplementation(async (_name: string, args: { reference: unknown }) => ({
      slug: "2c-b",
      created: true,
      reference: args.reference,
    }));
    const { POST } = await import("./route");

    const response = await POST(
      addRequest({
        slug: "2c-b",
        source: "10.1000/example",
        title: "An example study",
        authors: ["Author One", "Author Two"],
        year: "2024",
        // Neither of these may reach Convex: the route builds the reference.
        id: "attacker-chosen",
        supportStatus: "inspected",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      slug: "2c-b",
      created: true,
      reference: {
        id: "doi-10-1000-example",
        type: "journal_article",
        title: "An example study",
        authors: ["Author One", "Author Two"],
        year: 2024,
        doi: "10.1000/example",
        sourceType: "primary_literature",
        supportStatus: "needs_review",
      },
    });
  });

  it("enforces the editor session and the small-write rate limit", async () => {
    mocks.mutation.mockResolvedValue({ slug: "2c-b", created: true, reference: { id: "x" } });
    const { POST } = await import("./route");

    await POST(doiRequest());

    expect(authMocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "editorSmallWrite",
    );
    expect(authMocks.requireEditorSession).toHaveBeenCalled();
  });

  it("does not reach Convex when the session is not an editor's", async () => {
    authMocks.requireEditorSession.mockResolvedValue({
      ok: false,
      response: new Response("Forbidden", { status: 403 }),
    });
    const { POST } = await import("./route");

    const response = await POST(doiRequest());

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("reports an idempotent re-add as an unchanged article", async () => {
    mocks.mutation.mockResolvedValue({
      slug: "2c-b",
      created: false,
      reference: { id: "doi-10-1000-example", title: "The stored title" },
    });
    const { POST } = await import("./route");
    const { revalidateTag } = await import("next/cache");

    const response = await POST(doiRequest());

    expect(await response.json()).toMatchObject({ created: false });
    // Nothing changed, so nothing is invalidated.
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("forwards a deliberate Convex refusal verbatim", async () => {
    mocks.mutation.mockRejectedValue(
      forwarded({ code: "ARTICLE_NOT_FOUND", message: 'No substance found for slug "2c-b".' }),
    );
    const { POST } = await import("./route");

    const response = await POST(doiRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'No substance found for slug "2c-b".',
      code: "ARTICLE_NOT_FOUND",
    });
  });

  it("keeps a function missing from the deployment generic", async () => {
    mocks.mutation.mockRejectedValue(
      new Error('Could not find public function for "substanceIndex:appendArticleReference"'),
    );
    const { POST } = await import("./route");

    const response = await POST(doiRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to add that source right now." });
    expect(console.error).toHaveBeenCalled();
  });

  it("rejects a malformed request before reaching Convex", async () => {
    const { POST } = await import("./route");

    const missingSource = await POST(addRequest({ slug: "2c-b", source: "   " }));
    expect(missingSource.status).toBe(400);

    const badSlug = await POST(addRequest({ slug: "Not A Slug", source: "10.1000/example" }));
    expect(badSlug.status).toBe(400);

    const badAuthors = await POST(
      addRequest({ slug: "2c-b", source: "10.1000/example", authors: "Author One" }),
    );
    expect(badAuthors.status).toBe(400);

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("requires a title when the pasted source cannot supply one", async () => {
    const { POST } = await import("./route");

    // A bare URL detects as a webpage but names nothing; a source without a
    // title would render as an empty footnote.
    const response = await POST(
      addRequest({ slug: "2c-b", source: "https://example.test/paper" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A title is required for this source.",
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
