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
      revert: "changeProposalReview.revert",
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
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/revert`, { method: "POST", headers: { Origin: "https://dose.wiki" } });
}

function useClient(mutation: Mock) {
  return grantWriteCapability({ query: vi.fn(), mutation });
}

describe("dev proposal revert route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com" });
    mocks.revalidateSavedPaths.mockReset();
  });

  it("reverts as the admin and revalidates the paths the write-back reported", async () => {
    const client = useClient(vi.fn(async () => ({ status: "reverted", revalidatePaths: ["/lsd", "/substances"] })));
    const { POST } = await import("./route");

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
        throw new PostgresError({ code: "REVERT_CONFLICT", message: 'Production changed: article "lsd".' });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "REVERT_CONFLICT",
      error: 'Production changed: article "lsd".',
    });
    expect(mocks.revalidateSavedPaths).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorHeavyWrite",
  refused: "editor",
  calls: [{ name: "POST", call: async () => (await import("./route")).POST(post()) }],
});
