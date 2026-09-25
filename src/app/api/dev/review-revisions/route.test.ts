import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeRoleFloor,
  installProtectedRouteMocks,
  resetRouteMocks,
  routeMocks,
} from "@/test/routeHarness";

installProtectedRouteMocks();
const { GET } = await import("./route");

const listRequest = () => new Request("https://dose.wiki/api/dev/review-revisions");
const changesRequest = (query: string) => new Request(`https://dose.wiki/api/dev/review-revisions?${query}`);

describe("review revisions route", () => {
  beforeEach(() => {
    resetRouteMocks("editor", { email: "editor@example.com", name: "Editor" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("lists each article's current published revision", async () => {
    routeMocks.query.mockResolvedValue({ heroin: "rev9", morphine: "rev2" });
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revisions: { heroin: "rev9", morphine: "rev2" } });
  });

  it("returns the article at the signed revision and as published now", async () => {
    routeMocks.query.mockResolvedValue({
      slug: "heroin",
      revision: "rev1",
      publishedRevision: "rev9",
      signed: { summary: "Before" },
      current: { summary: "After" },
    });
    const response = await GET(changesRequest("slug=heroin&since=rev1"));
    expect(response.status).toBe(200);
    expect(routeMocks.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: "heroin", revision: "rev1" }),
    );
    await expect(response.json()).resolves.toMatchObject({ signed: { summary: "Before" }, current: { summary: "After" } });
  });

  it("answers 404 when the signed revision is not in the article's history", async () => {
    routeMocks.query.mockResolvedValue({ slug: "heroin", revision: "rev1", publishedRevision: "rev9", signed: null, current: {} });
    expect((await GET(changesRequest("slug=heroin&since=rev1"))).status).toBe(404);
  });

  it("refuses a malformed slug or revision before querying", async () => {
    expect((await GET(changesRequest("slug=Heroin!&since=rev1"))).status).toBe(400);
    expect((await GET(changesRequest("slug=heroin"))).status).toBe(400);
    expect(routeMocks.query).not.toHaveBeenCalled();
  });
});

describeRoleFloor({
  floor: "editor",
  rateLimit: "diagnosticRead",
  refused: "contributor",
  calls: [{ name: "GET", call: () => GET(listRequest()) }],
});
