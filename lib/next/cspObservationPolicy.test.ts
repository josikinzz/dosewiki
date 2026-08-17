// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SITE_FLAVORS, SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { buildThemeBootstrapScript } from "@/theme";
import {
  CSP_ENFORCEMENT_HEADER,
  CSP_REPORT_ENDPOINT,
  THEME_BOOTSTRAP_CSP_HASH,
  THEME_BOOTSTRAP_CSP_HASHES,
  ZOD_JITLESS_BOOTSTRAP_CSP_HASH,
  getBrowserSecurityHeaders,
  shouldApplyDocumentCsp,
} from "./cspObservationPolicy";
import { buildZodJitlessBootstrapScript } from "./zodBrowserPolicy";

const NONCE = "test-nonce-123";
const CONVEX_URL = "https://careful-otter-123.convex.cloud";

function headerValue(
  headers: Array<{ key: string; value: string }>,
  key: string,
): string {
  const header = headers.find((candidate) => candidate.key === key);
  expect(header, `missing ${key}`).toBeDefined();
  return header?.value ?? "";
}

function directiveValue(csp: string, directive: string): string {
  return csp
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${directive} `)) ?? "";
}

function scriptHash(script: string): string {
  return `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
}

describe("browser security response policy", () => {
  it("leaves API content policies to their route handlers", () => {
    expect(shouldApplyDocumentCsp("/api/molecules/2c-b")).toBe(false);
    expect(shouldApplyDocumentCsp("/api/csp-report")).toBe(false);
    expect(shouldApplyDocumentCsp("/sign-in")).toBe(true);
    expect(shouldApplyDocumentCsp("/2c-b")).toBe(true);
  });

  it("uses a cache-compatible inline script policy on public routes", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      pathname: "/2c-b",
      convexUrl: CONVEX_URL,
      isDevelopment: false,
    });
    const csp = headerValue(headers, CSP_ENFORCEMENT_HEADER);

    const scriptPolicy = directiveValue(csp, "script-src");

    expect(scriptPolicy).toBe(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    );
    expect(csp).not.toContain("analytics.dose.wiki");
    expect(scriptPolicy).not.toContain("'nonce-");
    expect(scriptPolicy).not.toContain("'sha256-");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(csp).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
  });

  it("uses a nonce and the deterministic bootstrap hashes on dev routes", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      pathname: "/dev/articles",
      nonce: NONCE,
      convexUrl: CONVEX_URL,
      isDevelopment: false,
    });
    const scriptPolicy = directiveValue(
      headerValue(headers, CSP_ENFORCEMENT_HEADER),
      "script-src",
    );

    expect(scriptPolicy).toBe(
      `script-src 'self' 'nonce-${NONCE}' ${ZOD_JITLESS_BOOTSTRAP_CSP_HASH} ${THEME_BOOTSTRAP_CSP_HASH} 'wasm-unsafe-eval'`,
    );
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  it("keeps the dev bootstrap hashes synchronized with the rendered script builders", () => {
    expect(ZOD_JITLESS_BOOTSTRAP_CSP_HASH).toBe(
      scriptHash(buildZodJitlessBootstrapScript()),
    );
    // Zero-arg: the hash the *running* flavor actually serves must cover the script the
    // layout actually renders, so this stays self-checking under either build.
    expect(THEME_BOOTSTRAP_CSP_HASH).toBe(scriptHash(buildThemeBootstrapScript()));
  });

  it("keeps every flavor's theme bootstrap hash synchronized with that flavor's script", () => {
    for (const flavor of SITE_FLAVORS) {
      const script = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS[flavor]);

      expect(THEME_BOOTSTRAP_CSP_HASHES[flavor], flavor).toBe(scriptHash(script));
    }
  });

  it("requires a safe nonce only for dev routes", () => {
    expect(() =>
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/dev",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
    ).toThrow("Dev route browser security policy requires a nonce.");
    expect(() =>
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        nonce: "unsafe nonce",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
    ).not.toThrow();
  });

  it("allows public analytics only on the exact approved construction hosts", () => {
    const publicCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const lookalikeCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki.example.com",
        pathname: "/",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(publicCsp).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://analytics.dose.wiki",
    );
    expect(directiveValue(publicCsp, "connect-src")).toContain(
      "https://analytics.dose.wiki",
    );
    expect(lookalikeCsp).not.toContain("analytics.dose.wiki");
  });

  it("narrowly derives the HTTP and WebSocket Convex connection origins", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(csp).toContain(
      "connect-src 'self' https://careful-otter-123.convex.cloud wss://careful-otter-123.convex.cloud",
    );
    expect(csp).not.toContain("*.convex.cloud");
    expect(csp).not.toContain("https://*");
  });

  it("allows only the observed Iconify API redundancy endpoints", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(csp).toContain(
      "https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com",
    );
    expect(csp).not.toContain("*.iconify.design");
    expect(csp).not.toContain("*.unisvg.com");
    expect(csp).not.toContain("*.simplesvg.com");
  });

  it("allows the editor's exact citation metadata lookup origins", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const connectPolicy = directiveValue(csp, "connect-src");

    expect(connectPolicy).toContain("https://api.crossref.org");
    expect(connectPolicy).toContain("https://eutils.ncbi.nlm.nih.gov");
    expect(connectPolicy).not.toContain("*.crossref.org");
    expect(connectPolicy).not.toContain("*.ncbi.nlm.nih.gov");
  });

  it("sets the complete browser header baseline", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      pathname: "/2c-b",
      convexUrl: CONVEX_URL,
      isDevelopment: false,
    });
    const csp = headerValue(headers, CSP_ENFORCEMENT_HEADER);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "Permissions-Policy")).toBe(
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    );
  });

  it("allows the Turnstile script on public routes only, with its challenge frame", () => {
    const publicCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/about/feedback",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const devCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/dev",
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(directiveValue(publicCsp, "script-src")).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(directiveValue(publicCsp, "frame-src")).toBe(
      "frame-src https://challenges.cloudflare.com",
    );
    // The dev shell never renders the widget, so its script policy stays narrow.
    expect(directiveValue(devCsp, "script-src")).not.toContain(
      "https://challenges.cloudflare.com",
    );
  });

  it("retains inline styles for editor compatibility without relaxing dev scripts", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/dev",
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("does not upgrade localhost requests while enforcing the remaining policy", () => {
    const localCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "localhost:3000",
        pathname: "/2c-b",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const deployedCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(localCsp).not.toContain("upgrade-insecure-requests");
    expect(deployedCsp).toContain("upgrade-insecure-requests");
  });
});
