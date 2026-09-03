import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposalReview: {
      reject: "changeProposalReview.reject",
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
}));

vi.mock("@server/convex/serverWriteCapability", () => ({
  getServerConvexWriteCapability: mocks.getServerConvexWriteCapability,
}));

function post(body: unknown, id = "cp_123") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function useClient(mutation: Mock) {
  const client = { query: vi.fn(), mutation };
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { adminKey: "admin-key", client },
  });
  return client;
}

describe("dev proposal reject route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("rejects with the trimmed note as the admin", async () => {
    const client = useClient(vi.fn(async () => ({ status: "rejected" })));

    const response = await POST(post({ note: "  Needs a source for the dosage table. " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: "rejected" });
    expect(client.mutation).toHaveBeenCalledWith("changeProposalReview.reject", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      proposalId: "cp_123",
      note: "Needs a source for the dosage table.",
    });
  });

  it("returns 400 on an empty note without calling Convex", async () => {
    const client = useClient(vi.fn());

    for (const body of [{ note: "" }, { note: "   " }, {}]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Rejecting a proposal needs a note for the editor.",
      });
    }
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor before calling Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const client = useClient(vi.fn());

    const response = await POST(post({ note: "no" }));

    expect(response.status).toBe(403);
    expect(client.mutation).not.toHaveBeenCalled();
  });
});
