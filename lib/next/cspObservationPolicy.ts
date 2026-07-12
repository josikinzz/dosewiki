import { isApprovedAnalyticsHost } from "./analyticsHostPolicy";
import { normalizeHost } from "./publicConstructionPolicy";

export const CSP_ENFORCEMENT_HEADER = "Content-Security-Policy";
export const CSP_NONCE_REQUEST_HEADER = "x-nonce";
export const CSP_REPORT_ENDPOINT = "/api/csp-report";

export interface BrowserSecurityPolicyInput {
  host: string | null | undefined;
  nonce: string;
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
  nonce,
  convexUrl,
  isDevelopment,
}: BrowserSecurityPolicyInput): ResponseHeader[] {
  assertSafeNonce(nonce);

  const normalizedHost = normalizeHost(host);
  const allowsPublicAnalytics = isApprovedAnalyticsHost(host);
  const analyticsSource = "https://analytics.dose.wiki";
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    // RDKit.js compiles the same-origin molecule editor WASM module in-browser.
    "'wasm-unsafe-eval'",
    ...(allowsPublicAnalytics ? [analyticsSource] : []),
  ];
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
    "frame-src 'none'",
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
