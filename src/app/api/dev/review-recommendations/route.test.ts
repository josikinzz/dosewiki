import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "@server/postgres/runtime/api";
import {
  describeRoleFloor,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
  signInAs,
} from "@/test/routeHarness";

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

installProtectedRouteMocks();
const { GET, POST } = await import("./route");

const listRequest = () => new Request("https://dose.wiki/api/dev/review-recommendations");

function approveRequest(items: unknown) {
  return new Request("https://dose.wiki/api/dev/review-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ items }),
  });
}

describe("review recommendations route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com", name: "Admin" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses an editor approving a recommendation, so an editor can never complete a review", async () => {
    signInAs("editor");
    const response = await POST(approveRequest([{ slug: "heroin", revision: "rev1" }]));
    expect(response.status).toBe(403);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("lists recommendations for an admin", async () => {
    const rows = [{ slug: "heroin", title: "Heroin", revision: "rev1", recommended_by: "editor@example.com", recommended_at: "2026-09-25T00:00:00.000Z", note: "", publishedRevision: "rev1", stale: false }];
    routeMocks.query.mockResolvedValue(rows);
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, recommendations: rows });
  });

  it("approves every chosen recommendation at its revision in one write and reports the rest", async () => {
    routeMocks.mutation.mockResolvedValue({ approved: ["heroin", "morphine"], stale: ["codeine"], missing: [] });
    const items = [
      { slug: "heroin", revision: "rev1" },
      { slug: "morphine", revision: "rev2" },
      { slug: "codeine", revision: "rev3" },
    ];
    const response = await POST(approveRequest(items));

    expect(response.status).toBe(200);
    expect(routeMocks.mutation).toHaveBeenCalledTimes(1);
    const [reference, args] = routeMocks.mutation.mock.calls[0];
    expect(getFunctionName(reference as never)).toBe("substanceIndex:approveReviewRecommendations");
    expect(args).toMatchObject({ items, actorEmail: "admin@example.com" });
    await expect(response.json()).resolves.toEqual({ ok: true, approved: ["heroin", "morphine"], stale: ["codeine"], missing: [] });
  });

  it("refuses an empty or malformed batch before calling Postgres", async () => {
    expect((await POST(approveRequest([]))).status).toBe(400);
    expect((await POST(approveRequest([{ slug: "heroin", revision: "not a hash" }]))).status).toBe(400);
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
  calls: [{ name: "POST", call: () => POST(approveRequest([{ slug: "heroin", revision: "rev1" }])) }],
});
