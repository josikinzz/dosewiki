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

function makePublicRequest(path: string): NextRequest {
  return new NextRequest(
    new Request(`https://dose.wiki${path}`, {
      headers: { host: "dose.wiki" },
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
    expect(csp).not.toContain("analytics.dose.wiki");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("x-nonce")).toBeNull();
  });

  it("uses the nonce-free inline policy on public documents", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/fentanyl"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
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
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows authenticated viewers into /dev/profiles", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profiles"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects viewers away from the editor shell without editor privileges", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/unauthorized?from=%2Fdev",
    );
  });

  it("allows editors into the editor shell", async () => {
    mocks.getToken.mockResolvedValue({ email: "editor@example.com", role: "editor" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(
      /^[A-Za-z0-9+/_-]+$/,
    );
  });

  it("redirects public dose.wiki article routes to the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/fentanyl"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("keeps public dose.wiki substance aliases behind the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/psilocybin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("keeps public dose.wiki legacy search paths behind the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/search/lsd"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("redirects non-public public-host API routes to the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/api/search-suggestions?q=mdma"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows only the versioned public API through the construction gate", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/api/v1/substances?limit=25"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows the public license page linked by the API", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/docs/license"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows CSP observation reports without exposing the public application", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/api/csp-report"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("does not override database-backed SVG route content policies", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/api/molecules/2c-b"));

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows analytics only in the exact public-host browser policy", async () => {
    const { middleware } = await import("../middleware");

    const publicResponse = await middleware(makePublicRequest("/"));
    const adminResponse = await middleware(makeRequest("/fentanyl"));

    expect(publicResponse.headers.get("content-security-policy")).toContain(
      "https://analytics.dose.wiki",
    );
    expect(adminResponse.headers.get("content-security-policy")).not.toContain(
      "analytics.dose.wiki",
    );
  });

  it("allows public dose.wiki static assets for the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/icon-512.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows the supporter mark the construction homepage renders", async () => {
    const { middleware } = await import("../middleware");

    // Not decoration: the holding page is the homepage, so it carries the footer's
    // supporter credit, and that mark is a CSS mask. A redirect here does not degrade to a
    // missing image — the lockup prints as a solid block.
    const response = await middleware(
      makePublicRequest("/supporters/mindstate-design-labs.webp"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it.each(["/robots.txt", "/sitemap.xml"])(
    "allows public dose.wiki crawler policy endpoint %s during construction",
    async (path) => {
      const { middleware } = await import("../middleware");

      const response = await middleware(makePublicRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(mocks.getToken).not.toHaveBeenCalled();
    },
  );

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
    expect(response.headers.get("location")).toBe("https://dosewiki-admin.vercel.app/psilocybin-mushrooms");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("redirects legacy search path queries to noindex search URLs on the full app host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/search/lsd%20dosage"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://dosewiki-admin.vercel.app/search?q=lsd+dosage");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
