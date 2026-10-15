import { isDataWriteFreezeActive } from "../runtime/dataWriteFreeze";
import { normalizeHost } from "../next/publicHostPolicy";

export const DEV_SCREENSHOT_VIEWER_ENV = "DEV_SCREENSHOT_VIEWER";

export const DEV_SCREENSHOT_VIEWER_EMAIL = "screenshot-viewer@localhost.invalid";

export const DEV_SCREENSHOT_VIEWER_AUTH_BASE_PATH = "/api/dev/screenshot-viewer";

export function buildDevScreenshotViewerSession(now: number = Date.now()) {
  return {
    user: {
      email: DEV_SCREENSHOT_VIEWER_EMAIL,
      name: "Screenshot viewer",
      role: "admin" as const,
    },
    expires: new Date(now + 60 * 60 * 1000).toISOString(),
  };
}

export type DevScreenshotViewerEnv = { readonly [key: string]: string | undefined };

type HeaderReader = { get(name: string): string | null };

function readProcessEnv(): DevScreenshotViewerEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    DEV_SCREENSHOT_VIEWER: process.env.DEV_SCREENSHOT_VIEWER,
    DATA_WRITES_FROZEN: process.env.DATA_WRITES_FROZEN,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export function isDevScreenshotViewerEnabled(env: DevScreenshotViewerEnv = readProcessEnv()): boolean {
  return env.NODE_ENV === "development"
    && env[DEV_SCREENSHOT_VIEWER_ENV] === "1"
    && isDataWriteFreezeActive(env)
    && !env.VERCEL
    && !env.VERCEL_ENV;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopbackAddress(value: string): boolean {
  const address = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return address === "::1"
    || address === "localhost"
    || /^127(?:\.\d{1,3}){3}$/.test(address)
    || /^::ffff:127(?:\.\d{1,3}){3}$/.test(address);
}

export function isLoopbackRequest(headers: HeaderReader): boolean {
  if (!LOOPBACK_HOSTS.has(normalizeHost(headers.get("host")))) {
    return false;
  }
  const forwardedFor = headers.get("x-forwarded-for");
  return forwardedFor === null || forwardedFor.split(",").every(isLoopbackAddress);
}

function isDevDocumentPath(pathname: string): boolean {
  return pathname === "/dev" || pathname.startsWith("/dev/");
}

export function admitsDevScreenshotViewer(
  input: { method: string; pathname: string; headers: HeaderReader },
  env: DevScreenshotViewerEnv = readProcessEnv(),
): boolean {
  const method = input.method.toUpperCase();
  return isDevScreenshotViewerEnabled(env)
    && (method === "GET" || method === "HEAD")
    && isDevDocumentPath(input.pathname)
    && isLoopbackRequest(input.headers);
}
