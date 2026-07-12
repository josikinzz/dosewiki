// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CSP_ENFORCEMENT_HEADER,
  CSP_REPORT_ENDPOINT,
  getBrowserSecurityHeaders,
  shouldApplyDocumentCsp,
} from "./cspObservationPolicy";

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

describe("browser security response policy", () => {
  it("leaves API content policies to their route handlers", () => {
    expect(shouldApplyDocumentCsp("/api/molecules/2c-b")).toBe(false);
    expect(shouldApplyDocumentCsp("/api/csp-report")).toBe(false);
    expect(shouldApplyDocumentCsp("/sign-in")).toBe(true);
    expect(shouldApplyDocumentCsp("/2c-b")).toBe(true);
  });

  it("enforces a nonce-bound admin policy without analytics or unsafe script execution", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      nonce: NONCE,
      convexUrl: CONVEX_URL,
      isDevelopment: false,
    });
    const csp = headerValue(headers, CSP_ENFORCEMENT_HEADER);

    const scriptPolicy = directiveValue(csp, "script-src");

    expect(scriptPolicy).toBe(`script-src 'self' 'nonce-${NONCE}' 'wasm-unsafe-eval'`);
    expect(csp).not.toContain("analytics.dose.wiki");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(csp).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
  });

  it("allows public analytics only on the exact approved construction hosts", () => {
    const publicCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const lookalikeCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki.example.com",
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(publicCsp).toContain("script-src 'self' 'nonce-test-nonce-123' 'wasm-unsafe-eval' https://analytics.dose.wiki");
    expect(directiveValue(publicCsp, "connect-src")).toContain(
      "https://analytics.dose.wiki",
    );
    expect(lookalikeCsp).not.toContain("analytics.dose.wiki");
  });

  it("narrowly derives the HTTP and WebSocket Convex connection origins", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        nonce: NONCE,
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
        nonce: NONCE,
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
        nonce: NONCE,
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
      nonce: NONCE,
      convexUrl: CONVEX_URL,
      isDevelopment: false,
    });
    const csp = headerValue(headers, CSP_ENFORCEMENT_HEADER);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "Permissions-Policy")).toBe(
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    );
  });

  it("retains inline styles for framework and editor compatibility without relaxing scripts", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
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
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const deployedCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        nonce: NONCE,
        convexUrl: CONVEX_URL,
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(localCsp).not.toContain("upgrade-insecure-requests");
    expect(deployedCsp).toContain("upgrade-insecure-requests");
  });
});
