import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { makePublicRequest, makeRequest } from "./middleware.testHarness";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));
vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "dosewiki");

describe("middleware header memoization", () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue({ email: "editor@example.com", role: "editor" });
  });

  it("does not frame editor documents or compatibility and neighboring embed paths", async () => {
    const { middleware } = await import("./middleware");
    for (const path of ["/embed/replications/other", "/embed/other", "/preview/embed/replications"]) {
      const response = await middleware(makePublicRequest(path));
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
    mocks.getToken.mockResolvedValue(null);
    const response = await middleware(makeRequest("/embed/replications?parentOrigin=https://osmanthus.io"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
  });
});

describe("middleware matcher", () => {
  async function matches(path: string): Promise<boolean> {
    const { config } = await import("./middleware");
    return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `https://dev.dose.wiki${path}` });
  }

  it.each([
    "/",
    "/fentanyl",
    "/search/lsd",
    "/replications/some-slug",
    "/dev",
    "/dev/themes",
    "/api/v1/substances",
    "/api/molecules/2c-b",
    "/robots.txt",
    "/llms.txt",
    "/SubstanceIndex.json",
    "/open-data/SubstanceIndex.json",
  ])("still routes %s through middleware", async (path) => {
    expect(await matches(path)).toBe(true);
  });
});

describe("the editor shell is dose.wiki-only", () => {
  it.each(["/dev", "/dev/themes", "/dev/kit", "/dev/articles/x"])(
    "answers %s with the real not-found route on an Effect Index build, before any session read",
    async (path) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "effectindex");
      vi.resetModules();
      mocks.getToken.mockReset();
      mocks.getToken.mockResolvedValue({ email: "admin@example.com", role: "admin" });

      try {
        const { middleware } = await import("./middleware");
        const response = await middleware(makePublicRequest(path));

        expect(response.headers.get("x-middleware-rewrite")).toBe(
          "https://dose.wiki/_flavor-gated/not-found",
        );
        expect(response.headers.get("location")).toBeNull();
        expect(mocks.getToken).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    },
  );
});
