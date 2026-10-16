import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import themeLabBootstrap from "@/features/theme-lab/themeLabBootstrap.generated.json";
import { buildZodJitlessBootstrapScript } from "@server/next/zodBrowserPolicy";
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
    expect((await middleware(new NextRequest(
      `https://${host}/api/cron/translation-bulk`, { method: "GET", headers: { host } },
    ))).headers.get("x-middleware-next")).toBe("1");
    for (const [path, method] of [
      ["/api/cron/publication-delivery", "POST"],
      ["/api/cron/publication-delivery/extra", "GET"],
      ["/api/cron/translation-refresh", "POST"],
      ["/api/cron/translation-bulk", "POST"],
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
    for (const path of ["/api/cron/translation-refresh", "/api/cron/translation-bulk", "/api/cron/publication-delivery"]) {
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

  it("keeps credentialed APIs off the public origin", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makePublicRequest("/api/dev/articles"));

    expect(response.headers.get("location")).toBe("https://dose.wiki/");
  });

  it("allows authenticated article reads on the editor host without shared caching", async () => {
    const { middleware } = await import("./middleware");

    const response = await middleware(makeRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });
});

describe("local dev screenshot viewer", () => {
  const VIEWER_ENV = ["NODE_ENV", "DEV_SCREENSHOT_VIEWER", "DATA_WRITES_FROZEN"] as const;
  let previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    previous = Object.fromEntries(VIEWER_ENV.map((key) => [key, process.env[key]]));
    mocks.getToken.mockReset().mockResolvedValue(null);
    vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SCREENSHOT_VIEWER", "1");
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
  });

  afterEach(() => {
    for (const key of VIEWER_ENV) vi.stubEnv(key, previous[key]);
    vi.resetModules();
  });

  function localRequest(path: string, init: { method?: string; host?: string } = {}) {
    const host = init.host ?? "127.0.0.1:3100";
    return new NextRequest(`http://${host}${path}`, { method: init.method ?? "GET", headers: { host } });
  }

  it("serves /dev documents without a session only when every condition holds", async () => {
    const { middleware } = await import("./middleware");
    for (const path of ["/dev", "/dev/replications", "/dev/kit"]) {
      const response = await middleware(localRequest(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("keeps mutations on /dev behind the sign-in gate", async () => {
    const { middleware } = await import("./middleware");
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await middleware(localRequest("/dev/replications", { method }));
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
    }
  });

  it.each([
    ["the opt-in is unset", { DEV_SCREENSHOT_VIEWER: undefined }],
    ["the write freeze is off", { DATA_WRITES_FROZEN: undefined }],
  ])("redirects to sign-in when %s", async (_label, overrides) => {
    for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
    const { middleware } = await import("./middleware");
    const response = await middleware(localRequest("/dev/replications"));
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-in");
  });

  it("refuses a non-loopback Host", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(localRequest("/dev/replications", { host: "192.168.1.20:3100" }));
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("is off under NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { middleware } = await import("./middleware");
    for (const host of ["127.0.0.1:3100", "localhost:3000"]) {
      const response = await middleware(localRequest("/dev/replications", { host }));
      expect(response.headers.get("x-middleware-next")).toBeNull();
    }
  });
});
