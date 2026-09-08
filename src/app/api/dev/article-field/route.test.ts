import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
} from "@/test/routeHarness";

import { EDITABLE_FIELD_CONFLICT_REASON } from "../../../../../convex/lib/articleFieldWrites";

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    substanceIndex: { setArticleField: "substanceIndex.setArticleField" },
  },
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

installProtectedRouteMocks();
const { POST } = await import("./route");

/** How the Convex HTTP client rebuilds a thrown `ConvexError` on this side. */
function forwarded(data: unknown) {
  const error = new ConvexError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

function editRequest() {
  return new Request("https://dose.wiki/api/dev/article-field", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify({
      slug: "2c-b",
      path: "dosage.routes[0].notes",
      value: "Corrected note.",
      expected: "Old note.",
      baseHash: "loaded-revision",
      changeId: "field-change",
    }),
  });
}

const ADMIN = { email: "admin@example.com", name: "Admin" };

describeRoleFloor({
  floor: "admin",
  rateLimit: "editorSmallWrite",
  refused: "editor",
  calls: [{ name: "POST", call: () => POST(editRequest()) }],
});

describe("article field route failure reporting", () => {
  beforeEach(() => {
    // next/cache spies live outside the route harness and accumulate across cases.
    vi.clearAllMocks();
    resetRouteMocks("admin", ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("delivers the stale-value conflict copy verbatim, at a status the client can branch on", async () => {
    routeMocks.mutation.mockRejectedValue(
      forwarded({ code: "FIELD_CONFLICT", message: EDITABLE_FIELD_CONFLICT_REASON }),
    );

    const response = await POST(editRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: EDITABLE_FIELD_CONFLICT_REASON,
      code: "FIELD_CONFLICT",
    });
  });

  it("reports a missing article as a missing article", async () => {
    routeMocks.mutation.mockRejectedValue(
      forwarded({ code: "ARTICLE_NOT_FOUND", message: 'No substance found for slug "2c-b".' }),
    );

    const response = await POST(editRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'No substance found for slug "2c-b".',
      code: "ARTICLE_NOT_FOUND",
    });
  });


  it("rejects an unversioned write before reaching Convex", async () => {

    const response = await POST(
      new Request("https://dose.wiki/api/dev/article-field", {
        method: "POST",
        headers: { Origin: "https://dose.wiki" },
        body: JSON.stringify({ slug: "2c-b", path: "title", value: "x", expected: "y" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.mutation).not.toHaveBeenCalled();
  });
});

