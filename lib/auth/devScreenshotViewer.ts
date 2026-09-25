/**
 * Local screenshot viewer for the `/dev` shell.
 *
 * Lets a headless browser on this machine open `/dev` documents without an
 * account so an agent can screenshot editor tooling during local development.
 * It is a presentation affordance, never an authorization: it admits only
 * GET/HEAD requests for `/dev` documents, and every `/api/*` route keeps its own
 * Auth.js session and database role check, so data reads and writes still
 * answer 401 for the viewer.
 *
 * All of these must hold, or the viewer does not exist:
 * - `NODE_ENV === "development"` (`next dev`; `next build` and `next start`
 *   always run as production);
 * - `DEV_SCREENSHOT_VIEWER=1`, an explicit opt-in;
 * - `DATA_WRITES_FROZEN` active, so every write boundary refuses regardless;
 * - no Vercel environment marker;
 * - a loopback `Host`, and a loopback `X-Forwarded-For` when one is present.
 *
 * Edge-safe: no Node imports, because middleware reads it.
 */
import { isDataWriteFreezeActive } from "../runtime/dataWriteFreeze";
import { normalizeHost } from "../next/publicHostPolicy";

export const DEV_SCREENSHOT_VIEWER_ENV = "DEV_SCREENSHOT_VIEWER";

/** Reserved `.invalid` address: it can never match a stored membership. */
export const DEV_SCREENSHOT_VIEWER_EMAIL = "screenshot-viewer@localhost.invalid";

/**
 * Where the viewer's client `SessionProvider` reads its session. The Auth.js
 * endpoint would answer "signed out" (there is no cookie), and React dev mode
 * remounts the provider, which drops the server-supplied session and refetches.
 */
export const DEV_SCREENSHOT_VIEWER_AUTH_BASE_PATH = "/api/dev/screenshot-viewer";

/**
 * Presentation-only session. The role unlocks the rail so every tab renders;
 * nothing server-side reads it, because API routes and server actions resolve
 * the Auth.js cookie through `requireRoleSession`, which this never touches.
 */
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

/** Literal reads so Next inlines each one for the Edge middleware bundle. */
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

/**
 * Both headers are client-supplied, so this is a guard against a proxied or
 * mistyped origin, not proof of locality. Binding `next dev` to 127.0.0.1 is
 * what keeps other machines out; the documented command does that.
 */
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

/** Middleware check: may this request skip the `/dev` sign-in redirect? */
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
