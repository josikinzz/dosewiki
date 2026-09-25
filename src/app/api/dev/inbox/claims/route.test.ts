import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "@server/postgres/runtime/api";
import { PostgresError } from "@server/postgres/runtime/values";
import {
  describeRoleFloor,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
  signInAs,
} from "@/test/routeHarness";

installProtectedRouteMocks();
const { GET, POST } = await import("./route");

const listRequest = () => new Request("https://dose.wiki/api/dev/inbox/claims");

function claimRequest(body: unknown) {
  return new Request("https://dose.wiki/api/dev/inbox/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

describe("inbox claims route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com", name: "Admin" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lists every claim for an admin", async () => {
    const claims = [{ source: "proposals", item_id: "p1", claimed_by: "other@example.com", claimed_at: "2026-09-25T00:00:00.000Z" }];
    routeMocks.query.mockResolvedValue(claims);
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, claims });
  });

  it("claims as the signed-in admin, never a name the caller sends", async () => {
    routeMocks.mutation.mockResolvedValue({ source: "citations", item_id: "lsd", claimed_by: "admin@example.com", claimed_at: "now" });
    const response = await POST(claimRequest({ action: "claim", source: "citations", id: "lsd", claimed_by: "someone@example.com" }));
    expect(response.status).toBe(200);
    const [reference, args] = routeMocks.mutation.mock.calls[0];
    expect(getFunctionName(reference as never)).toBe("inboxClaims:claim");
    expect(args).toMatchObject({ actorEmail: "admin@example.com", source: "citations", item_id: "lsd" });
    expect(args).not.toHaveProperty("claimed_by");
  });

  it("answers 409 with the holder when another admin already has the item", async () => {
    routeMocks.mutation.mockRejectedValue(
      new PostgresError({ code: "INBOX_CLAIM_HELD", message: "other@example.com is already working on this item.", claimedBy: "other@example.com" }),
    );
    const response = await POST(claimRequest({ action: "claim", source: "proposals", id: "p1" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INBOX_CLAIM_HELD", error: "other@example.com is already working on this item." });
  });

  it("releases through its own mutation", async () => {
    routeMocks.mutation.mockResolvedValue({ released: true });
    const response = await POST(claimRequest({ action: "release", source: "review-recommendations", id: "lsd" }));
    await expect(response.json()).resolves.toEqual({ ok: true, released: true });
    expect(getFunctionName(routeMocks.mutation.mock.calls[0][0] as never)).toBe("inboxClaims:release");
  });

  it("refuses a malformed body before calling Postgres", async () => {
    expect((await POST(claimRequest({ action: "steal", source: "proposals", id: "p1" }))).status).toBe(400);
    expect((await POST(claimRequest({ action: "claim", source: "trip-reports", id: "p1" }))).status).toBe(400);
    expect((await POST(claimRequest({ action: "claim", source: "proposals", id: "" }))).status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("refuses an editor", async () => {
    signInAs("editor");
    expect((await POST(claimRequest({ action: "claim", source: "proposals", id: "p1" }))).status).toBe(403);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "diagnosticRead",
  refused: "editor",
  calls: [{ name: "GET", call: () => GET(listRequest()) }],
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorSmallWrite",
  refused: "editor",
  calls: [{ name: "POST", call: () => POST(claimRequest({ action: "claim", source: "proposals", id: "p1" })) }],
});
