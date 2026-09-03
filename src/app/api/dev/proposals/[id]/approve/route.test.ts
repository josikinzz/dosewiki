import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposalReview: {
      approveAndApply: "changeProposalReview.approveAndApply",
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
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/approve`, { method: "POST" });
}

function useClient(mutation: Mock) {
  const client = { query: vi.fn(), mutation };
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { adminKey: "admin-key", client },
  });
  return client;
}

describe("dev proposal approve route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    mocks.getServerConvexWriteCapability.mockReset();
    mocks.revalidateSavedPaths.mockReset();
  });

  it("approves as the admin and revalidates the paths the apply reported", async () => {
    const client = useClient(vi.fn(async () => ({ status: "applied", revalidatePaths: ["/lsd", "/substances"] })));

    const response = await POST(post());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "applied",
      revalidatedPaths: ["/lsd", "/substances"],
    });
    expect(client.mutation).toHaveBeenCalledWith("changeProposalReview.approveAndApply", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      proposalId: "cp_123",
    });
    expect(mocks.revalidateSavedPaths).toHaveBeenCalledWith(["/lsd", "/substances"], "proposal-apply");
  });

  it("returns the conflict without revalidating when production drifted", async () => {
    useClient(vi.fn(async () => ({ status: "changes_requested", conflictReason: 'article "lsd" changed' })));

    const response = await POST(post());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "changes_requested",
      conflictReason: 'article "lsd" changed',
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

  it("maps a stale proposal to 409", async () => {
    useClient(
      vi.fn(async () => {
        throw new ConvexError({ code: "PROPOSAL_STATUS_INVALID", message: "A rejected proposal cannot become applied." });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(post());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PROPOSAL_STATUS_INVALID" });
  });
});
