/**
 * Middleware cases that isolate module state: the per-host header cache, the
 * exported matcher, and the flavor-gated paths that reload the module under a
 * different site flavor. Routing and role policy live in middleware.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { makePublicRequest, makeRequest } from "./middleware.testHarness";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));
// This file owns dose.wiki host and editor-origin policy. Keep that publication
// explicit when the whole suite is launched with another ambient flavor.
vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "dosewiki");

describe("middleware header memoization", () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue({ email: "editor@example.com", role: "editor" });
  });

  it("serves identical public security headers across repeated requests to a host", async () => {
    const { middleware } = await import("./middleware");

    const first = await middleware(makeRequest("/fentanyl"));
    const second = await middleware(makeRequest("/about"));

    expect(first.headers.get("content-security-policy")).toBeTruthy();
    expect(second.headers.get("content-security-policy")).toBe(
      first.headers.get("content-security-policy"),
    );
    expect(second.headers.get("x-frame-options")).toBe("DENY");
    expect(second.headers.get("permissions-policy")).toBe(
      first.headers.get("permissions-policy"),
    );
  });

  it.each([
    ["/about", "/embed/replications?kind=effect&slug=visual-drifting"],
    ["/embed/replications?kind=effect&slug=visual-drifting", "/about"],
  ])("isolates cached frame policies when %s precedes %s", async (firstPath, secondPath) => {
    vi.resetModules();
    // Reload the module to exercise each ordering with an empty header cache.
    const { middleware } = await import("./middleware");
    for (const path of [firstPath, secondPath, firstPath]) {
      const response = await middleware(makePublicRequest(path));
      const isEmbed = path.startsWith("/embed/replications?");
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("content-security-policy")).toContain(
        isEmbed
          ? "frame-ancestors 'self' https://osmanthus.io https://www.osmanthus.io http://localhost:3000 http://127.0.0.1:3000"
          : "frame-ancestors 'none'",
      );
      expect(response.headers.get("x-frame-options")).toBe(isEmbed ? null : "DENY");
      if (isEmbed) {
        expect(response.headers.get("x-robots-tag")).toContain("noindex");
        expect(response.headers.get("permissions-policy")).toContain("fullscreen=(self)");
      } else {
        expect(response.headers.get("x-robots-tag")).toBeNull();
        expect(response.headers.get("permissions-policy")).not.toContain("fullscreen=");
      }
    }
  });

  it("does not frame editor documents or compatibility and neighboring embed paths", async () => {
    // Share the resettable middleware module boundary used by the cache cases above.
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

  it("issues a fresh nonce per /dev request despite the public header cache", async () => {
    mocks.getToken.mockResolvedValue({
      email: "editor@example.com",
      role: "editor",
    });
    const { middleware } = await import("./middleware");

    const first = await middleware(makeRequest("/dev"));
    const second = await middleware(makeRequest("/dev"));
    const nonceOf = (response: Response) =>
      response.headers
        .get("content-security-policy")
        ?.match(/'nonce-([^']+)'/)?.[1];

    expect(nonceOf(first)).toBeTruthy();
    expect(nonceOf(second)).toBeTruthy();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(
      nonceOf(first),
    );
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
    // json/txt stay matched on purpose: the construction gate must keep fronting the
    // open-data dumps on dose.wiki/www until launch.
    "/robots.txt",
    "/llms.txt",
    "/SubstanceIndex.json",
    "/open-data/SubstanceIndex.json",
  ])("still routes %s through middleware", async (path) => {
    expect(await matches(path)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/editor.js",
    "/_next/data/build/fentanyl.json",
    "/favicon.ico",
    "/favicon.svg",
    "/icon-512.png",
    "/manifest.webmanifest",
    "/sitemap.xml",
    "/appearance-chroma.css",
    "/fonts/titillium-web/titillium-web-400-normal-latin.woff2",
    "/flags/us/california.svg",
    "/supporters/mindstate-design-labs.webp",
    "/audio/Auditory Hallucinations - DMT Drone.mp3",
  ])("keeps the static asset %s inside the delivery gate", async (path) => {
    expect(await matches(path)).toBe(true);
  });
});

describe("retired preview addresses are dose.wiki-only", () => {
  it("does not claim the prefix on an Effect Index build", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "effectindex");
    vi.resetModules();

    try {
      // The flavor is read at module init, so the import has to follow the stub.
      const { middleware } = await import("./middleware");
      const response = await middleware(makePublicRequest("/preview/substances"));

      // Not rewritten and not redirected: Effect Index is launched, so the prefix is
      // simply an unknown path that its route tree answers for itself.
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
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
        // The flavor is read at module init, so the import has to follow the stub.
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
