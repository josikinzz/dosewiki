import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { SUBSTANCE_INDEX_VIEW_PARAMS } from "@/utils/indexViewRoutes";
import themeLabBootstrap from "@/features/theme-lab/themeLabBootstrap.generated.json";
import { buildZodJitlessBootstrapScript } from "@server/next/zodBrowserPolicy";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));
// This file owns dose.wiki host and editor-origin policy. Keep that publication
// explicit when the whole suite is launched with another ambient flavor.
vi.stubEnv("NEXT_PUBLIC_SITE_FLAVOR", "dosewiki");


function makeRequest(path: string): NextRequest {
  vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
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
  vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "false");
  return new NextRequest(
    new Request(`https://dose.wiki${path}`, {
      headers: { host: "dose.wiki", ...headers },
    }),
  );
}

describe("middleware role policy adapter", () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue({ email: "editor@example.com", role: "editor" });
  });

  it.each(["dev.dose.wiki", "dosewiki-admin.vercel.app"])("gates anonymous documents and RSC on %s while preserving the destination", async (host) => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");
    makeRequest("/");
    const url = `https://${host}/replications?viewer=infinite-torus-space&type=video`;
    const document = await middleware(new NextRequest(url, { headers: { host } }));
    const destination = new URL(document.headers.get("location")!);
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("callbackUrl")).toBe("/replications?viewer=infinite-torus-space&type=video");
    const rsc = await middleware(new NextRequest(url, { headers: { host, rsc: "1" } }));
    expect(rsc.status).toBe(401);
    expect(await rsc.json()).toEqual({ error: "Authentication required" });
    expect(rsc.headers.get("cache-control")).toContain("private, no-store");
  });

  it("lets only the exact revalidation POST reach its route-level token gate without a session", async () => {
    mocks.getToken.mockResolvedValue(null);
    // Load through the same resettable module boundary as the flavor-policy cases below.
    const { middleware } = await import("./middleware");
    makeRequest("/");
    const host = "dev.dose.wiki";
    const response = await middleware(new NextRequest(
      `https://${host}/api/dev/revalidate-article`,
      { method: "POST", headers: { host } },
    ));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    for (const [path, method] of [
      ["/api/dev/revalidate-article", "GET"],
      ["/api/dev/revalidate-article/extra", "POST"],
      ["/api/dev/other", "POST"],
    ]) {
      expect((await middleware(new NextRequest(
        `https://${host}${path}`, { method, headers: { host } },
      ))).status).toBe(401);
    }
  });

  it("lets only the exact publication-delivery cron GET reach its CRON_SECRET gate without a session", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");
    makeRequest("/");
    const host = "dev.dose.wiki";
    const response = await middleware(new NextRequest(
      `https://${host}/api/cron/publication-delivery`,
      { method: "GET", headers: { host } },
    ));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(new NextRequest(
      `https://${host}/api/cron/translation-refresh`, { method: "GET", headers: { host } },
    ))).headers.get("x-middleware-next")).toBe("1");
    for (const [path, method] of [
      ["/api/cron/publication-delivery", "POST"],
      ["/api/cron/publication-delivery/extra", "GET"],
      ["/api/cron/translation-refresh", "POST"],
      ["/api/cron/other", "GET"],
    ]) {
      expect((await middleware(new NextRequest(
        `https://${host}${path}`, { method, headers: { host } },
      ))).status).toBe(401);
    }
  });

  it("does not expose article revalidation on public builds or unlisted editor hosts", async () => {
    mocks.getToken.mockResolvedValue(null);
    // Load through the same resettable module boundary as the flavor-policy cases below.
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const publicResponse = await middleware(new NextRequest(
      "https://dose.wiki/api/dev/revalidate-article",
      { method: "POST", headers: { host: "dose.wiki" } },
    ));
    expect(publicResponse.headers.get("location")).toBe("https://dose.wiki/");
    makeRequest("/");
    const closedResponse = await middleware(new NextRequest(
      "https://unknown-preview.vercel.app/api/dev/revalidate-article",
      { method: "POST", headers: { host: "unknown-preview.vercel.app" } },
    ));
    expect(closedResponse.status).toBe(503);
  });

  it("lets the service crons through the host gate on the deployment URL Vercel invokes", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");
    makeRequest("/");
    const host = "dosewiki-admin-abc123-team.vercel.app";
    for (const path of ["/api/cron/translation-refresh", "/api/cron/publication-delivery"]) {
      const response = await middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }));
      expect(response.status).toBe(200);
    }
    const other = await middleware(new NextRequest(`https://${host}/api/dev/article-field`, { headers: { host } }));
    expect(other.status).toBe(503);
    const post = await middleware(new NextRequest(`https://${host}/api/cron/translation-refresh`, { method: "POST", headers: { host } }));
    expect(post.status).toBe(503);
  });

  it("does not treat a dynamic editor path with an asset extension as sign-in bootstrap", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/dev/articles.js"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
    expect((await middleware(makeRequest("/_next/static/chunks/auth.js"))).status).toBe(200);
  });

  it("denies viewer data navigation but keeps account bootstrap reachable", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("./middleware");
    const request = makeRequest("/fentanyl");
    request.headers.set("rsc", "1");
    expect((await middleware(request)).status).toBe(403);
    for (const pathname of ["/sign-in", "/api/auth/session", "/api/auth/callback/credentials", "/api/auth/signout", "/invite", "/reset-password"]) {
      expect((await middleware(makeRequest(pathname))).status).toBe(200);
    }
  });


  it("never serves an editor artifact through a public or unlisted deployment alias", async () => {
    const { middleware } = await import("./middleware");
    makeRequest("/");
    for (const host of ["dose.wiki", "dose.wiki.", "www.dose.wiki", "effectindex.com", "unknown-preview.vercel.app"]) {
      const response = await middleware(new NextRequest(`https://${host}/_next/static/chunks/editor.js`, { headers: { host } }));
      expect(response.status).toBe(503);
    }
  });

  it("keeps editor APIs and handoffs off public-build preview aliases too", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "public-preview.vercel.app";
    const response = await middleware(new NextRequest(`https://${host}/dev/articles`, { headers: { host } }));
    expect(response.headers.get("location")).toBe("https://dev.dose.wiki/dev/articles");
    const apiResponse = await middleware(new NextRequest(`https://${host}/api/auth/session`, { headers: { host } }));
    expect(apiResponse.headers.get("location")).toBe(`https://${host}/`);
  });
  it("redirects anonymous /dev requests to sign in", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev",
    );
  });

  it("protects the legacy Theme Lab workbench route", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/dev/themes"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev%2Fthemes",
    );
    expect(mocks.getToken).toHaveBeenCalledOnce();
  });

  it("enforces the admin browser policy on protected-route redirects", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    try {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/dev"));
    const csp = response.headers.get("content-security-policy") ?? "";

    // Match the middleware's resettable flavor-module boundary after its env setup.
    const { buildThemeBootstrapScript } = await import("@/theme");
    const { SITE_FLAVOR_CONFIGS } = await import("@/config/siteFlavor");
    const scriptHash = (script: string) =>
      `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
    const scriptPolicy = csp.split(";").map((directive) => directive.trim())
      .find((directive) => directive.startsWith("script-src "));
    expect(scriptPolicy?.split(/\s+/)).toEqual([
      "script-src",
      "'self'",
      expect.stringMatching(/^'nonce-[A-Za-z0-9+/_-]+'$/),
      scriptHash(buildZodJitlessBootstrapScript()),
      scriptHash(buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki)),
      scriptHash(themeLabBootstrap.script),
      "'wasm-unsafe-eval'",
    ]);
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
    } finally {
      vi.stubEnv("NODE_ENV", previousNodeEnv);
      vi.resetModules();
    }
  });

  it("uses the nonce-free inline policy on public documents", async () => {
    const { middleware } = await import("./middleware");

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
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev%2Fprofile",
    );
  });

  // The shell, not the middleware, disables tabs above the member's role.
  it.each(["/dev/profile", "/dev/banners"])(
    "allows authenticated contributors into %s",
    async (path) => {
      mocks.getToken.mockResolvedValue({
        email: "member@example.com",
        role: "contributor",
      });
      const { middleware } = await import("./middleware");

      const response = await middleware(makeRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  // `viewer` is a legacy stored value, not a member role: it opens nothing, not even the profile.
  it.each([
    ["/dev", "%2Fdev"],
    ["/dev/profile", "%2Fdev%2Fprofile"],
  ])("redirects viewers away from %s", async (path, encoded) => {
    mocks.getToken.mockResolvedValue({
      email: "viewer@example.com",
      role: "viewer",
    });
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest(path));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://dosewiki-admin.vercel.app/unauthorized?from=${encoded}`,
    );
  });

  it("allows editors into the editor shell", async () => {
    mocks.getToken.mockResolvedValue({
      email: "editor@example.com",
      role: "editor",
    });
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(
      /^[A-Za-z0-9+/_-]+$/,
    );
  });

  it("serves public dose.wiki article routes at their permanent paths", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows an imported replication detail route through for on-demand generation", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest(
        "/replications/another-type-of-replication-does-this-count-gt0sy7",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites an unknown replication slug to the real not-found route", async () => {
    const { middleware } = await import("./middleware");

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
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=infinite-torus-space&type=video"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/replications/viewer/infinite-torus-space?viewer=infinite-torus-space&type=video",
    );
  });

  it("leaves client-side gallery navigations on the static route", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=infinite-torus-space", { rsc: "1" }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("ignores a viewer value outside the slug grammar", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/replications?viewer=%25%24"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("hides the viewer rewrite target from direct requests", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/replications/viewer/infinite-torus-space"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/_flavor-gated/not-found",
    );
  });

  it("rewrites an unknown root slug instead of serving a soft substance 404", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/definitely-not-a-real-substance-zzzz"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://dose.wiki/_flavor-gated/not-found",
    );
  });

  it("serves a locale host's substance article from the mirror route", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    const response = await middleware(new NextRequest(`https://${host}/fentanyl`, { headers: { host } }));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://zh.dose.wiki/zh/fentanyl");
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("localizes the about index path and keeps unknown slugs on a locale host in English or 404", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    const about = await middleware(new NextRequest(`https://${host}/about`, { headers: { host } }));
    expect(about.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/about`);
    expect(about.headers.get("location")).toBeNull();

    const unknown = await middleware(new NextRequest(`https://${host}/not-a-substance-zzzz`, { headers: { host } }));
    expect(unknown.headers.get("x-middleware-rewrite")).toBe("https://zh.dose.wiki/zh/unroutable/missing");
  });

  it("lets /glossary through the slug gate on the public host and mirrors it on a locale host", async () => {
    const { middleware } = await import("./middleware");
    const english = await middleware(makePublicRequest("/glossary"));
    expect(english.headers.get("x-middleware-rewrite")).toBeNull();
    expect(english.headers.get("location")).toBeNull();

    const host = "zh.dose.wiki";
    const mirror = await middleware(new NextRequest(`https://${host}/glossary`, { headers: { host } }));
    expect(mirror.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/glossary`);
  });

  it("serves a locale host's library archive from the mirror routes", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    const index = await middleware(new NextRequest(`https://${host}/articles`, { headers: { host } }));
    expect(index.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/articles`);
    expect(index.headers.get("location")).toBeNull();

    const article = await middleware(new NextRequest(`https://${host}/articles/dxm`, { headers: { host } }));
    expect(article.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/articles/dxm`);
    expect(article.headers.get("location")).toBeNull();
    expect(article.headers.get("x-robots-tag")).toBeNull();
  });

  it("serves a locale host's replications section from the mirror routes", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    const index = await middleware(new NextRequest(`https://${host}/replications`, { headers: { host } }));
    expect(index.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/replications`);
    expect(index.headers.get("location")).toBeNull();

    const audio = await middleware(new NextRequest(`https://${host}/replications/audio`, { headers: { host } }));
    expect(audio.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/replications/audio`);

    const viewer = await middleware(
      new NextRequest(`https://${host}/replications?viewer=infinite-torus-space&type=video`, { headers: { host } }),
    );
    expect(viewer.headers.get("x-middleware-rewrite")).toBe(
      `https://${host}/zh/replications/viewer/infinite-torus-space?viewer=infinite-torus-space&type=video`,
    );

    const permalink = await middleware(
      new NextRequest(`https://${host}/replications/another-type-of-replication-does-this-count-gt0sy7`, { headers: { host } }),
    );
    expect(permalink.headers.get("x-middleware-rewrite")).toBe(
      `https://${host}/zh/replications/another-type-of-replication-does-this-count-gt0sy7`,
    );
    expect(permalink.headers.get("location")).toBeNull();
    expect(permalink.headers.get("x-robots-tag")).toBeNull();

    const artist = await middleware(new NextRequest(`https://${host}/replications/artist/symmetric-vision`, { headers: { host } }));
    expect(artist.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/replications/artist/symmetric-vision`);
    expect(artist.headers.get("location")).toBeNull();

    const unknown = await middleware(
      new NextRequest(`https://${host}/replications/definitely-not-a-real-replication-zzzz`, { headers: { host } }),
    );
    expect(unknown.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/unroutable/missing`);
  });

  it("localizes substance category destinations without changing their App Paths or query state", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    for (const { slug } of SUBSTANCE_INDEX_VIEW_PARAMS) {
      const path = `/substances/group/${slug}?sort=name&query=amine`;
      const response = await middleware(
        new NextRequest(`https://${host}${path}`, { headers: { host } }),
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `https://${host}/zh${path}`,
      );
      expect(response.headers.get("location")).toBeNull();
    }

    for (const path of [
      "/category/psychedelic?sort=name",
      "/chemical-classes?view=tree",
      "/chemical-classes/tryptamine?view=structures",
    ]) {
      const response = await middleware(
        new NextRequest(`https://${host}${path}`, { headers: { host } }),
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `https://${host}/zh${path}`,
      );
      expect(response.headers.get("location")).toBeNull();
    }

    for (const path of [
      "/substances/group/stimulant?sort=name",
      "/category/psychedelic?sort=name",
      "/chemical-classes?view=tree",
      "/chemical-classes/tryptamine?view=structures",
    ]) {
      const response = await middleware(makePublicRequest(path));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("serves a locale host's effect index views, psychoactive summaries, and search from the mirror routes", async () => {
    const { middleware } = await import("./middleware");
    makePublicRequest("/");
    const host = "zh.dose.wiki";

    for (const view of ["sensory", "cognitive", "physical", "library", "info"]) {
      const response = await middleware(new NextRequest(`https://${host}/effects/group/${view}`, { headers: { host } }));
      expect(response.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/effects/group/${view}`);
      expect(response.headers.get("location")).toBeNull();
    }

    const summary = await middleware(
      new NextRequest(`https://${host}/psychoactive/psychedelic/cognitive`, { headers: { host } }),
    );
    expect(summary.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/psychoactive/psychedelic/cognitive`);
    expect(summary.headers.get("location")).toBeNull();

    const singleSegmentSummary = await middleware(
      new NextRequest(`https://${host}/psychoactive/deliriant`, { headers: { host } }),
    );
    expect(singleSegmentSummary.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/psychoactive/deliriant`);

    const search = await middleware(new NextRequest(`https://${host}/search?q=ketamine`, { headers: { host } }));
    expect(search.headers.get("x-middleware-rewrite")).toBe(`https://${host}/zh/search?q=ketamine`);
    expect(search.headers.get("location")).toBeNull();
    expect(search.headers.get("x-robots-tag")).toBeNull();

    const englishView = await middleware(makePublicRequest("/effects/group/library"));
    expect(englishView.headers.get("x-middleware-rewrite")).toBeNull();
    const englishSummary = await middleware(makePublicRequest("/psychoactive/psychedelic/cognitive"));
    expect(englishSummary.headers.get("x-middleware-rewrite")).toBeNull();
    const englishSearch = await middleware(makePublicRequest("/search?q=ketamine"));
    expect(englishSearch.headers.get("x-middleware-rewrite")).toBeNull();
    expect(englishSearch.headers.get("location")).toBeNull();
  });

  it("hides the mirror route from direct requests on the English host", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/zh/fentanyl"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://dose.wiki/_flavor-gated/not-found");

    const replications = await middleware(makePublicRequest("/zh/replications"));
    expect(replications.headers.get("x-middleware-rewrite")).toBe("https://dose.wiki/_flavor-gated/not-found");
  });

  it("serves the launched homepage at the public root", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects old preview substance aliases directly to their canonical path", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/preview/psilocybin"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/psilocybin-mushrooms",
    );
  });

  it("redirects old preview search paths directly to canonical search URLs", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/preview/search/lsd"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/search?q=lsd",
    );
  });

  it("redirects the old preview homepage to the launched root", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/preview/home"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
  });

  it("preserves queries while retiring preview section addresses", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/preview/substances?tab=common"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dose.wiki/substances?tab=common",
    );
  });

  it("hands a public-host editor link to the editor origin", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/dev/articles"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/dev/articles",
    );
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("preserves the query across editor handoff", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/sign-in?callbackUrl=%2Fdev"),
    );

    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/sign-in?callbackUrl=%2Fdev",
    );
  });

  it("hands off old preview editor addresses while dropping the prefix", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/preview/dev/articles"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dev.dose.wiki/dev/articles",
    );
  });

  it("redirects old preview addresses to direct routes on the editor host", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/preview/dev/articles"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/dev/articles",
    );
  });

  it("keeps credentialed APIs off the public origin", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/api/dev/articles"));

    expect(response.headers.get("location")).toBe("https://dose.wiki/");
  });

  it("serves public client APIs directly without a document CSP", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/api/search-suggestions?q=mdma"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("serves the versioned public API directly", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makePublicRequest("/api/v1/substances?limit=25"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/docs/license",
    "/api/csp-report",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/SubstanceIndex.json",
  ])("serves launched public endpoint %s directly", async (path) => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    // A rewrite to the 404 target is also a 200 here; only the header tells.
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rejects an unknown root slug that is not a file", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/not-a-substance"));

    expect(response.headers.get("x-middleware-rewrite")).toContain("/");
  });

  it.each(["/invite", "/reset-password"])("serves the account page %s on the editor host", async (path) => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not override database-backed SVG route content policies", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/api/molecules/2c-b"));

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("covers the public analytics proxy with self without an invalid path source", async () => {
    const { middleware } = await import("./middleware");

    const publicResponse = await middleware(makePublicRequest("/"));
    const adminResponse = await middleware(makeRequest("/fentanyl"));

    expect(publicResponse.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(publicResponse.headers.get("content-security-policy")).not.toContain("/ingest");
    expect(adminResponse.headers.get("content-security-policy")).not.toContain("/ingest");
  });

  it("serves public static assets directly", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/icon-512.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows authenticated article reads on the editor host without shared caching", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it("redirects high-volume substance aliases on the full app host", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/psilocybin"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/psilocybin-mushrooms",
    );
  });

  it("emits a real 301 for retired Artist Page keys", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makeRequest("/replications/artist/anonymous"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/replications/artist/unknown",
    );
  });

  it("forwards the retired StingrayZ Artist Page to Symmetric Vision", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(
      makeRequest("/replications/artist/stingrayz"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/replications/artist/symmetric-vision",
    );
  });

  it("redirects legacy search path queries to noindex search URLs on the full app host", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/search/lsd%20dosage"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/search?q=lsd+dosage",
    );
  });
});

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
