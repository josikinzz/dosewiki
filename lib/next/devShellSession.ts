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
  screenshotViewer: boolean;
};

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
