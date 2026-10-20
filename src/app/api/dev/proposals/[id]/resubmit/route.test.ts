import { PostgresError } from "@server/postgres/runtime/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  grantWriteCapability,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
  signInAs,
} from "@/test/routeHarness";

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    changeProposals: {
      submit: "changeProposals.submit",
    },
  },
}));

installProtectedRouteMocks();

function post(body: unknown = {}, origin = "https://dose.wiki") {
  return new Request("https://dose.wiki/api/dev/proposals/cp_old/resubmit", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify({
      payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
      summary: "Update",
      baselines: [{ kind: "article", key: "lsd", document: null }],
      ...(body as object),
    }),
  });
}

describe("dev proposal resubmit route", () => {
  beforeEach(() => {
    resetRouteMocks("editor", { email: "editor@example.com" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a foreign origin privately before reading the body", async () => {
    const { POST } = await import("./route");
    const request = post({}, "https://evil.example");

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(request.bodyUsed).toBe(false);
    expect(routeMocks.requireRoleSession).not.toHaveBeenCalled();
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller privately before reading the body", async () => {
    signInAs(null);
    const { POST } = await import("./route");
    const request = post();

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(request.bodyUsed).toBe(false);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("submits the path proposal as revisionOf, overriding any body value", async () => {
    const client = grantWriteCapability({ query: vi.fn(), mutation: vi.fn(async () => ({ proposalId: "cp_new" })) });
    const { POST } = await import("./route");

    const response = await POST(post({ revisionOf: "cp_other" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, proposalId: "cp_new" });
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.mutation).toHaveBeenCalledWith(
      "changeProposals.submit",
      expect.objectContaining({ actorEmail: "editor@example.com", revisionOf: "cp_old" }),
    );
  });

  it("keeps the stale-baseline conflict", async () => {
    grantWriteCapability({
      query: vi.fn(),
      mutation: vi.fn(async () => {
        throw new PostgresError({ code: "PROPOSAL_BASELINE_STALE", message: "Production changed. Your draft is preserved." });
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(post());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PROPOSAL_BASELINE_STALE" });
  });

  it("shares one submission allowance across submit and every resubmit path", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const limiter = await vi.importActual<typeof import("@server/http/nextRateLimit")>("@server/http/nextRateLimit");
    routeMocks.enforceRateLimit.mockImplementation(limiter.enforceRateLimit);
    const client = grantWriteCapability({ query: vi.fn(), mutation: vi.fn(async () => ({ proposalId: "cp_new" })) });
    const { POST: resubmit } = await import("./route");
    const { POST: submit } = await import("../../route");
    const send = (path: string) =>
      new Request(`https://dose.wiki${path}`, {
        method: "POST",
        headers: { Origin: "https://dose.wiki", "x-forwarded-for": "192.0.2.10" },
        body: JSON.stringify({
          payload: { articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
          summary: "Update",
          baselines: [{ kind: "article", key: "lsd", document: null }],
        }),
      });

    const statuses = [
      (await resubmit(send("/api/dev/proposals/cp_a/resubmit"))).status,
      (await submit(send("/api/dev/proposals"))).status,
      (await resubmit(send("/api/dev/proposals/cp_b/resubmit"))).status,
      (await resubmit(send("/api/dev/proposals/cp_c/resubmit"))).status,
      (await submit(send("/api/dev/proposals"))).status,
      (await resubmit(send("/api/dev/proposals/cp_d/resubmit"))).status,
    ];

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(client.mutation).toHaveBeenCalledTimes(5);
  });
});

describeRoleFloor({
  floor: "editor",
  refused: "contributor",
  calls: [{ name: "POST", call: async () => (await import("./route")).POST(post()) }],
});
