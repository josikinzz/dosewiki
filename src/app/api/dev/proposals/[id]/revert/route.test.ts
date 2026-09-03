import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposalReview: {
      revert: "changeProposalReview.revert",
    },
  },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  getServerConvexWriteCapability: vi.fn(),
  revalidateSavedPaths: vi.fn(),
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

vi.mock("../../../../save-to-convex/revalidateSavedPaths", () => ({
  revalidateSavedPaths: mocks.revalidateSavedPaths,
}));

function post(id = "cp_123") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/revert`, { method: "POST" });
}

function useClient(mutation: Mock) {
  const client = { query: vi.fn(), mutation };
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { adminKey: "admin-key", client },
  });
  return client;
}

describe("dev proposal revert route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.revalidateSavedPaths.mockReset();
  });

  it("reverts as the admin and revalidates the paths the write-back reported", async () => {
    const client = useClient(vi.fn(async () => ({ status: "reverted", revalidatePaths: ["/lsd", "/substances"] })));

    const response = await POST(post());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "reverted",
      revalidatedPaths: ["/lsd", "/substances"],
    });
    expect(client.mutation).toHaveBeenCalledWith("changeProposalReview.revert", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      proposalId: "cp_123",
    });
    expect(mocks.revalidateSavedPaths).toHaveBeenCalledWith(["/lsd", "/substances"], "proposal-revert");
  });

  it("surfaces a revert conflict as 409 without revalidating", async () => {
    useClient(
      vi.fn(async () => {
        throw new ConvexError({ code: "REVERT_CONFLICT", message: 'Production changed: article "lsd".' });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(post());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "REVERT_CONFLICT",
      error: 'Production changed: article "lsd".',
    });
    expect(mocks.revalidateSavedPaths).not.toHaveBeenCalled();
  });

  it("refuses an editor before calling Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const client = useClient(vi.fn());

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(client.mutation).not.toHaveBeenCalled();
    expect(mocks.revalidateSavedPaths).not.toHaveBeenCalled();
  });
});
