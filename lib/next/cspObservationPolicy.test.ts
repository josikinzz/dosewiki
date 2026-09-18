// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SITE_FLAVOR, SITE_FLAVORS, SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import themeLabBootstrap from "@/features/theme-lab/themeLabBootstrap.generated.json";
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
      isDevelopment: false,
    });
    const csp = headerValue(headers, CSP_ENFORCEMENT_HEADER);

    const scriptPolicy = directiveValue(csp, "script-src");

    expect(scriptPolicy).toBe(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    );
    expect(csp).not.toContain("posthog");
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

  it("keeps the dev bootstrap hashes synchronized with the rendered script builders", () => {
    expect(ZOD_JITLESS_BOOTSTRAP_CSP_HASH).toBe(
      scriptHash(buildZodJitlessBootstrapScript()),
    );
    // Zero-arg: the hash the *running* flavor actually serves must cover the script the
    // layout actually renders, so this stays self-checking under either build.
    expect(THEME_BOOTSTRAP_CSP_HASH).toBe(scriptHash(buildThemeBootstrapScript()));
  });

  it("hashes a zod bootstrap that merges into, rather than replaces, config another bundle installed", () => {
    // The script addresses `globalThis.__zod_globalConfig` by name, so binding a
    // sandbox as `globalThis` runs it without touching the test process global.
    const runBootstrap = (sandbox: { __zod_globalConfig?: Record<string, unknown> }) => {
      Function("globalThis", buildZodJitlessBootstrapScript())(sandbox);
      return sandbox.__zod_globalConfig;
    };

    expect(runBootstrap({})).toEqual({ jitless: true });
    expect(runBootstrap({ __zod_globalConfig: { customSetting: "keep" } })).toEqual({
      customSetting: "keep",
      jitless: true,
    });
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

  it("covers the same-origin analytics proxy with self without an invalid path source", () => {
    const publicCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/",
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const lookalikeCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki.example.com",
        pathname: "/",
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    const publicConnectSources = directiveValue(publicCsp, "connect-src").split(/\s+/);
    const lookalikeConnectSources = directiveValue(lookalikeCsp, "connect-src").split(/\s+/);

    expect(publicConnectSources).toContain("'self'");
    expect(publicConnectSources.some((source) => source.startsWith("/"))).toBe(false);
    expect(lookalikeConnectSources).toContain("'self'");
    expect(lookalikeConnectSources.some((source) => source.startsWith("/"))).toBe(false);
    expect(lookalikeCsp).not.toContain("/ingest");
  });

  it("keeps analytics out of the script policy on every host", () => {
    // PostHog is bundled and runs with `disable_external_dependency_loading`, so it never
    // injects a remote script. Analytics therefore buys no `script-src` entry anywhere, and
    // the script policy no longer varies by host at all.
    const scriptPolicyFor = (host: string) =>
      directiveValue(
        headerValue(
          getBrowserSecurityHeaders({
            host,
            pathname: "/",
            isDevelopment: false,
          }),
          CSP_ENFORCEMENT_HEADER,
        ),
        "script-src",
      );

    const approved = scriptPolicyFor("dose.wiki");

    expect(approved).toBe(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    );
    expect(approved).not.toContain("posthog");
    expect(scriptPolicyFor("dosewiki-admin.vercel.app")).toBe(approved);
    expect(scriptPolicyFor("dose.wiki.example.com")).toBe(approved);
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

  it("allows only the observed Iconify API redundancy endpoints", () => {
    const csp = headerValue(
      getBrowserSecurityHeaders({
        host: "dosewiki-admin.vercel.app",
        pathname: "/2c-b",
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

  it("delegates embed playback and fullscreen only on the exact document endpoint", () => {
    const headers = getBrowserSecurityHeaders({
      host: "dose.wiki",
      pathname: "/embed/replications",
      isDevelopment: false,
    });
    expect(directiveValue(headerValue(headers, CSP_ENFORCEMENT_HEADER), "frame-ancestors")).toBe(
      "frame-ancestors 'self' https://osmanthus.io https://www.osmanthus.io http://localhost:3000 http://127.0.0.1:3000",
    );
    expect(headers.find((header) => header.key === "X-Frame-Options")).toBeUndefined();
    expect(headerValue(headers, "X-Robots-Tag")).toContain("noindex");
    expect(headerValue(headers, "Permissions-Policy")).toContain("fullscreen=(self), autoplay=(self)");
    expect(headerValue(headers, "Permissions-Policy")).toContain("camera=()");

    for (const pathname of ["/embed/replications/child", "/embed/other", "/preview/embed/replications", "/dev"]) {
      const lockedHeaders = getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname,
        nonce: NONCE,
        isDevelopment: false,
      });
      expect(directiveValue(headerValue(lockedHeaders, CSP_ENFORCEMENT_HEADER), "frame-ancestors")).toBe(
        "frame-ancestors 'none'",
      );
      expect(headerValue(lockedHeaders, "X-Frame-Options")).toBe("DENY");
      expect(headerValue(lockedHeaders, "Permissions-Policy")).not.toContain("fullscreen=");
    }
  });

  it("allows the Turnstile script on public routes only, with its challenge frame", () => {
    const publicCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/about/feedback",
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );
    const devCsp = headerValue(
      getBrowserSecurityHeaders({
        host: "dose.wiki",
        pathname: "/dev",
        nonce: NONCE,
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
        isDevelopment: false,
      }),
      CSP_ENFORCEMENT_HEADER,
    );

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("keeps plain-HTTP local QA hosts usable without weakening deployed hosts", () => {
    const cspForHost = (host: string) =>
      headerValue(
        getBrowserSecurityHeaders({
          host,
          pathname: "/2c-b",
          isDevelopment: false,
        }),
        CSP_ENFORCEMENT_HEADER,
      );

    expect(cspForHost("localhost:3000")).not.toContain("upgrade-insecure-requests");
    expect(cspForHost("10.0.0.15:4823")).not.toContain("upgrade-insecure-requests");
    expect(cspForHost("172.31.4.8:4823")).not.toContain("upgrade-insecure-requests");
    expect(cspForHost("192.168.1.20:4823")).not.toContain("upgrade-insecure-requests");
    expect(cspForHost("8.8.8.8:4823")).toContain("upgrade-insecure-requests");
    expect(cspForHost("dosewiki-admin.vercel.app")).toContain(
      "upgrade-insecure-requests",
    );
  });
});
