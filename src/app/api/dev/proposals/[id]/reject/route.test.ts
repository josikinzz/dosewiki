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
      reject: "changeProposalReview.reject",
    },
  },
}));

installProtectedRouteMocks();

function post(body: unknown, id = "cp_123") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/reject`, {
    method: "POST",
    headers: { Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

function useClient(mutation: Mock) {
  return grantWriteCapability({ query: vi.fn(), mutation });
}

describe("dev proposal reject route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com" });
  });

  it("rejects with the trimmed note as the admin", async () => {
    const client = useClient(vi.fn(async () => ({ status: "rejected" })));
    const { POST } = await import("./route");

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

  it("returns 400 on an empty note without calling Postgres", async () => {
    const client = useClient(vi.fn());
    const { POST } = await import("./route");

    for (const body of [{ note: "" }, { note: "   " }, {}]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Rejecting a proposal needs a note for the editor.",
      });
    }
    expect(client.mutation).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorSmallWrite",
  refused: "editor",
  calls: [{ name: "POST", call: async () => (await import("./route")).POST(post({ note: "no" })) }],
});
