import { beforeEach, describe, expect, it, vi } from "vitest";
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
});

describeRoleFloor({
  floor: "admin",
  rateLimit: "diagnosticRead",
  refused: "editor",
  calls: [{ name: "GET", call: () => GET(listRequest()) }],
});
