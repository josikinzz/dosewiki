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

function flagRequest(flag: unknown) {
  return new Request("https://dose.wiki/api/dev/editorial-review", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({ action: "add-flag", slug: "2c-b", flag }),
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

  it("lets an editor move a review to in_progress", async () => {
    signInAs("editor");
    routeMocks.mutation.mockResolvedValue({ slug: "2c-b", editorial_review: { status: "in_progress", notes: "" } });
    const response = await POST(tickRequest("in_progress"));
    expect(response.status).toBe(200);
  });

  it("lets an admin mark a review completed", async () => {
    routeMocks.mutation.mockResolvedValue({ slug: "2c-b", editorial_review: { status: "completed", notes: "" } });
    const response = await POST(tickRequest("completed"));
    expect(response.status).toBe(200);
  });


  it("rejects malformed labels before calling Postgres", async () => {
    const response = await POST(flagRequest({ label: "this label has too many words", severity: "minor", note: "" }));
    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });

  it("rejects malformed severities before calling Postgres", async () => {
    const response = await POST(flagRequest({ label: "skinny", severity: "blocking", note: "" }));
    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "editorSmallWrite",
  refused: "contributor",
  calls: [{ name: "POST", call: () => POST(tickRequest("in_progress")) }],
});
