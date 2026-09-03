import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { substanceIndex: { setEditorialReview: "substanceIndex.setEditorialReview" } },
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: authMocks.requireRoleSession }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: authMocks.enforceRateLimit }));

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  getServerConvexWriteCapability: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

function tickRequest(status: "needed" | "in_progress" | "completed" = "completed") {
  return new Request("https://dose.wiki/api/dev/editorial-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "2c-b", status }),
  });
}

function flagRequest(flag: unknown) {
  return new Request("https://dose.wiki/api/dev/editorial-review", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add-flag", slug: "2c-b", flag }),
  });
}

describe("editorial review route failure reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    authMocks.enforceRateLimit.mockResolvedValue(null);
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

  it("does not reach Convex when the session is not an editor's", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const { POST } = await import("./route");
    const response = await POST(tickRequest("in_progress"));
    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor marking a review completed with 403 before touching Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const { POST } = await import("./route");
    const response = await POST(tickRequest("completed"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Admin access required." });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("lets an editor move a review to in_progress", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    mocks.mutation.mockResolvedValue({ slug: "2c-b", editorial_review: { status: "in_progress", notes: "" } });
    const { POST } = await import("./route");
    const response = await POST(tickRequest("in_progress"));
    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith("substanceIndex.setEditorialReview", {
      apiKey: "admin-key",
      actorEmail: "editor@example.com",
      slug: "2c-b",
      status: "in_progress",
    });
  });

  it("lets an admin mark a review completed", async () => {
    mocks.mutation.mockResolvedValue({ slug: "2c-b", editorial_review: { status: "completed", notes: "" } });
    const { POST } = await import("./route");
    const response = await POST(tickRequest("completed"));
    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith("substanceIndex.setEditorialReview", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      slug: "2c-b",
      status: "completed",
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

  it("rejects malformed labels before calling Convex", async () => {
    const { POST } = await import("./route");
    const response = await POST(flagRequest({ label: "this label has too many words", severity: "minor", note: "" }));
    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects malformed severities before calling Convex", async () => {
    const { POST } = await import("./route");
    const response = await POST(flagRequest({ label: "skinny", severity: "blocking", note: "" }));
    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
