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
    changeProposals: {
      submit: "changeProposals.submit",
      list: "changeProposals.list",
    },
  },
}));

installProtectedRouteMocks();

function post(body: unknown, id = "cp_old") {
  return new Request(`https://dose.wiki/api/dev/proposals/${id}/resubmit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", Origin: "https://dose.wiki" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function useClient(mutation: Mock) {
  return grantWriteCapability({ query: vi.fn(), mutation }, { intentToken: "article-token" });
}

const stagedSave = {
  payload: { articles: [{ id: 1, title: "LSD", slug: "lsd", draftOnlyField: "dropped" }] },
  summary: "  Update LSD  ",
  baselines: [{ kind: "article", key: "lsd", document: null }],
};

describe("dev proposal resubmit route", () => {
  beforeEach(() => {
    resetRouteMocks("editor");
  });

  it("submits the staged save as a revision of the proposal named in the path", async () => {
    const client = useClient(vi.fn(async () => ({ proposalId: "cp_new" })));
    const { POST } = await import("./route");

    const response = await POST(post(stagedSave));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, proposalId: "cp_new" });
    expect(client.mutation).toHaveBeenCalledTimes(1);
  });

  it("uses the path id even when the body names a different revisionOf", async () => {
    const client = useClient(vi.fn(async () => ({ proposalId: "cp_new" })));
    const { POST } = await import("./route");

    await POST(post({ ...stagedSave, revisionOf: "cp_other" }, "cp_path"));

    expect(client.mutation).toHaveBeenCalledWith(
      "changeProposals.submit",
      expect.objectContaining({ revisionOf: "cp_path" }),
    );
  });

  it("rejects malformed JSON and an empty payload before calling Postgres", async () => {
    // Resubmit parses the body itself (to pin `revisionOf`) before delegating, so the
    // malformed-JSON 400 is this route's own layer, not protectedRouteOperation's.
    const client = useClient(vi.fn());
    const { POST } = await import("./route");

    const malformed = await POST(post("{not json"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "Invalid JSON body." });

    const empty = await POST(post({ payload: {}, summary: "x", diff: "" }));
    expect(empty.status).toBe(400);

    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("maps a Postgres refusal of the revision to the caller", async () => {
    useClient(
      vi.fn(async () => {
        throw new PostgresError({ code: "PROPOSAL_STATUS_INVALID", message: "A rejected proposal cannot be revised." });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(post(stagedSave));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PROPOSAL_STATUS_INVALID" });
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "editorHeavyWrite",
  refused: "contributor",
  calls: [{ name: "POST", call: async () => (await import("./route")).POST(post(stagedSave)) }],
});
