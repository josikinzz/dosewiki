import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("../../../../../../../convex/_generated/api", () => ({
  api: {
    changeProposals: {
      submit: "changeProposals.submit",
      list: "changeProposals.list",
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

function post(body: unknown, id = "cp_old") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/resubmit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function useClient(mutation: Mock) {
  const client = { query: vi.fn(), mutation };
  mocks.getServerConvexWriteCapability.mockReturnValue({
    ok: true,
    capability: { adminKey: "admin-key", client, getAdminIntentToken: vi.fn(() => "article-token") },
  });
  return client;
}

const stagedSave = {
  payload: { articles: [{ id: 1, title: "LSD", slug: "lsd", draftOnlyField: "dropped" }] },
  summary: "  Update LSD  ",
  diff: "# LSD\n\n+ Rebased",
};

describe("dev proposal resubmit route", () => {
  beforeEach(() => {
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("editor"));
    mocks.getServerConvexWriteCapability.mockReset();
  });

  it("submits the staged save as a revision of the proposal named in the path", async () => {
    const client = useClient(vi.fn(async () => ({ proposalId: "cp_new" })));

    const response = await POST(post(stagedSave));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, proposalId: "cp_new" });
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.mutation).toHaveBeenCalledWith("changeProposals.submit", {
      apiKey: "article-token",
      actorEmail: "editor@example.com",
      payload: expect.objectContaining({ articles: [{ id: 1, title: "LSD", slug: "lsd" }] }),
      summary: "Update LSD",
      diff: "# LSD\n\n+ Rebased",
      revisionOf: "cp_old",
    });
  });

  it("uses the path id even when the body names a different revisionOf", async () => {
    const client = useClient(vi.fn(async () => ({ proposalId: "cp_new" })));

    await POST(post({ ...stagedSave, revisionOf: "cp_other" }, "cp_path"));

    expect(client.mutation).toHaveBeenCalledWith(
      "changeProposals.submit",
      expect.objectContaining({ revisionOf: "cp_path" }),
    );
  });

  it("refuses a contributor before calling Convex", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("contributor"));
    const client = useClient(vi.fn());

    const response = await POST(post(stagedSave));

    expect(response.status).toBe(403);
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and an empty payload before calling Convex", async () => {
    const client = useClient(vi.fn());

    const malformed = await POST(post("{not json"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "Invalid JSON body." });

    const empty = await POST(post({ payload: {}, summary: "x", diff: "" }));
    expect(empty.status).toBe(400);

    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("maps a Convex refusal of the revision to the caller", async () => {
    useClient(
      vi.fn(async () => {
        throw new ConvexError({ code: "PROPOSAL_STATUS_INVALID", message: "A rejected proposal cannot be revised." });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(post(stagedSave));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PROPOSAL_STATUS_INVALID" });
  });
});
