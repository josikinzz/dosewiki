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
const { POST } = await import("./route");

function tickRequest(status: "needed" | "in_progress" | "completed" = "completed") {
  return new Request("https://dose.wiki/api/dev/editorial-review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ slug: "2c-b", status }),
  });
}

describe("editorial review route", () => {
  beforeEach(() => {
    resetRouteMocks("admin", { email: "admin@example.com", name: "Admin" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses an editor marking a review completed with 403 before touching Postgres", async () => {
    signInAs("editor");
    const response = await POST(tickRequest("completed"));
    expect(response.status).toBe(403);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("signs off the revision the reviewer read and returns the reviewer and revision it stored", async () => {
    const stored = {
      status: "completed",
      notes: "",
      reviewed_by: "admin@example.com",
      reviewed_at: "2026-09-25T00:00:00.000Z",
      reviewed_revision: "a1b2c3",
    };
    routeMocks.mutation.mockResolvedValue({ slug: "2c-b", editorial_review: stored });
    const response = await POST(new Request("https://dose.wiki/api/dev/editorial-review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
      body: JSON.stringify({ slug: "2c-b", status: "completed", revision: "a1b2c3" }),
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: "2c-b", status: "completed", revision: "a1b2c3", actorEmail: "admin@example.com" }),
    );
    await expect(response.json()).resolves.toMatchObject({ editorial_review: stored });
  });

});

describeRoleFloor({
  floor: "editor",
  rateLimit: "editorSmallWrite",
  refused: "contributor",
  calls: [{ name: "POST", call: () => POST(tickRequest("in_progress")) }],
});
