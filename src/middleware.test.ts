import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

function makeRequest(path: string): NextRequest {
  return new NextRequest(
    new Request(`https://dosewiki-admin.vercel.app${path}`, {
      headers: { host: "dosewiki-admin.vercel.app" },
    }),
  );
}

function makePublicRequest(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new Request(`https://dose.wiki${path}`, {
      headers: { host: "dose.wiki", ...headers },
    }),
  );
}

describe("middleware role policy adapter", () => {
  beforeEach(() => {
    mocks.getToken.mockReset();
  });

  it("redirects anonymous /dev requests to sign in", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev",
    );
  });

  it("protects the legacy Theme Lab workbench route", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/themes"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev%2Fthemes",
    );
    expect(mocks.getToken).toHaveBeenCalledOnce();
  });

  it("enforces the admin browser policy on protected-route redirects", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/_-]+' 'sha256-[A-Za-z0-9+/=]+' 'sha256-[A-Za-z0-9+/=]+' 'wasm-unsafe-eval'/,
    );
    expect(csp).not.toContain("posthog");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("x-nonce")).toBeNull();
  });

  it("uses the nonce-free inline policy on public documents", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/fentanyl"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    );
    expect(csp).not.toMatch(/script-src[^;]*'nonce-/);
    expect(csp).not.toMatch(/script-src[^;]*'sha256-/);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(response.headers.get("x-nonce")).toBeNull();
  });

  it("redirects anonymous profile requests to sign in", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev%2Fprofile",
    );
  });

  it("allows authenticated viewers into /dev/profile", async () => {
    mocks.getToken.mockResolvedValue({
      email: "viewer@example.com",
      role: "viewer",
    });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows authenticated viewers into /dev/profiles", async () => {
    mocks.getToken.mockResolvedValue({
      email: "viewer@example.com",
      role: "viewer",
    });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profiles"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects viewers away from the editor shell without editor privileges", async () => {
    mocks.getToken.mockResolvedValue({
      email: "viewer@example.com",
      role: "viewer",
    });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/unauthorized?from=%2Fdev",
    );
  });

  it("allows editors into the editor shell", async () => {
    mocks.getToken.mockResolvedValue({
      email: "editor@example.com",
      role: "editor",
    });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(
      /^[A-Za-z0-9+/_-]+$/,
    );
  });

  it("serves public dose.wiki article routes at their permanent paths", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows an imported replication detail route through for on-demand generation", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest(
        "/replications/another-type-of-replication-does-this-count-gt0sy7",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites an unknown replication slug to the real not-found route", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest(
        "/replications/definitely-not-a-real-replication-zzzz",
      ),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/_flavor-gated/not-found",
    );
  });

  it("rewrites a viewer deep-link document to the per-slug gallery route", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=infinite-torus-space&type=video"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/replications/viewer/infinite-torus-space?viewer=infinite-torus-space&type=video",
    );
  });

  it("leaves client-side gallery navigations on the static route", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=infinite-torus-space", { rsc: "1" }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("ignores a viewer value outside the slug grammar", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=%25%24"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("hides the viewer rewrite target from direct requests", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/replications/viewer/infinite-torus-space"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/_flavor-gated/not-found",
    );
  });

  it("rewrites an unknown root slug instead of serving a soft substance 404", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/definitely-not-a-real-substance-zzzz"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/_flavor-gated/not-found",
    );
  });

  it("serves the launched homepage at the public root", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects old preview substance aliases directly to their canonical path", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/preview/psilocybin"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/psilocybin-mushrooms",
    );
  });

  it("redirects old preview search paths directly to canonical search URLs", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/preview/search/lsd"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/search?q=lsd",
    );
  });

  it("redirects the old preview homepage to the launched root", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/preview/home"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
  });

  it("preserves queries while retiring preview section addresses", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/preview/substances?tab=common"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/substances?tab=common",
    );
  });

  it("hands a public-host editor link to the editor origin", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/dev/articles"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/dev/articles",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("preserves the query across editor handoff", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/sign-in?callbackUrl=%2Fdev"),
    );

    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/sign-in?callbackUrl=%2Fdev",
    );
  });

  it("hands off old preview editor addresses while dropping the prefix", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/preview/dev/articles"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/dev/articles",
    );
  });

  it("redirects old preview addresses to direct routes on the editor host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/preview/dev/articles"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/dev/articles",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("keeps credentialed APIs off the public origin", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/api/dev/articles"));

    expect(response.headers.get("location")).toBe("https://dose.wiki/");
  });

  it("serves public client APIs directly without a document CSP", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/api/search-suggestions?q=mdma"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("serves the versioned public API directly", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makePublicRequest("/api/v1/substances?limit=25"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/docs/license", "/api/csp-report", "/robots.txt", "/sitemap.xml"])(
    "serves launched public endpoint %s directly",
    async (path) => {
      const { middleware } = await import("../middleware");

      const response = await middleware(makePublicRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("does not override database-backed SVG route content policies", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/api/molecules/2c-b"));

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("covers the public analytics proxy with self without an invalid path source", async () => {
    const { middleware } = await import("../middleware");

    const publicResponse = await middleware(makePublicRequest("/"));
    const adminResponse = await middleware(makeRequest("/fentanyl"));

    expect(publicResponse.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(publicResponse.headers.get("content-security-policy")).not.toContain("/ingest");
    expect(adminResponse.headers.get("content-security-policy")).not.toContain("/ingest");
  });

  it("serves public static assets directly", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/icon-512.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows full public article routes on the admin Vercel host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("redirects high-volume substance aliases on the full app host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/psilocybin"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/psilocybin-mushrooms",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("emits a real 301 for retired Artist Page keys", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makeRequest("/replications/artist/anonymous"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/replications/artist/unknown",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("forwards the retired StingrayZ Artist Page to Symmetric Vision", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(
      makeRequest("/replications/artist/stingrayz"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/replications/artist/symmetric-vision",
    );
  });

  it("redirects legacy search path queries to noindex search URLs on the full app host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/search/lsd%20dosage"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/search?q=lsd+dosage",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});

describe("middleware header memoization", () => {
  beforeEach(() => {
    mocks.getToken.mockReset();
  });

  it("serves identical public security headers across repeated requests to a host", async () => {
    const { middleware } = await import("../middleware");

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

  it("issues a fresh nonce per /dev request despite the public header cache", async () => {
    mocks.getToken.mockResolvedValue({
      email: "editor@example.com",
      role: "editor",
    });
    const { middleware } = await import("../middleware");

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
  async function loadMatcher(): Promise<RegExp> {
    const { config } = await import("../middleware");
    return new RegExp(`^${config.matcher[0]}$`);
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
    expect((await loadMatcher()).test(path)).toBe(true);
  });

  it.each([
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
  ])("excludes the static asset %s", async (path) => {
    expect((await loadMatcher()).test(path)).toBe(false);
  });
});

describe("retired preview addresses are dose.wiki-only", () => {
  it("does not claim the prefix on an Effect Index build", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "effectindex");
    vi.resetModules();

    try {
      // The flavor is read at module init, so the import has to follow the stub.
      const { middleware } = await import("../middleware");
      const response = await middleware(makeRequest("/preview/substances"));

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
        const { middleware } = await import("../middleware");
        const response = await middleware(makeRequest(path));

        expect(response.headers.get("x-middleware-rewrite")).toBe(
          "https://dosewiki-admin.vercel.app/_flavor-gated/not-found",
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
