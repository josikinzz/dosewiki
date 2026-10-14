// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import themeLabBootstrap from "@/features/theme-lab/themeLabBootstrap.generated.json";
import { buildThemeBootstrapScript } from "@/theme";
import { CSP_ENFORCEMENT_HEADER, getBrowserSecurityHeaders } from "./cspObservationPolicy";
import { buildZodJitlessBootstrapScript } from "./zodBrowserPolicy";

const NONCE = "test-nonce-123";

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
  it("allows React debugging eval only in development, on public and editor routes", () => {
    for (const pathname of ["/substances", "/dev/articles"]) {
      for (const isDevelopment of [true, false]) {
        const csp = headerValue(getBrowserSecurityHeaders({
          host: "localhost:3001",
          pathname,
          nonce: NONCE,
          isDevelopment,
        }), CSP_ENFORCEMENT_HEADER);
        expect(directiveValue(csp, "script-src").split(/\s+/).includes("'unsafe-eval'"))
          .toBe(isDevelopment);
      }
    }
  });

  it("uses a nonce and the deterministic bootstrap hashes on dev routes", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      pathname: "/dev/articles",
      nonce: NONCE,
      isDevelopment: false,
    });
    const scriptPolicy = directiveValue(
      headerValue(headers, CSP_ENFORCEMENT_HEADER),
      "script-src",
    );

    expect(scriptPolicy.split(/\s+/)).toEqual([
      "script-src",
      "'self'",
      `'nonce-${NONCE}'`,
      scriptHash(buildZodJitlessBootstrapScript()),
      scriptHash(buildThemeBootstrapScript()),
      ...(SITE_FLAVOR === "dosewiki" ? [scriptHash(themeLabBootstrap.script)] : []),
      "'wasm-unsafe-eval'",
    ]);
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
  });

  it("requires a safe nonce only for dev routes", () => {
    expect(() =>
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/dev",
        isDevelopment: false,
      }),
    ).toThrow("Dev route browser security policy requires a nonce.");
    expect(() =>
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
        nonce: "unsafe nonce",
        isDevelopment: false,
      }),
    ).not.toThrow();
  });

  it("allows signed R2 uploads only on editor routes without retaining Postgres connections", () => {
    const uploadOrigin = "https://abc123.r2.cloudflarestorage.com";
    for (const pathname of ["/", "/dev/replications"]) {
      const csp = headerValue(
        getBrowserSecurityHeaders({
          host: "dosewiki-admin.vercel.app",
          pathname,
          nonce: NONCE,
          r2UploadOrigin: uploadOrigin,
          isDevelopment: false,
        }),
        CSP_ENFORCEMENT_HEADER,
      );
      const sources = directiveValue(csp, "connect-src").split(/\s+/);
      expect(sources.includes(uploadOrigin)).toBe(pathname.startsWith("/dev"));
      expect(sources).toContain("'self'");
      expect(sources.some((source) => source.includes("data."))).toBe(false);
      expect(sources.some((source) => source.includes("*"))).toBe(false);
    }
  });

  it("rejects malformed or out-of-scope R2 connection configuration", () => {
    for (const r2UploadOrigin of [
      "not a URL",
      "https://example.com",
      "http://abc123.r2.cloudflarestorage.com",
      "https://user:password@abc123.r2.cloudflarestorage.com",
      "https://abc123.r2.cloudflarestorage.com/bucket",
    ]) {
      const csp = headerValue(
        getBrowserSecurityHeaders({
          host: "dosewiki-admin.vercel.app",
          pathname: "/dev/replications",
          nonce: NONCE,
          r2UploadOrigin,
          isDevelopment: false,
        }),
        CSP_ENFORCEMENT_HEADER,
      );
      expect(directiveValue(csp, "connect-src")).not.toContain("cloudflarestorage.com");
      expect(directiveValue(csp, "connect-src")).not.toContain("example.com");
    }
  });

  it("sets the complete browser header baseline", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dosewiki-admin.vercel.app",
      pathname: "/2c-b",
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
});
