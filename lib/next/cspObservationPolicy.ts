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

const TURNSTILE_SOURCE = "https://challenges.cloudflare.com";

export const ZOD_JITLESS_BOOTSTRAP_CSP_HASH =
  "'sha256-iBFdfuGT0De586Hk5F1vEPXiYlo70p9qtlKCG8zhnV4='";

export const THEME_BOOTSTRAP_CSP_HASHES: Readonly<Record<SiteFlavor, string>> = {
  dosewiki: "'sha256-frc8twF2gFze0mkO3wlfqK5kFaXx0cgbt23utlLECO4='",
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
      "'wasm-unsafe-eval'",
    ];
  } else {
    scriptSources = [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      TURNSTILE_SOURCE,
    ];
  }
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }
  const connectSources = [
    "'self'",
    ...ICONIFY_API_SOURCES,
    ...REFERENCE_METADATA_API_SOURCES,
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
    "img-src 'self' blob: data: https:",
    "manifest-src 'self'",
    "media-src 'self' blob: data: https:",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    `report-uri ${CSP_REPORT_ENDPOINT}`,
  ];

  if (!isDevelopment && !canServeOverPlainHttp(normalizedHost)) {
    directives.push("upgrade-insecure-requests");
  }

  return [
    { key: CSP_ENFORCEMENT_HEADER, value: directives.join("; ") },
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
