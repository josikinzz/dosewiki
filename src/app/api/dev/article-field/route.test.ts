import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EDITABLE_FIELD_CONFLICT_REASON } from "../../../../../convex/lib/articleFieldWrites";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { substanceIndex: { setArticleField: "substanceIndex.setArticleField" } },
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
