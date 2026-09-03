import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { EDITABLE_FIELD_CONFLICT_REASON } from "../../../../../convex/lib/articleFieldWrites";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    substanceIndex: { setArticleField: "substanceIndex.setArticleField" },
    changelog: { addEntry: "changelog.addEntry" },
  },
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(roleSessionFor("editor")),
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

/** How the Convex HTTP client rebuilds a thrown `ConvexError` on this side. */
function forwarded(data: unknown) {
  const error = new ConvexError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

function editRequest() {
  return new Request("https://dose.wiki/api/dev/article-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: "2c-b",
      path: "dosage.routes[0].notes",
      value: "Corrected note.",
      expected: "Old note.",
    }),
  });
}

describe("article field route failure reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
  });

  it("delivers the stale-value conflict copy verbatim, at a status the client can branch on", async () => {
    mocks.mutation.mockRejectedValue(
      forwarded({ code: "FIELD_CONFLICT", message: EDITABLE_FIELD_CONFLICT_REASON }),
    );
    const { POST } = await import("./route");

    const response = await POST(editRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: EDITABLE_FIELD_CONFLICT_REASON,
      code: "FIELD_CONFLICT",
    });
  });

  it("reports a missing article as a missing article", async () => {
    mocks.mutation.mockRejectedValue(
      forwarded({ code: "ARTICLE_NOT_FOUND", message: 'No substance found for slug "2c-b".' }),
    );
    const { POST } = await import("./route");

    const response = await POST(editRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'No substance found for slug "2c-b".',
      code: "ARTICLE_NOT_FOUND",
    });
  });

  it("keeps a function missing from the deployment generic", async () => {
    // The symptom that opened this up: a mutation absent from production threw
    // a plain Error, which must never become client-visible text.
    mocks.mutation.mockRejectedValue(
      new Error('Could not find public function for "substanceIndex:setArticleField"'),
    );
    const { POST } = await import("./route");

    const response = await POST(editRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to save that edit right now." });
    expect(console.error).toHaveBeenCalled();
  });

  it("still rejects a malformed request before reaching Convex", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/dev/article-field", {
        method: "POST",
        body: JSON.stringify({ slug: "2c-b", path: "title", value: "x" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});

describe("article field route contribution history", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerConvexWriteCapability.mockReturnValue({
      ok: true,
      capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
    });
    mocks.mutation.mockImplementation(async (name: string) => {
      if (name === "substanceIndex.setArticleField") {
        return {
          slug: "2c-b",
          path: "dosage.routes[0].notes",
          value: "Corrected note.",
          id: 42,
          title: "2C-B",
        };
      }
      if (name === "changelog.addEntry") return { created: true, id: "entry-id" };
      throw new Error(`Unexpected mutation ${name}`);
    });
  });

  it("stamps the inline edit onto the editor's contribution history", async () => {
    const { POST } = await import("./route");

    const response = await POST(editRequest());

    expect(response.status).toBe(200);
    const entry = mocks.mutation.mock.calls.find(
      ([name]) => name === "changelog.addEntry",
    )?.[1] as {
      message: string;
      markdown: string;
      submittedBy: string;
      articles: Array<{ id: number; title: string; slug: string }>;
    };

    expect(entry.submittedBy).toBe("EDITOR");
    expect(entry.articles).toEqual([{ id: 42, title: "2C-B", slug: "2c-b" }]);
    expect(entry.message).toContain("dosage.routes[0].notes");
    expect(entry.markdown).toContain("- Old note.");
    expect(entry.markdown).toContain("+ Corrected note.");
  });

  it("invalidates the cached contribution feed the new row belongs to", async () => {
    const { POST } = await import("./route");
    const { revalidateTag } = await import("next/cache");

    await POST(editRequest());

    expect(revalidateTag).toHaveBeenCalledWith("convex-public:changelog", { expire: 0 });
  });

  it("keeps a saved edit successful when the history row cannot be written", async () => {
    mocks.mutation.mockImplementation(async (name: string) => {
      if (name === "substanceIndex.setArticleField") {
        return {
          slug: "2c-b",
          path: "dosage.routes[0].notes",
          value: "Corrected note.",
          id: 42,
          title: "2C-B",
        };
      }
      throw new Error("changelog is down");
    });
    const { POST } = await import("./route");

    const response = await POST(editRequest());

    // The field write already landed in Convex; reporting a failure here would
    // invite the reviewer to make the same edit twice.
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, slug: "2c-b" });
    expect(console.warn).toHaveBeenCalled();
  });
});
