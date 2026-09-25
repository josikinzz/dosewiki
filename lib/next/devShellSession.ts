import "server-only";

import { headers } from "next/headers";
import type { Session } from "next-auth";
import {
  buildDevScreenshotViewerSession,
  isDevScreenshotViewerEnabled,
  isLoopbackRequest,
} from "../auth/devScreenshotViewer";
import { getRequestSession } from "./requestSession";

export type DevShellSession = {
  session: Session | null;
  /** True only for the local screenshot viewer; the shell must skip private reads. */
  screenshotViewer: boolean;
};

/**
 * The session a `/dev` document renders with. A real Auth.js session always
 * wins. Without one, the local screenshot viewer (see
 * `lib/auth/devScreenshotViewer.ts`) gets a synthetic, presentation-only
 * session so the rail renders every tab unlocked.
 *
 * Only `/dev` layouts and pages call this. API routes and server actions keep
 * reading the real session through `requireRoleSession`, so the synthetic role
 * never authorizes a read or a write.
 */
export async function getDevShellSession(): Promise<DevShellSession> {
  const session = await getRequestSession();
  if (session || !isDevScreenshotViewerEnabled()) {
    return { session, screenshotViewer: false };
  }
  if (!isLoopbackRequest(await headers())) {
    return { session: null, screenshotViewer: false };
  }
  return { session: buildDevScreenshotViewerSession(), screenshotViewer: true };
}
