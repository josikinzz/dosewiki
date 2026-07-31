import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { substanceIndex: { setEditorialReview: "substanceIndex.setEditorialReview" } },
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

function tickRequest() {
  return new Request("https://dose.wiki/api/dev/editorial-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "2c-b", status: "completed" }),
  });
}

describe("editorial review route failure reporting", () => {
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

  it("names the reason a deliberate rejection gave", async () => {
    const error = new ConvexError("Server Error");
    (error as { data: unknown }).data = {
      code: "ARTICLE_NOT_FOUND",
      message: 'No substance found for slug "2c-b".',
    };
    mocks.mutation.mockRejectedValue(error);
    const { POST } = await import("./route");

    const response = await POST(tickRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'No substance found for slug "2c-b".',
      code: "ARTICLE_NOT_FOUND",
    });
  });

  it("keeps an internal failure generic", async () => {
    mocks.mutation.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:3210"));
    const { POST } = await import("./route");

    const response = await POST(tickRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Unable to update the review status right now.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
