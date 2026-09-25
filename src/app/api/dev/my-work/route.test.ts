import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  grantWriteCapability,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
  signInAs,
} from "@/test/routeHarness";

vi.mock("@server/postgres/runtime/api", () => ({
  api: { articleLifecycle: { mine: "articleLifecycle.mine" } },
}));

installProtectedRouteMocks();

const ADA = { email: "ada@example.com", name: "Ada" };
const BEN = { email: "ben@example.com", name: "Ben" };

const adaDraft = { slug: "lsd", title: "LSD", updatedAt: "2026-09-01T00:00:00.000Z" };
const adaProposal = {
  _id: "prop-ada", proposerName: "Ada", isAuthor: true, status: "submitted", summary: "Fix LSD onset",
  createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", targets: [], commentCount: 0,
};
const benDraft = { slug: "dmt", title: "DMT", updatedAt: "2026-09-03T00:00:00.000Z" };

/** Answers like Postgres: only the work of the actor the route names. */
function storeByActor() {
  const work: Record<string, unknown> = {
    [ADA.email]: { drafts: [adaDraft], proposals: [adaProposal] },
    [BEN.email]: { drafts: [benDraft], proposals: [] },
  };
  routeMocks.query.mockImplementation(async (_name: string, args: { actorEmail?: string }) =>
    work[args.actorEmail ?? ""] ?? { drafts: [], proposals: [] },
  );
}

const get = (search = "") => new Request(`https://dose.wiki/api/dev/my-work${search}`);

describe("my drafts and proposals route", () => {
  beforeEach(() => {
    resetRouteMocks("editor", ADA);
    grantWriteCapability(undefined, { intentToken: "scoped-token" });
    storeByActor();
  });

  it("reads the signed-in member's drafts and open proposals as the session's actor", async () => {
    const { GET } = await import("./route");

    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(routeMocks.query).toHaveBeenCalledWith("articleLifecycle.mine", { apiKey: "scoped-token", actorEmail: ADA.email });
    await expect(response.json()).resolves.toEqual({ ok: true, drafts: [adaDraft], proposals: [adaProposal] });
  });

  it("only ever returns the caller's items, whatever the request names", async () => {
    signInAs("editor", BEN);
    const { GET } = await import("./route");

    const response = await GET(get(`?email=${ADA.email}&actorEmail=${ADA.email}`));
    const body = await response.json();

    expect(routeMocks.query).toHaveBeenCalledTimes(1);
    expect(routeMocks.query).toHaveBeenCalledWith("articleLifecycle.mine", expect.objectContaining({ actorEmail: BEN.email }));
    expect(body).toEqual({ ok: true, drafts: [benDraft], proposals: [] });
    expect(JSON.stringify(body)).not.toContain("prop-ada");
  });

  it("lets only the listed draft fields out, even if a row carries more", async () => {
    routeMocks.query.mockResolvedValue({
      drafts: [{ ...adaDraft, ownerEmail: ADA.email, article: { title: "LSD" } }],
      proposals: [adaProposal],
    });
    const { GET } = await import("./route");

    const body = await (await GET(get())).json();

    expect(body.drafts).toEqual([adaDraft]);
    expect(JSON.stringify(body)).not.toContain(ADA.email);
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "diagnosticRead",
  refused: "contributor",
  calls: [{ name: "GET", call: async () => (await import("./route")).GET(get()) }],
});
