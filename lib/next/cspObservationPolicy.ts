import { SITE_FLAVOR, type SiteFlavor } from "../../src/config/siteFlavor";
import { isApprovedAnalyticsHost } from "./analyticsHostPolicy";
import { normalizeHost } from "./publicConstructionPolicy";

export const CSP_ENFORCEMENT_HEADER = "Content-Security-Policy";
export const CSP_NONCE_REQUEST_HEADER = "x-nonce";
export const CSP_REPORT_ENDPOINT = "/api/csp-report";

export interface BrowserSecurityPolicyInput {
  host: string | null | undefined;
  pathname: string;
  nonce?: string;
  convexUrl?: string | null;
  isDevelopment: boolean;
}

type ResponseHeader = { key: string; value: string };

const ICONIFY_API_SOURCES = [
  "https://api.iconify.design",
  "https://api.unisvg.com",
  "https://api.simplesvg.com",
];

const REFERENCE_METADATA_API_SOURCES = [
  "https://api.crossref.org",
  "https://eutils.ncbi.nlm.nih.gov",
];

// Cloudflare Turnstile (site-feedback captcha): its loader script plus the
// challenge iframe it renders. Allowlisted statically — public script-src and
// the shared frame-src — so the header stays deterministic and cacheable
// whether or not the deployment sets a site key.
const TURNSTILE_SOURCE = "https://challenges.cloudflare.com";

// Middleware defaults to the Edge runtime, so keep these precomputed rather
// than importing node:crypto. The policy test recomputes both from the exact
// script builders and fails if either deterministic script changes.
export const ZOD_JITLESS_BOOTSTRAP_CSP_HASH =
  "'sha256-iBFdfuGT0De586Hk5F1vEPXiYlo70p9qtlKCG8zhnV4='";

/**
 * Each flavor has a separate hash because the appearance bootstrap contains its publication
 * policy. A locked axis emits no storage key or validity table.
 *
 * dose.wiki resolves four axes from storage. Effect Index locks visual style, surfaces, and
 * accent. The policy test calculates each hash from the bootstrap builder and reports drift.
 */
export const THEME_BOOTSTRAP_CSP_HASHES: Readonly<Record<SiteFlavor, string>> = {
  dosewiki: "'sha256-mpsLiOFenRG+YGG4pGVYtcubUqnEVDf5EYMzed4GidY='",
  effectindex: "'sha256-3SzhNzHhUNUTkETme5uNe0eYZEn0Gojm83Wqi7e9EQc='",
};

export const THEME_BOOTSTRAP_CSP_HASH = THEME_BOOTSTRAP_CSP_HASHES[SITE_FLAVOR];

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function getConvexConnectionSources(convexUrl: string | null | undefined): string[] {
  if (!convexUrl) {
    return [];
  }

  try {
    const url = new URL(convexUrl);
    if (url.protocol === "https:") {
      return [url.origin, `wss://${url.host}`];
    }

    if (url.protocol === "http:" && isLocalHostname(url.hostname)) {
      return [url.origin, `ws://${url.host}`];
    }
  } catch {
    // A malformed runtime URL must not widen the browser connection policy.
  }

  return [];
}

function assertSafeNonce(nonce: string): void {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(nonce)) {
    throw new Error("CSP nonce contains characters that are not safe in a source expression.");
  }
}

export function shouldApplyDocumentCsp(pathname: string): boolean {
  return !pathname.startsWith("/api/");
}

export function getBrowserSecurityHeaders({
  host,
  pathname,
  nonce,
  convexUrl,
  isDevelopment,
}: BrowserSecurityPolicyInput): ResponseHeader[] {
  const normalizedHost = normalizeHost(host);
  const allowsPublicAnalytics = isApprovedAnalyticsHost(host);
  const analyticsSource = "https://analytics.dose.wiki";
  const isDevRoute = pathname.startsWith("/dev");
  let scriptSources: string[];

  if (isDevRoute) {
    if (!nonce) {
      throw new Error("Dev route browser security policy requires a nonce.");
    }
    assertSafeNonce(nonce);
    scriptSources = [
      "'self'",
      `'nonce-${nonce}'`,
      ZOD_JITLESS_BOOTSTRAP_CSP_HASH,
      THEME_BOOTSTRAP_CSP_HASH,
      // RDKit.js compiles the same-origin molecule editor WASM module in-browser.
      "'wasm-unsafe-eval'",
      ...(allowsPublicAnalytics ? [analyticsSource] : []),
    ];
  } else {
    scriptSources = [
      "'self'",
      "'unsafe-inline'",
      // RDKit.js compiles the same-origin molecule editor WASM module in-browser.
      "'wasm-unsafe-eval'",
      ...(allowsPublicAnalytics ? [analyticsSource] : []),
      // The /about/feedback Turnstile widget loads its script on public routes only.
      TURNSTILE_SOURCE,
    ];
  }
  const connectSources = [
    "'self'",
    ...getConvexConnectionSources(convexUrl),
    // @iconify/react uses these exact redundant API providers for uncached icons.
    ...ICONIFY_API_SOURCES,
    // QuickAddReferenceCard resolves DOI and PMID metadata from these exact APIs.
    ...REFERENCE_METADATA_API_SOURCES,
    ...(allowsPublicAnalytics ? [analyticsSource] : []),
  ];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `frame-src ${TURNSTILE_SOURCE}`,
    // Public article media is editor-curated but may live on many HTTPS origins.
    "img-src 'self' blob: data: https:",
    "manifest-src 'self'",
    "media-src 'self' blob: data: https:",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    // React style props and the editor's visual tools still require style attributes.
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    `report-uri ${CSP_REPORT_ENDPOINT}`,
  ];

  if (!isDevelopment && !isLocalHostname(normalizedHost)) {
    directives.push("upgrade-insecure-requests");
  }

  return [
    { key: CSP_ENFORCEMENT_HEADER, value: directives.join("; ") },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    },
  ];
}
