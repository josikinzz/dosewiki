import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  describeRoleFloor,
  grantWriteCapability,
  installProtectedRouteMocks,
  resetRouteMocks,
} from "@/test/routeHarness";

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    changeProposalReview: {
      approveAndApply: "changeProposalReview.approveAndApply",
    },
  },
}));

const mocks = vi.hoisted(() => ({
  revalidateSavedPaths: vi.fn(),
}));

vi.mock("../../../../save-article/revalidateSavedPaths", () => ({
  revalidateSavedPaths: mocks.revalidateSavedPaths,
}));

installProtectedRouteMocks();

function post(id = "cp_123") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/approve`, { method: "POST", headers: { Origin: "https://dose.wiki" } });
}

function useClient(mutation: Mock) {
  return grantWriteCapability({ query: vi.fn(), mutation });
}

describe("dev proposal approve route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com" });
    mocks.revalidateSavedPaths.mockReset();
  });

  it("approves as the admin and revalidates the paths the apply reported", async () => {
    const client = useClient(vi.fn(async () => ({ status: "applied", revalidatePaths: ["/lsd", "/substances"] })));
    const { POST } = await import("./route");

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
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "changes_requested",
      conflictReason: 'article "lsd" changed',
    });
    expect(mocks.revalidateSavedPaths).not.toHaveBeenCalled();
  });

  it("maps a stale proposal to 409", async () => {
    useClient(
      vi.fn(async () => {
        throw new PostgresError({ code: "PROPOSAL_STATUS_INVALID", message: "A rejected proposal cannot become applied." });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PROPOSAL_STATUS_INVALID" });
  });
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorHeavyWrite",
  refused: "editor",
  calls: [{ name: "POST", call: async () => (await import("./route")).POST(post()) }],
});
