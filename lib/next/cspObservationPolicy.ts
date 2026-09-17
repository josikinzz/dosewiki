import { SITE_FLAVOR, type SiteFlavor } from "../../src/config/siteFlavor";
import themeLabBootstrapHash from "../../src/features/theme-lab/themeLabBootstrapHash.generated.json";
import { normalizeHost } from "./publicHostPolicy";
import {
  getReplicationEmbedFrameAncestors,
  isReplicationEmbedPath,
} from "./replicationEmbedPolicy";

export const CSP_ENFORCEMENT_HEADER = "Content-Security-Policy";
export const CSP_NONCE_REQUEST_HEADER = "x-nonce";
export const CSP_REPORT_ENDPOINT = "/api/csp-report";

export interface BrowserSecurityPolicyInput {
  host: string | null | undefined;
  pathname: string;
  nonce?: string;
  r2UploadOrigin?: string | null;
  isDevelopment: boolean;
}

export type ResponseHeader = { key: string; value: string };

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
 * dose.wiki resolves four colour coordinates from storage, falling back to
 * the current style-and-scheme combination's palette defaults, restores the
 * dyslexic-type attribute its font toggle may have saved, and injects
 * the guarded stylesheet links a saved preference needs pre-paint (light
 * scheme, Pro style — the chroma link is server-rendered, with the same guarded fallback
 * here). Effect Index locks visual style, surfaces, accent, and the font
 * axis, and its light default is server-rendered, so its script emits none
 * of that machinery. The policy test calculates each hash from the bootstrap
 * builder and reports drift.
 */
export const THEME_BOOTSTRAP_CSP_HASHES: Readonly<Record<SiteFlavor, string>> = {
  dosewiki: "'sha256-RNYl/e/Pio21VXLUpK7zMyLD+TX0vUxlRyfZPA6bsMs='",
  effectindex: "'sha256-eeEVo6InNy2QhM27eJaw7/nyhFIbb6ATzjYbCwJds0w='",
};

export const THEME_BOOTSTRAP_CSP_HASH = THEME_BOOTSTRAP_CSP_HASHES[SITE_FLAVOR];

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function canServeOverPlainHttp(hostname: string): boolean {
  return isLocalHostname(hostname) || isPrivateIpv4Hostname(hostname);
}

function getR2UploadOrigin(endpoint: string | null | undefined, isDevelopment: boolean): string | undefined {
  if (!endpoint) return;
  try {
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return;
    if (url.protocol === "https:" && /^[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(url.hostname)) {
      return url.origin;
    }
    if (isDevelopment && url.protocol === "http:" && isLocalHostname(url.hostname)) {
      return url.origin;
    }
  } catch {
    // Invalid upload configuration must not widen browser connection permissions.
  }
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
  r2UploadOrigin,
  isDevelopment,
}: BrowserSecurityPolicyInput): ResponseHeader[] {
  const normalizedHost = normalizeHost(host);
  const isDevRoute = pathname.startsWith("/dev");
  const isReplicationEmbed = isReplicationEmbedPath(pathname);
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
      ...(SITE_FLAVOR === "dosewiki" ? [themeLabBootstrapHash.hash] : []),
      // RDKit.js compiles the same-origin molecule editor WASM module in-browser.
      "'wasm-unsafe-eval'",
    ];
  } else {
    scriptSources = [
      "'self'",
      "'unsafe-inline'",
      // RDKit.js compiles the same-origin molecule editor WASM module in-browser.
      "'wasm-unsafe-eval'",
      // The /about/feedback Turnstile widget loads its script on public routes only.
      TURNSTILE_SOURCE,
    ];
  }
  // React's development debugging requires eval; deployed builds never allow it.
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }
  const connectSources = [
    "'self'",
    // @iconify/react uses these exact redundant API providers for uncached icons.
    ...ICONIFY_API_SOURCES,
    // QuickAddReferenceCard resolves DOI and PMID metadata from these exact APIs.
    ...REFERENCE_METADATA_API_SOURCES,
    // The approved-host PostHog client posts to the same-origin `/ingest`
    // reverse proxy. `'self'` already authorizes that path; a bare path is not
    // a valid CSP source expression and must not be emitted separately.
  ];
  const uploadOrigin = isDevRoute ? getR2UploadOrigin(r2UploadOrigin, isDevelopment) : undefined;
  if (uploadOrigin) connectSources.push(uploadOrigin);

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    `frame-ancestors ${isReplicationEmbed ? getReplicationEmbedFrameAncestors({ isDevelopment }) : "'none'"}`,
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

  if (!isDevelopment && !canServeOverPlainHttp(normalizedHost)) {
    directives.push("upgrade-insecure-requests");
  }

  return [
    { key: CSP_ENFORCEMENT_HEADER, value: directives.join("; ") },
    // X-Frame-Options cannot express a cross-origin allowlist; CSP owns the embed boundary.
    ...(isReplicationEmbed
      ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
      : [{ key: "X-Frame-Options", value: "DENY" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        + (isReplicationEmbed ? ", fullscreen=(self), autoplay=(self)" : ""),
    },
  ];
}
